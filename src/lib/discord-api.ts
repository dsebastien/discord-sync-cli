/** Minimal Discord REST client: just enough to browse guilds and channels.
 * Works with both user and bot tokens (auth scheme is probed once). */

import { sleep } from './core'

const API = 'https://discord.com/api/v10'

export interface Guild {
    id: string
    name: string
}

export interface Channel {
    id: string
    name: string
    type: number
    parent_id?: string | null
    position?: number
}

/** Channel types DiscordChatExporter can export. */
const EXPORTABLE_TYPES: Record<number, string> = {
    0: 'text',
    5: 'announcement',
    15: 'forum',
    16: 'media'
}
const CATEGORY_TYPE = 4

export function isExportable(ch: Channel): boolean {
    return ch.type in EXPORTABLE_TYPES
}

export function channelKind(ch: Channel): string {
    return EXPORTABLE_TYPES[ch.type] ?? `type-${ch.type}`
}

/** Resolve the token: explicit flag > environment > .env file in cwd.
 * (Compiled binaries do not auto-load .env, so it is read explicitly.) */
export async function resolveToken(explicit?: string): Promise<string | null> {
    if (explicit) return explicit
    const fromEnv = process.env['DISCORD_TOKEN']
    if (fromEnv) return fromEnv
    const envFile = Bun.file('.env')
    if (await envFile.exists()) {
        const text = await envFile.text()
        const m = text.match(/^\s*(?:export\s+)?DISCORD_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m)
        if (m) return m[1] ?? null
    }
    return null
}

export class DiscordApi {
    private authHeader: string | null = null

    constructor(private readonly token: string) {}

    /** Discord user tokens authenticate bare; bot tokens need a `Bot ` prefix.
     * Probe once with /users/@me and remember what worked. */
    private async resolveAuth(): Promise<string> {
        if (this.authHeader) return this.authHeader
        for (const candidate of [this.token, `Bot ${this.token}`]) {
            const resp = await fetch(`${API}/users/@me`, {
                headers: { Authorization: candidate }
            })
            if (resp.ok) {
                this.authHeader = candidate
                return candidate
            }
            if (resp.status !== 401) {
                throw new Error(`Discord API auth probe failed: http ${resp.status}`)
            }
        }
        throw new Error('Discord rejected the token (401) as both a user and a bot token')
    }

    private async get<T>(path: string): Promise<T> {
        const auth = await this.resolveAuth()
        for (let attempt = 1; attempt <= 4; attempt++) {
            const resp = await fetch(`${API}${path}`, { headers: { Authorization: auth } })
            if (resp.ok) return (await resp.json()) as T
            if (resp.status === 429) {
                const body = (await resp.json().catch(() => ({}))) as { retry_after?: number }
                await sleep(Math.min((body.retry_after ?? 5) + 1, 60) * 1000)
                continue
            }
            throw new Error(`Discord API ${path}: http ${resp.status}`)
        }
        throw new Error(`Discord API ${path}: rate limited after retries`)
    }

    /** All guilds the token can see (paginated, 200 per page). */
    async listGuilds(): Promise<Guild[]> {
        const guilds: Guild[] = []
        let after = '0'
        for (;;) {
            const page = await this.get<Guild[]>(`/users/@me/guilds?limit=200&after=${after}`)
            guilds.push(...page.map((g) => ({ id: g.id, name: g.name })))
            if (page.length < 200) break
            after = page.at(-1)!.id
        }
        return guilds.sort((a, b) => a.name.localeCompare(b.name))
    }

    /** Exportable channels of a guild, grouped under their category names. */
    async listChannels(guildId: string): Promise<(Channel & { category: string | null })[]> {
        const all = await this.get<Channel[]>(`/guilds/${guildId}/channels`)
        const categories = new Map(
            all.filter((c) => c.type === CATEGORY_TYPE).map((c) => [c.id, c.name])
        )
        return all
            .filter(isExportable)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((c) => ({
                ...c,
                category: c.parent_id ? (categories.get(c.parent_id) ?? null) : null
            }))
    }
}

/** Directory-safe name for a channel: "Canvas Showcase!" -> "canvas-showcase". */
export function slugify(name: string): string {
    return (
        name
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'channel'
    )
}
