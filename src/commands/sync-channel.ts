#!/usr/bin/env bun
/**
 * sync-channel.ts - one command to bring a Discord channel archive up to date.
 *
 *   discord-sync sync -c 1262785282957119540
 *   discord-sync sync -c <NEW_ID> -o mydir --name my-channel   # first time
 *
 * Pipeline: export (incremental for known channels, full otherwise) -> merge
 * delta -> update exports-state.json -> download assets -> generate HTML and
 * Markdown. Directory and name for known channels come from the state file.
 */

import { parseArgs } from 'node:util'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { exportChannel } from './export-channel'
import { mergeDeltaDir } from './merge-exports'
import { updateState } from './update-state'
import { downloadAssets } from './download-assets'
import { generateHtml } from './generate-html'
import { generateMarkdown } from './generate-markdown'
import { validateStateFile } from './validate-state'
import { isoDay } from '../lib/core'
import { loadState } from '../lib/state'

export interface SyncOptions {
    channel: string
    out?: string | undefined
    name?: string | undefined
    full?: boolean
    skipAssets?: boolean
    stateFile?: string
}

export class SyncError extends Error {}

/** Run the full pipeline for one channel. Throws SyncError on failure. */
export async function syncOne(opts: SyncOptions): Promise<void> {
    const stateFile = opts.stateFile ?? 'exports-state.json'
    const state = await loadState(stateFile)
    const known = state.channels[opts.channel]
    const outDir = opts.out ?? known?.directory
    const name = opts.name ?? known?.name ?? undefined
    if (!outDir) {
        throw new SyncError(
            `channel ${opts.channel} is not in ${stateFile} yet - pass a directory (and ideally a name)`
        )
    }

    console.log(`== sync ${opts.channel} (${name ?? 'unnamed'}) -> ${outDir}/ ==`)

    const common = {
        stepDays: 30,
        sleepSeconds: 45,
        jitterSeconds: 30,
        format: 'Json',
        threads: 'All',
        partition: '10mb',
        retries: 5,
        media: false,
        image: 'tyrrrz/discordchatexporter:stable',
        force: false,
        dryRun: false
    }

    if (known?.lastMessageId && !opts.full) {
        console.log('-- incremental export --')
        const deltaDir = join(outDir, `_since-${isoDay(new Date())}`)
        const result = await exportChannel({
            ...common,
            channel: opts.channel,
            outDir: deltaDir,
            flat: true,
            afterId: known.lastMessageId
        })
        if (result.failed > 0) throw new SyncError('export failed')
        const hasFiles =
            existsSync(deltaDir) && readdirSync(deltaDir).some((f) => f.endsWith('.json'))
        if (hasFiles) {
            console.log('-- merging delta --')
            await mergeDeltaDir(deltaDir, outDir)
        } else {
            console.log('-- no new messages --')
            rmSync(deltaDir, { recursive: true, force: true })
        }
    } else {
        console.log('-- full export --')
        const result = await exportChannel({
            ...common,
            channel: opts.channel,
            outDir,
            flat: true
        })
        if (result.failed > 0) throw new SyncError('export failed')
    }

    console.log('-- updating state --')
    await updateState({ dirs: [outDir], stateFile, name, channelId: opts.channel })
    const { errors } = await validateStateFile(stateFile)
    if (errors.length) {
        throw new SyncError(`state validation failed:\n${errors.map((e) => `  ${e}`).join('\n')}`)
    }

    if (!opts.skipAssets) {
        console.log('-- downloading assets --')
        await downloadAssets(outDir, {
            delay: 0.4,
            jitter: 0.4,
            retries: 4,
            retryFailed: false,
            dryRun: false
        })
    }

    console.log('-- generating html --')
    await generateHtml(outDir)
    console.log('-- generating markdown --')
    await generateMarkdown(outDir)

    console.log(`== sync complete: ${outDir}/html/index.html ==`)
}

export async function main(args: string[]): Promise<void> {
    const { values } = parseArgs({
        args,
        options: {
            'channel': { type: 'string', short: 'c' },
            'out': { type: 'string', short: 'o' },
            'name': { type: 'string' },
            'full': { type: 'boolean', default: false },
            'skip-assets': { type: 'boolean', default: false },
            'state': { type: 'string', default: 'exports-state.json' }
        }
    })
    if (!values.channel) {
        console.error('error: --channel is required')
        process.exit(1)
    }
    if (!process.env['DISCORD_TOKEN']) {
        console.error('error: DISCORD_TOKEN is not set')
        process.exit(1)
    }
    try {
        await syncOne({
            channel: values.channel,
            out: values.out,
            name: values.name,
            full: values.full,
            skipAssets: values['skip-assets'],
            stateFile: values.state
        })
    } catch (e) {
        if (e instanceof SyncError) {
            console.error(`error: ${e.message}`)
            process.exit(1)
        }
        throw e
    }
}

if (import.meta.main) await main(Bun.argv.slice(2))
