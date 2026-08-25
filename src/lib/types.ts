/** Shapes shared across the toolkit. */

/** The subset of a DiscordChatExporter JSON export the toolkit reads. */
export interface DceExport {
    guild?: { id?: string; name?: string }
    channel?: {
        id?: string
        type?: string
        categoryId?: string
        category?: string
        name?: string
    }
    exportedAt?: string
    messages?: DceMessage[]
}

export interface DceMessage {
    id?: string
    type?: string
    timestamp?: string
    content?: string
    author?: { name?: string }
    attachments?: { id?: string; url?: string; fileName?: string }[]
    embeds?: {
        title?: string
        url?: string
        description?: string
        image?: { url?: string }
        thumbnail?: { url?: string }
        video?: { url?: string }
        images?: { url?: string }[]
    }[]
    stickers?: { id?: string; name?: string; sourceUrl?: string }[]
    reactions?: { emoji?: { name?: string }; count?: number }[]
}

export interface ThreadState {
    name: string | null
    type: string | null
    messageCount: number
    lastMessageId: string | null
    lastMessageTimestamp: string | null
    lastAuthor: string | null
}

export interface ChannelState {
    name: string | null
    guildId: string | null
    guildName: string | null
    directory: string
    lastExportedAt: string | null
    lastMessageId: string | null
    lastMessageTimestamp: string | null
    lastThreadId: string | null
    lastThreadName: string | null
    threadCount: number
    messageCount: number
    threads: Record<string, ThreadState>
}

/** A YAML frontmatter value the user can pin in settings.frontmatter. */
export type FrontmatterValue = string | number | boolean | (string | number | boolean)[]

/** Hand-edited tuning knobs. */
export interface Settings {
    /** Pause between individual asset downloads. */
    assetDelayMs: number
    assetJitterMs: number
    /** Pause between export chunks and between sequential channel syncs. */
    exportDelaySeconds: number
    exportJitterSeconds: number
    /** Extra keys/values written to every generated Markdown file's frontmatter. */
    frontmatter: Record<string, FrontmatterValue>
}

/** One selected channel: display name + output directory. */
export interface ChannelSelection {
    name: string
    directory: string
}

export interface GuildSelection {
    name: string
    channels: Record<string, ChannelSelection>
}

/**
 * The single project file, `discord-sync.json`.
 *
 * `settings` and `guilds` are hand-edited; `state` is auto-managed by
 * `update-state` (it rewrites only `state`, preserving the rest).
 */
export interface DiscordSyncDoc {
    $schema?: string
    version: 1
    updatedAt?: string
    settings: Settings
    guilds: Record<string, GuildSelection>
    state: { channels: Record<string, ChannelState> }
}

export type Manifest = Record<string, { file?: string; error?: string; url?: string }>
