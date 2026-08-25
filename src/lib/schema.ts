/** Zod schema for discord-sync.json - the single project config+state file,
 * and the source of truth for its shape. The JSON Schema at the repo root is
 * generated from this (validate --emit-json-schema). */

import { z } from 'zod'
import type { DiscordSyncDoc } from './types'

const snowflake = z.string().regex(/^[0-9]{17,20}$/, 'must be a Discord snowflake')
const timestamp = z
    .string()
    .regex(
        /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/,
        'must be an ISO-8601 timestamp'
    )

const frontmatterScalar = z.union([z.string(), z.number(), z.boolean()])
const frontmatterValue = z.union([frontmatterScalar, z.array(frontmatterScalar)])

export const DEFAULT_SETTINGS = {
    assetDelayMs: 400,
    assetJitterMs: 400,
    exportDelaySeconds: 45,
    exportJitterSeconds: 30,
    frontmatter: {} as Record<string, z.infer<typeof frontmatterValue>>
}

export const SettingsSchema = z
    .strictObject({
        assetDelayMs: z.number().min(0).default(DEFAULT_SETTINGS.assetDelayMs),
        assetJitterMs: z.number().min(0).default(DEFAULT_SETTINGS.assetJitterMs),
        exportDelaySeconds: z.number().min(0).default(DEFAULT_SETTINGS.exportDelaySeconds),
        exportJitterSeconds: z.number().min(0).default(DEFAULT_SETTINGS.exportJitterSeconds),
        frontmatter: z.record(z.string(), frontmatterValue).default({})
    })
    .default(DEFAULT_SETTINGS)

export const ThreadStateSchema = z.strictObject({
    name: z.string().nullable(),
    type: z.string().nullable(),
    messageCount: z.int().min(0),
    lastMessageId: snowflake.nullable(),
    lastMessageTimestamp: timestamp.nullable(),
    lastAuthor: z.string().nullable()
})

export const ChannelStateSchema = z.strictObject({
    name: z.string().nullable(),
    guildId: snowflake.nullable(),
    guildName: z.string().nullable(),
    directory: z.string().min(1),
    lastExportedAt: timestamp.nullable(),
    lastMessageId: snowflake.nullable(),
    lastMessageTimestamp: timestamp.nullable(),
    lastThreadId: snowflake.nullable(),
    lastThreadName: z.string().nullable(),
    threadCount: z.int().min(0),
    messageCount: z.int().min(0),
    threads: z.record(snowflake, ThreadStateSchema)
})

export const GuildSelectionSchema = z.strictObject({
    name: z.string(),
    channels: z.record(
        snowflake,
        z.strictObject({ name: z.string(), directory: z.string().min(1) })
    )
})

export const DiscordSyncSchema = z.strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    updatedAt: timestamp.optional(),
    settings: SettingsSchema,
    guilds: z.record(snowflake, GuildSelectionSchema).default({}),
    state: z
        .strictObject({ channels: z.record(snowflake, ChannelStateSchema) })
        .default({ channels: {} })
})

/** Validate; returns formatted "path: message" strings, empty when valid. */
export function validateDoc(instance: unknown): string[] {
    const result = DiscordSyncSchema.safeParse(instance)
    if (result.success) return []
    return result.error.issues.map((i) => `$.${i.path.join('.')}: ${i.message}`)
}

/** JSON Schema rendition for editors, generated from the zod schema. */
export function toJsonSchema(): object {
    return {
        $id: 'discord-sync.schema.json',
        title: 'discord-sync project file',
        description:
            'Single config+state file for discord-sync. Generated from src/lib/schema.ts - edit the zod schema, not this file.',
        ...z.toJSONSchema(DiscordSyncSchema)
    }
}

export interface SemanticReport {
    errors: string[]
    warnings: string[]
}

/** Checks the schema cannot express: directories exist, are unique per
 * channel, and channel cursors are consistent with their threads.
 * `dirExists` is injected for testability. */
export function semanticChecks(
    doc: DiscordSyncDoc,
    dirExists: (dir: string) => boolean
): SemanticReport {
    const errors: string[] = []
    const warnings: string[] = []
    const channels = doc.state?.channels ?? {}

    // Two channels must not share an output directory (silent data mixing).
    const byDir = new Map<string, string[]>()
    for (const [cid, ch] of Object.entries(channels)) {
        byDir.set(ch.directory, [...(byDir.get(ch.directory) ?? []), cid])
    }
    for (const [dir, ids] of byDir) {
        if (ids.length > 1) {
            errors.push(`state: directory '${dir}' is shared by channels ${ids.join(', ')}`)
        }
    }

    for (const [cid, ch] of Object.entries(channels)) {
        const prefix = `state.channels.${cid}`
        if (ch.directory && !dirExists(ch.directory)) {
            warnings.push(`${prefix}: directory '${ch.directory}' does not exist`)
        }
        const threads = ch.threads ?? {}
        if (ch.lastMessageId && Object.keys(threads).length) {
            const lasts = new Set(Object.values(threads).map((t) => t.lastMessageId))
            if (!lasts.has(ch.lastMessageId)) {
                errors.push(
                    `${prefix}: lastMessageId ${ch.lastMessageId} not found among its threads' lastMessageIds`
                )
            }
        }
        const counted = Object.values(threads).reduce((n, t) => n + (t.messageCount ?? 0), 0)
        if (ch.messageCount !== undefined && ch.messageCount !== counted) {
            warnings.push(
                `${prefix}: messageCount ${ch.messageCount} != sum of thread counts ${counted}`
            )
        }
    }
    return { errors, warnings }
}
