#!/usr/bin/env bun
/**
 * sync-channel.ts - one command to bring a Discord channel archive up to date.
 *
 *   discord-sync sync -c 1262785282957119540
 *   discord-sync sync -c <NEW_ID> -o mydir --name my-channel   # first time
 *
 * Pipeline: export (incremental for known channels, full otherwise) -> merge
 * delta -> update discord-sync.json state -> download assets -> generate HTML
 * and Markdown. Directory/name for known channels come from the state.
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
import { validateConfigFile } from './validate-state'
import { resolveToken } from '../lib/discord-api'
import { DEFAULT_CONFIG_PATH, loadDoc } from '../lib/state'

export interface SyncOptions {
    channel: string
    out?: string | undefined
    name?: string | undefined
    full?: boolean
    skipAssets?: boolean
    configFile?: string
    /** Explicit token; falls back to resolveToken() (env / .env). */
    token?: string | undefined
}

export class SyncError extends Error {}

/** A unique delta directory per run so two syncs of the same channel on the
 * same day cannot collide. */
function deltaDirName(): string {
    const now = new Date()
    const stamp = now.toISOString().replace(/[:T]/g, '-').replace(/\..+/, '')
    return `_since-${stamp}-${process.pid}`
}

/** Run the full pipeline for one channel. Throws SyncError on failure. */
export async function syncOne(opts: SyncOptions): Promise<void> {
    const configFile = opts.configFile ?? DEFAULT_CONFIG_PATH
    const doc = await loadDoc(configFile)
    const known = doc.state.channels[opts.channel]
    const outDir = opts.out ?? known?.directory
    const name = opts.name ?? known?.name ?? undefined
    if (!outDir) {
        throw new SyncError(
            `channel ${opts.channel} is not in ${configFile} yet - pass a directory (and ideally a name)`
        )
    }

    const token = await resolveToken(opts.token)
    if (!token) {
        throw new SyncError('no token (use --token, DISCORD_TOKEN, or a .env file)')
    }

    console.log(`== sync ${opts.channel} (${name ?? 'unnamed'}) -> ${outDir}/ ==`)

    const { settings } = doc
    const common = {
        stepDays: 30,
        sleepSeconds: settings.exportDelaySeconds,
        jitterSeconds: settings.exportJitterSeconds,
        format: 'Json',
        threads: 'All',
        partition: '10mb',
        retries: 5,
        media: false,
        image: 'tyrrrz/discordchatexporter:stable',
        force: false,
        dryRun: false,
        token
    }

    if (known?.lastMessageId && !opts.full) {
        console.log('-- incremental export --')
        const deltaDir = join(outDir, deltaDirName())
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
    await updateState({ dirs: [outDir], configFile, name, channelId: opts.channel })
    const { errors } = await validateConfigFile(configFile)
    if (errors.length) {
        throw new SyncError(`state validation failed:\n${errors.map((e) => `  ${e}`).join('\n')}`)
    }

    if (!opts.skipAssets) {
        console.log('-- downloading assets --')
        await downloadAssets(outDir, {
            delay: settings.assetDelayMs / 1000,
            jitter: settings.assetJitterMs / 1000,
            retries: 4,
            retryFailed: false,
            dryRun: false
        })
    }

    console.log('-- generating html --')
    await generateHtml(outDir)
    console.log('-- generating markdown --')
    await generateMarkdown(outDir, settings.frontmatter)

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
            'token': { type: 'string' },
            'config': { type: 'string', default: DEFAULT_CONFIG_PATH }
        }
    })
    if (!values.channel) {
        console.error('error: --channel is required')
        process.exit(1)
    }
    try {
        await syncOne({
            channel: values.channel,
            out: values.out,
            name: values.name,
            full: values.full,
            skipAssets: values['skip-assets'],
            configFile: values.config,
            token: values.token
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
