/** Channel selection and sync markers, operating on the unified
 * discord-sync.json document (doc.guilds + doc.state). */

import type { DiscordSyncDoc } from './types'

export function selectChannel(
    doc: DiscordSyncDoc,
    guild: { id: string; name: string },
    channel: { id: string; name: string },
    directory: string
): DiscordSyncDoc {
    const g = doc.guilds[guild.id] ?? { name: guild.name, channels: {} }
    return {
        ...doc,
        guilds: {
            ...doc.guilds,
            [guild.id]: {
                ...g,
                name: guild.name,
                channels: {
                    ...g.channels,
                    [channel.id]: {
                        name: channel.name,
                        directory: g.channels[channel.id]?.directory ?? directory
                    }
                }
            }
        }
    }
}

export function deselectChannel(
    doc: DiscordSyncDoc,
    guildId: string,
    channelId: string
): DiscordSyncDoc {
    const g = doc.guilds[guildId]
    if (!g) return doc
    const { [channelId]: _removed, ...channels } = g.channels
    const guilds = { ...doc.guilds }
    if (Object.keys(channels).length === 0) {
        delete guilds[guildId]
    } else {
        guilds[guildId] = { ...g, channels }
    }
    return { ...doc, guilds }
}

/** Is `directory` already claimed by a different channel (in selections or
 * state)? Used to avoid two channels writing into the same folder. */
export function directoryTaken(
    doc: DiscordSyncDoc,
    directory: string,
    exceptChannelId: string
): boolean {
    for (const g of Object.values(doc.guilds)) {
        for (const [cid, ch] of Object.entries(g.channels)) {
            if (cid !== exceptChannelId && ch.directory === directory) return true
        }
    }
    for (const [cid, ch] of Object.entries(doc.state.channels)) {
        if (cid !== exceptChannelId && ch.directory === directory) return true
    }
    return false
}

export type Mark = 'synced' | 'selected' | 'none'

/** Marker for one channel: synced (in state), selected (in guilds), or none. */
export function channelMark(doc: DiscordSyncDoc, guildId: string, channelId: string): Mark {
    if (doc.state.channels[channelId]) return 'synced'
    if (doc.guilds[guildId]?.channels[channelId]) return 'selected'
    return 'none'
}

/** Marker for one guild, derived from its channels' states. */
export function guildMark(doc: DiscordSyncDoc, guildId: string): Mark {
    if (Object.values(doc.state.channels).some((c) => c.guildId === guildId)) return 'synced'
    if (doc.guilds[guildId] && Object.keys(doc.guilds[guildId].channels).length) return 'selected'
    return 'none'
}

export const MARK_GLYPH: Record<Mark, string> = {
    synced: '✓',
    selected: '◇',
    none: ' '
}
