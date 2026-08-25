/** sync-config.json - which servers/channels the user chose to synchronize.
 * Distinct from exports-state.json, which records what HAS been synced;
 * this records what SHOULD be. */

import { z } from 'zod'
import type { ExportsState } from './types'

const snowflake = z.string().regex(/^[0-9]{17,20}$/, 'must be a Discord snowflake')

export const SyncConfigSchema = z.strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    guilds: z.record(
        snowflake,
        z.strictObject({
            name: z.string(),
            channels: z.record(
                snowflake,
                z.strictObject({
                    name: z.string(),
                    directory: z.string().min(1)
                })
            )
        })
    )
})

export type SyncConfig = z.infer<typeof SyncConfigSchema>

export function emptyConfig(): SyncConfig {
    return { version: 1, guilds: {} }
}

export async function loadConfig(path: string): Promise<SyncConfig> {
    const file = Bun.file(path)
    if (!(await file.exists())) return emptyConfig()
    const parsed = SyncConfigSchema.safeParse(await file.json())
    if (!parsed.success) {
        throw new Error(
            `${path} is invalid:\n` +
                parsed.error.issues.map((i) => `  $.${i.path.join('.')}: ${i.message}`).join('\n')
        )
    }
    return parsed.data
}

export async function saveConfig(path: string, config: SyncConfig): Promise<void> {
    await Bun.write(path, JSON.stringify(config, null, 2) + '\n')
}

export function selectChannel(
    config: SyncConfig,
    guild: { id: string; name: string },
    channel: { id: string; name: string },
    directory: string
): SyncConfig {
    const g = config.guilds[guild.id] ?? { name: guild.name, channels: {} }
    return {
        ...config,
        guilds: {
            ...config.guilds,
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
    config: SyncConfig,
    guildId: string,
    channelId: string
): SyncConfig {
    const g = config.guilds[guildId]
    if (!g) return config
    const { [channelId]: _, ...channels } = g.channels
    const guilds = { ...config.guilds }
    if (Object.keys(channels).length === 0) {
        delete guilds[guildId]
    } else {
        guilds[guildId] = { ...g, channels }
    }
    return { ...config, guilds }
}

export type Mark = 'synced' | 'selected' | 'none'

/** Marker for one channel: synced (in state), selected (in config), or none. */
export function channelMark(
    state: ExportsState,
    config: SyncConfig,
    guildId: string,
    channelId: string
): Mark {
    if (state.channels[channelId]) return 'synced'
    if (config.guilds[guildId]?.channels[channelId]) return 'selected'
    return 'none'
}

/** Marker for one guild, derived from its channels' states. */
export function guildMark(state: ExportsState, config: SyncConfig, guildId: string): Mark {
    if (Object.values(state.channels).some((c) => c.guildId === guildId)) return 'synced'
    if (config.guilds[guildId] && Object.keys(config.guilds[guildId].channels).length)
        return 'selected'
    return 'none'
}

export const MARK_GLYPH: Record<Mark, string> = {
    synced: '✓',
    selected: '◇',
    none: ' '
}
