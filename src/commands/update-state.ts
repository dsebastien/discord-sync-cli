#!/usr/bin/env bun
/**
 * update-state.ts - build/refresh exports-state.json from DiscordChatExporter output.
 *
 *   bun run update-state.ts canvas
 *   bun run update-state.ts canvas --name canvas-showcase
 *   bun run update-state.ts                # rescan every export directory
 */

import { parseArgs } from 'node:util'
import { basename, resolve } from 'node:path'
import { defaultRoots, exportFiles, loadExport } from '../lib/fs'
import { buildChannelState, loadState, saveState, summarize } from '../lib/state'
import type { FileSummary } from '../lib/state'

export async function updateState(opts: {
    dirs: string[]
    stateFile: string
    name?: string
    channelId?: string
}): Promise<void> {
    const state = await loadState(opts.stateFile)
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

    for (const dir of opts.dirs) {
        const summaries: FileSummary[] = []
        for (const file of exportFiles(dir)) {
            const data = await loadExport(file)
            if (data === null) {
                console.error(`warn: could not parse ${file}`)
                continue
            }
            const s = summarize(data)
            if (s.threadId !== null) summaries.push(s)
        }
        if (summaries.length === 0) {
            console.error(`skip ${dir} (no parsable exports)`)
            continue
        }
        const channelId =
            opts.channelId ?? summaries.findLast((s) => s.channelId !== null)?.channelId
        if (!channelId) {
            console.error(`skip ${dir} (could not determine channel ID)`)
            continue
        }
        state.channels[channelId] = buildChannelState(summaries, {
            directory: basename(resolve(dir)) === dir ? dir : dir,
            now,
            nameOverride: opts.name ?? null,
            previousName: state.channels[channelId]?.name ?? null
        })
        state.updatedAt = now
        const ch = state.channels[channelId]!
        console.log(
            `${channelId}  ${ch.name}  dir=${ch.directory}  threads=${ch.threadCount}  messages=${ch.messageCount}\n` +
                `          last: ${ch.lastMessageId} @ ${ch.lastMessageTimestamp}`
        )
    }
    await saveState(opts.stateFile, state)
    console.log(`\nstate written to ${opts.stateFile}`)
}

export async function main(args: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args: args,
        options: {
            state: { type: 'string', default: 'exports-state.json' },
            name: { type: 'string' },
            channel: { type: 'string' }
        },
        allowPositionals: true
    })
    const dirs = positionals.length ? positionals : defaultRoots(process.cwd())
    if (!dirs.length) {
        console.error('nothing to scan')
        process.exit(1)
    }
    await updateState({
        dirs,
        stateFile: values.state,
        name: values.name,
        channelId: values.channel
    })
}

if (import.meta.main) await main(Bun.argv.slice(2))
