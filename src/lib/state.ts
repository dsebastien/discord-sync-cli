/** Building exports-state.json from DiscordChatExporter output. */

import { compareSnowflakes } from './core'
import { renameSync } from 'node:fs'
import type { ChannelState, DceExport, DiscordSyncDoc, ThreadState } from './types'
import { DEFAULT_SETTINGS, DiscordSyncSchema } from './schema'

export interface FileSummary {
    channelId: string | null
    channelName: string | null
    guildId: string | null
    guildName: string | null
    threadId: string | null
    threadName: string | null
    threadType: string | null
    messageCount: number
    lastMessageId: string | null
    lastMessageTimestamp: string | null
    lastAuthor: string | null
}

function isThread(type: string | undefined): boolean {
    return /Thread/.test(type ?? '')
}

/** Compress one export file down to the fields the state file needs. */
export function summarize(data: DceExport): FileSummary {
    const ch = data.channel ?? {}
    const msgs = data.messages ?? []
    let newest: (typeof msgs)[number] | null = null
    for (const m of msgs) {
        if (!m.timestamp) continue
        if (
            newest === null ||
            m.timestamp > newest.timestamp! ||
            (m.timestamp === newest.timestamp &&
                compareSnowflakes(m.id ?? null, newest.id ?? null) > 0)
        ) {
            newest = m
        }
    }
    const thread = isThread(ch.type)
    return {
        channelId: (thread ? ch.categoryId : ch.id) ?? null,
        channelName: (thread ? ch.category : ch.name) ?? null,
        guildId: data.guild?.id ?? null,
        guildName: data.guild?.name ?? null,
        threadId: ch.id ?? null,
        threadName: ch.name ?? null,
        threadType: ch.type ?? null,
        messageCount: msgs.length,
        lastMessageId: newest?.id ?? null,
        lastMessageTimestamp: newest?.timestamp ?? null,
        lastAuthor: newest?.author?.name ?? null
    }
}

function newer(a: ThreadState, b: ThreadState): boolean {
    if (a.lastMessageTimestamp === null) return b.lastMessageTimestamp !== null
    if (b.lastMessageTimestamp === null) return false
    if (a.lastMessageTimestamp !== b.lastMessageTimestamp) {
        return b.lastMessageTimestamp > a.lastMessageTimestamp
    }
    return compareSnowflakes(b.lastMessageId, a.lastMessageId) > 0
}

/** Fold per-file summaries (several per thread when partitioned) into one channel entry. */
export function buildChannelState(
    summaries: FileSummary[],
    opts: {
        directory: string
        now: string
        nameOverride?: string | null
        previousName?: string | null
    }
): ChannelState {
    const threads: Record<string, ThreadState> = {}
    for (const s of summaries) {
        if (s.threadId === null) continue
        const candidate: ThreadState = {
            name: s.threadName,
            type: s.threadType,
            messageCount: s.messageCount,
            lastMessageId: s.lastMessageId,
            lastMessageTimestamp: s.lastMessageTimestamp,
            lastAuthor: s.lastAuthor
        }
        const prev = threads[s.threadId]
        if (!prev) {
            threads[s.threadId] = candidate
        } else {
            const winner = newer(prev, candidate) ? candidate : prev
            threads[s.threadId] = {
                ...winner,
                messageCount: prev.messageCount + candidate.messageCount
            }
        }
    }

    let tipId: string | null = null
    for (const [tid, t] of Object.entries(threads)) {
        if (tipId === null || newer(threads[tipId]!, t)) tipId = tid
    }
    const tip = tipId === null ? null : threads[tipId]!
    const any = [...summaries].reverse().find((s) => s.channelName !== null)

    return {
        name: opts.nameOverride ?? any?.channelName ?? opts.previousName ?? null,
        guildId: any?.guildId ?? null,
        guildName: any?.guildName ?? null,
        directory: opts.directory,
        lastExportedAt: opts.now,
        lastMessageId: tip?.lastMessageId ?? null,
        lastMessageTimestamp: tip?.lastMessageTimestamp ?? null,
        lastThreadId: tipId,
        lastThreadName: tip?.name ?? null,
        threadCount: Object.keys(threads).length,
        messageCount: Object.values(threads).reduce((n, t) => n + t.messageCount, 0),
        threads: Object.fromEntries(
            Object.entries(threads).sort(([, a], [, b]) =>
                (a.lastMessageTimestamp ?? '') < (b.lastMessageTimestamp ?? '') ? -1 : 1
            )
        )
    }
}

export const DEFAULT_CONFIG_PATH = 'discord-sync.json'

export function emptyDoc(): DiscordSyncDoc {
    return {
        $schema: './discord-sync.schema.json',
        version: 1,
        settings: structuredClone(DEFAULT_SETTINGS),
        guilds: {},
        state: { channels: {} }
    }
}

/**
 * Load discord-sync.json, applying schema defaults. Returns an empty doc when
 * the file is absent; throws on an invalid file.
 */
export async function loadDoc(path = DEFAULT_CONFIG_PATH): Promise<DiscordSyncDoc> {
    const file = Bun.file(path)
    if (!(await file.exists())) return emptyDoc()
    const parsed = DiscordSyncSchema.safeParse(await file.json())
    if (!parsed.success) {
        throw new Error(
            `${path} is invalid:\n` +
                parsed.error.issues.map((i) => `  $.${i.path.join('.')}: ${i.message}`).join('\n')
        )
    }
    return parsed.data as DiscordSyncDoc
}

/** Atomically write the doc (temp file + rename) so an interrupted write or a
 * concurrent reader never sees a torn file. `state.channels` is sorted for a
 * stable diff. */
export async function saveDoc(path: string, doc: DiscordSyncDoc): Promise<void> {
    doc.state.channels = Object.fromEntries(
        Object.entries(doc.state.channels).sort(([ka, a], [kb, b]) =>
            (a.name ?? ka) < (b.name ?? kb) ? -1 : 1
        )
    )
    const tmp = `${path}.tmp-${process.pid}`
    await Bun.write(tmp, JSON.stringify(doc, null, 2) + '\n')
    renameSync(tmp, path)
}
