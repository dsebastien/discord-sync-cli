#!/usr/bin/env bun
/**
 * export-channel.ts - polite, resumable DiscordChatExporter driver.
 *
 * Exports a channel via the tyrrrz/discordchatexporter docker image, either
 * in date-bounded chunks with pauses in between, in one flat pass, or
 * incrementally from the last message recorded in discord-sync.json.
 * Chunked runs mark each window .done, so reruns resume instead of redoing.
 *
 *   bun run export-channel.ts -c 1234567890
 *   bun run export-channel.ts -c 1234567890 --flat -o canvas
 *   bun run export-channel.ts -c 1234567890 --since-state
 *
 * DCE respects Discord's advisory rate-limit headers on its own
 * (--respect-rate-limits, --parallel 1); chunking exists for resumability
 * and to spread very large exports over time.
 */

import { parseArgs } from 'node:util'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isSnowflake, isoDay, jittered, planChunks, sleep, snowflakeToDate } from '../lib/core'
import { resolveToken } from '../lib/discord-api'
import { DEFAULT_CONFIG_PATH, loadDoc } from '../lib/state'
import type { Chunk } from '../lib/core'

export interface ExportOptions {
    channel: string
    outDir: string
    from?: string
    to?: string
    stepDays: number
    sleepSeconds: number
    jitterSeconds: number
    format: string
    threads: string
    partition: string
    retries: number
    filter?: string
    media: boolean
    flat: boolean
    afterId?: string
    image: string
    force: boolean
    dryRun: boolean
    /** Passed to docker via the environment (not argv) so .env/--token work. */
    token?: string | undefined
}

interface Work extends Partial<Chunk> {
    rel: string
    label: string
}

function dockerArgs(opts: ExportOptions, work: Work): string[] {
    const outPath = work.rel === '.' ? '/out/' : `/out/${work.rel}/`
    const args = [
        'run',
        '--rm',
        '--env',
        'DISCORD_TOKEN',
        '--env',
        'TZ=UTC',
        '--env',
        'FUCK_RUSSIA=true',
        '--volume',
        `${opts.outDir}:/out`,
        opts.image,
        'export',
        '--channel',
        opts.channel,
        '--output',
        outPath,
        '--format',
        opts.format,
        '--include-threads',
        opts.threads,
        '--partition',
        opts.partition,
        '--utc',
        '--parallel',
        '1',
        '--respect-rate-limits'
    ]
    if (work.after) args.push('--after', work.after)
    if (work.before) args.push('--before', work.before)
    if (opts.media) {
        const mediaDir = work.rel === '.' ? '/out/_media' : `/out/${opts.channel}/_media`
        args.push('--media', '--reuse-media', '--media-dir', mediaDir)
    }
    if (opts.filter) args.push('--filter', opts.filter)
    return args
}

export async function exportChannel(
    opts: ExportOptions
): Promise<{ done: number; skipped: number; failed: number }> {
    if (!isSnowflake(opts.channel))
        throw new Error(`--channel must be a numeric ID, got: ${opts.channel}`)
    // Docker --volume requires an absolute host path; callers may pass relative dirs.
    opts = { ...opts, outDir: resolve(opts.outDir) }

    let work: Work[]
    if (opts.flat) {
        work = [
            {
                rel: '.',
                after: opts.afterId,
                label: opts.afterId ? `after ${opts.afterId}` : 'full channel'
            }
        ]
    } else {
        // Derive the start from the channel snowflake so we don't grind through
        // empty windows back to 2015.
        const from = opts.from ?? isoDay(snowflakeToDate(opts.channel))
        const to = opts.to ?? isoDay(new Date(Date.now() + 86_400_000))
        work = planChunks(from, to, opts.stepDays).map((c) => ({
            ...c,
            rel: `${opts.channel}/${c.after.slice(0, 10)}_${c.before.slice(0, 10)}`
        }))
        console.log(`range     : ${from} -> ${to} (exclusive)`)
        console.log(
            `chunks    : ${work.length} x ${opts.stepDays}d, pausing ${opts.sleepSeconds}s +0..${opts.jitterSeconds}s between them`
        )
    }
    console.log(`channel   : ${opts.channel}`)
    console.log(`output    : ${opts.outDir}\n`)

    mkdirSync(opts.outDir, { recursive: true })
    let done = 0,
        skipped = 0,
        failed = 0

    for (let i = 0; i < work.length; i++) {
        const w = work[i]!
        const dest = join(opts.outDir, w.rel)
        const doneMarker = join(dest, '.done')
        const label = `[${i + 1}/${work.length}] ${w.label}`

        if (!opts.flat && existsSync(doneMarker) && !opts.force) {
            console.log(`${label}  skip (already done)`)
            skipped++
            continue
        }
        if (!opts.dryRun && w.rel !== '.') mkdirSync(dest, { recursive: true })
        console.log(`${label}  exporting...`)

        let ok = false
        for (let attempt = 1; attempt <= opts.retries; attempt++) {
            const args = dockerArgs(opts, w)
            if (opts.dryRun) {
                console.log(
                    `docker ${args.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ')}`
                )
                ok = true
                break
            }
            // Piped (not inherited) so callers that capture console output —
            // notably the TUI's sync log — see docker/DCE progress lines too.
            const env = opts.token ? { ...process.env, DISCORD_TOKEN: opts.token } : process.env
            const proc = Bun.spawn(['docker', ...args], {
                stdout: 'pipe',
                stderr: 'pipe',
                env
            })
            const forward = async (
                stream: ReadableStream<Uint8Array>,
                sink: (line: string) => void
            ) => {
                const decoder = new TextDecoder()
                let buf = ''
                for await (const chunk of stream) {
                    buf += decoder.decode(chunk, { stream: true })
                    const lines = buf.split(/\r\n|\n|\r/)
                    buf = lines.pop() ?? ''
                    for (const line of lines) if (line.trim()) sink(line)
                }
                if (buf.trim()) sink(buf)
            }
            const streams = Promise.all([
                forward(proc.stdout, (l) => console.log(l)),
                forward(proc.stderr, (l) => console.error(l))
            ])
            const code = await proc.exited
            await streams
            if (code === 0) {
                ok = true
                break
            }
            if (attempt === opts.retries) break
            const backoff = Math.min(opts.sleepSeconds * 2 ** attempt, 600)
            console.error(`${label}  attempt ${attempt} failed, retrying in ${backoff}s`)
            await sleep(backoff * 1000)
        }

        if (ok) {
            if (!opts.dryRun && w.rel !== '.')
                await Bun.write(doneMarker, new Date().toISOString() + '\n')
            done++
        } else {
            console.error(`${label}  FAILED after ${opts.retries} attempts - continuing`)
            failed++
        }
        if (i + 1 < work.length && !opts.dryRun) {
            const pause = jittered(opts.sleepSeconds, opts.jitterSeconds)
            console.log(`           sleeping ${Math.round(pause / 1000)}s`)
            await sleep(pause)
        }
    }
    console.log(`\nexported ${done}, skipped ${skipped}, failed ${failed}`)
    return { done, skipped, failed }
}

export async function main(args: string[]): Promise<void> {
    const { values } = parseArgs({
        args: args,
        options: {
            'channel': { type: 'string', short: 'c' },
            'out': { type: 'string', short: 'o', default: 'exports' },
            'from': { type: 'string' },
            'to': { type: 'string' },
            'step': { type: 'string', default: '30' },
            'sleep': { type: 'string', default: '45' },
            'jitter': { type: 'string', default: '30' },
            'format': { type: 'string', short: 'f', default: 'Json' },
            'threads': { type: 'string', default: 'All' },
            'partition': { type: 'string', short: 'p', default: '10mb' },
            'retries': { type: 'string', default: '5' },
            'filter': { type: 'string' },
            'media': { type: 'boolean', default: false },
            'flat': { type: 'boolean', default: false },
            'since-state': { type: 'boolean', default: false },
            'config': { type: 'string', default: DEFAULT_CONFIG_PATH },
            'token': { type: 'string' },
            'image': { type: 'string', default: 'tyrrrz/discordchatexporter:stable' },
            'force': { type: 'boolean', default: false },
            'dry-run': { type: 'boolean', default: false }
        }
    })
    if (!values.channel) {
        console.error('error: --channel is required')
        process.exit(1)
    }
    const token = await resolveToken(values.token)
    if (!token) {
        console.error('error: no token (use --token, DISCORD_TOKEN, or a .env file)')
        process.exit(1)
    }

    let afterId: string | undefined
    let flat = values.flat
    let outDir = values.out
    if (values['since-state']) {
        const doc = await loadDoc(values.config)
        const ch = doc.state.channels[values.channel]
        if (!ch?.lastMessageId) {
            console.error(
                `error: channel ${values.channel} has no lastMessageId in ${values.config}`
            )
            process.exit(1)
        }
        afterId = ch.lastMessageId
        flat = true
        if (outDir === 'exports' && ch.directory) {
            outDir = join(ch.directory, `_since-${isoDay(new Date())}`)
        }
        console.log(`incremental: ${ch.name} (${values.channel}), messages after ${afterId}`)
    }

    const result = await exportChannel({
        channel: values.channel,
        outDir: resolve(outDir),
        from: values.from,
        to: values.to,
        stepDays: Number(values.step),
        sleepSeconds: Number(values.sleep),
        jitterSeconds: Number(values.jitter),
        format: values.format,
        threads: values.threads,
        partition: values.partition,
        retries: Number(values.retries),
        filter: values.filter,
        media: values.media,
        flat,
        afterId,
        image: values.image,
        force: values.force,
        dryRun: values['dry-run'],
        token
    })
    if (result.failed > 0) process.exit(1)
}

if (import.meta.main) await main(Bun.argv.slice(2))
