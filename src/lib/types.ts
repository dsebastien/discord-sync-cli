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

export interface ExportsState {
    $schema?: string
    version: 1
    updatedAt?: string
    channels: Record<string, ChannelState>
}

export type Manifest = Record<string, { file?: string; error?: string; url?: string }>
