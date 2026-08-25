/** Zod schema for exports-state.json - the source of truth for its shape.
 * The JSON Schema file at the repo root is generated from this
 * (bun run src/validate-state.ts --emit-json-schema). */

import { z } from 'zod'
import type { ExportsState } from './types'

const snowflake = z.string().regex(/^[0-9]{17,20}$/, 'must be a Discord snowflake')
const timestamp = z
    .string()
    .regex(
        /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/,
        'must be an ISO-8601 timestamp'
    )

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

export const ExportsStateSchema = z.strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    updatedAt: timestamp.optional(),
    channels: z.record(snowflake, ChannelStateSchema)
})

/** Validate; returns formatted "path: message" strings, empty when valid. */
export function validateState(instance: unknown): string[] {
    const result = ExportsStateSchema.safeParse(instance)
    if (result.success) return []
    return result.error.issues.map((i) => `$.${i.path.join('.')}: ${i.message}`)
}

/** JSON Schema rendition for editors, generated from the zod schema. */
export function toJsonSchema(): object {
    return {
        $id: 'exports-state.schema.json',
        title: 'Discord export state',
        description:
            'Per-channel resume cursors for the export/sync scripts. Generated from src/lib/schema.ts - edit the zod schema, not this file.',
        ...z.toJSONSchema(ExportsStateSchema)
    }
}

export interface SemanticReport {
    errors: string[]
    warnings: string[]
}

/** Checks the schema cannot express: directories exist, channel cursor is
 * consistent with its threads. `dirExists` is injected for testability. */
export function semanticChecks(
    state: ExportsState,
    dirExists: (dir: string) => boolean
): SemanticReport {
    const errors: string[] = []
    const warnings: string[] = []
    for (const [cid, ch] of Object.entries(state.channels ?? {})) {
        const prefix = `channels.${cid}`
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
