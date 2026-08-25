#!/usr/bin/env bun
/**
 * update-state.ts - rebuild the `state` section of discord-sync.json from the
 * DiscordChatExporter output on disk. Only `state` is rewritten; `settings`
 * and `guilds` are preserved.
 *
 *   discord-sync update-state canvas
 *   discord-sync update-state canvas --name canvas-showcase
 *   discord-sync update-state                # rescan every export directory
 */

import { parseArgs } from 'node:util'
import { defaultRoots, exportFiles, loadExport } from '../lib/fs'
import { buildChannelState, DEFAULT_CONFIG_PATH, loadDoc, saveDoc, summarize } from '../lib/state'
import type { FileSummary } from '../lib/state'
import { validateDoc } from '../lib/schema'
import type { DiscordSyncDoc } from '../lib/types'

export class UpdateStateError extends Error {}

export async function updateState(opts: {
    dirs: string[]
    configFile: string
    name?: string
    channelId?: string
}): Promise<void> {
    const doc = await loadDoc(opts.configFile)
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

    for (const dir of opts.dirs) {
        const summaries: FileSummary[] = []
        for (const file of exportFiles(dir)) {
            const data = await loadExport(file)
            if (data === null) {
                // Fatal: a skipped corrupt/partial file could let a newer thread
                // advance the channel cursor past messages it omitted.
                throw new UpdateStateError(`could not parse export ${file}`)
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
        doc.state.channels[channelId] = buildChannelState(summaries, {
            directory: dir,
            now,
            nameOverride: opts.name ?? null,
            previousName: doc.state.channels[channelId]?.name ?? null
        })
        doc.updatedAt = now
        const ch = doc.state.channels[channelId]!
        console.log(
            `${channelId}  ${ch.name}  dir=${ch.directory}  threads=${ch.threadCount}  messages=${ch.messageCount}\n` +
                `          last: ${ch.lastMessageId} @ ${ch.lastMessageTimestamp}`
        )
    }

    // Validate the proposed document BEFORE writing, so a schema-invalid state
    // never overwrites the good file.
    const errors = validateDoc(doc satisfies DiscordSyncDoc)
    if (errors.length) {
        throw new UpdateStateError(
            `refusing to write invalid state:\n${errors.map((e) => `  ${e}`).join('\n')}`
        )
    }
    await saveDoc(opts.configFile, doc)
    console.log(`\nstate written to ${opts.configFile}`)
}

export async function main(args: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args,
        options: {
            config: { type: 'string', default: DEFAULT_CONFIG_PATH },
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
    try {
        await updateState({
            dirs,
            configFile: values.config,
            name: values.name,
            channelId: values.channel
        })
    } catch (e) {
        if (e instanceof UpdateStateError) {
            console.error(`error: ${e.message}`)
            process.exit(1)
        }
        throw e
    }
}

if (import.meta.main) await main(Bun.argv.slice(2))
