/** Folding incremental delta exports into master export files. */

import { compareSnowflakes } from './core'
import type { DceExport, DceMessage } from './types'

export interface MergeResult {
    merged: DceExport
    added: number
}

/** Merge delta messages into a master export: dedupe by message ID, sort by
 * timestamp (snowflake as tiebreak), update the count. */
export function mergeMessages(master: DceExport, delta: DceExport): MergeResult {
    const seen = new Set((master.messages ?? []).map((m) => m.id))
    const fresh = (delta.messages ?? []).filter((m) => !seen.has(m.id))
    if (fresh.length === 0) return { merged: master, added: 0 }
    const messages = [...(master.messages ?? []), ...fresh].sort(byTimestamp)
    return {
        merged: {
            ...master,
            // Refresh channel/guild metadata from the delta so a thread renamed
            // on Discord shows its new name after an incremental sync.
            guild: delta.guild ?? master.guild,
            channel: delta.channel ?? master.channel,
            messages,
            ...({ messageCount: messages.length } as object),
            exportedAt: delta.exportedAt ?? master.exportedAt
        },
        added: fresh.length
    }
}

function byTimestamp(a: DceMessage, b: DceMessage): number {
    const ta = a.timestamp ?? ''
    const tb = b.timestamp ?? ''
    if (ta !== tb) return ta < tb ? -1 : 1
    return compareSnowflakes(a.id ?? null, b.id ?? null)
}

export function threadIdOf(path: string, data: DceExport): string | null {
    if (data.channel?.id) return String(data.channel.id)
    const m = path.match(/\[(\d+)\]/)
    return m ? m[1]! : null
}
