import { describe, expect, test } from 'bun:test'
import { semanticChecks, toJsonSchema, validateDoc, DiscordSyncSchema } from './schema'
import type { DiscordSyncDoc } from './types'

const VALID: DiscordSyncDoc = {
    $schema: './discord-sync.schema.json',
    version: 1,
    updatedAt: '2026-08-25T06:33:52Z',
    settings: {
        assetDelayMs: 400,
        assetJitterMs: 400,
        exportDelaySeconds: 45,
        exportJitterSeconds: 30,
        frontmatter: { explore: false }
    },
    guilds: {
        '686053708261228577': {
            name: 'OMG',
            channels: { '1262785282957119540': { name: 'canvas-showcase', directory: 'canvas' } }
        }
    },
    state: {
        channels: {
            '1262785282957119540': {
                name: 'canvas-showcase',
                guildId: '686053708261228577',
                guildName: 'OMG',
                directory: 'canvas',
                lastExportedAt: '2026-08-25T06:33:52Z',
                lastMessageId: '1541690758854213693',
                lastMessageTimestamp: '2026-08-25T06:08:40.14+00:00',
                lastThreadId: '1319766711024488529',
                lastThreadName: 't',
                threadCount: 1,
                messageCount: 3,
                threads: {
                    '1319766711024488529': {
                        name: 't',
                        type: 'GuildPublicThread',
                        messageCount: 3,
                        lastMessageId: '1541690758854213693',
                        lastMessageTimestamp: '2026-08-25T06:08:40.14+00:00',
                        lastAuthor: 'aika_2100'
                    }
                }
            }
        }
    }
}

describe('validateDoc', () => {
    test('accepts a valid document', () => {
        expect(validateDoc(VALID)).toEqual([])
    })
    test('applies settings defaults when the block is omitted', () => {
        const parsed = DiscordSyncSchema.parse({ version: 1, guilds: {}, state: { channels: {} } })
        expect(parsed.settings.assetDelayMs).toBe(400)
        expect(parsed.settings.frontmatter).toEqual({})
    })
    test('rejects wrong version, bad snowflakes, unknown keys', () => {
        expect(validateDoc({ ...VALID, version: 2 }).length).toBeGreaterThan(0)
        expect(
            validateDoc({
                ...VALID,
                state: { channels: { abc: VALID.state.channels['1262785282957119540'] } }
            }).length
        ).toBeGreaterThan(0)
        expect(validateDoc({ ...VALID, extra: true }).length).toBeGreaterThan(0)
    })
    test('rejects malformed timestamps', () => {
        const bad = structuredClone(VALID)
        bad.state.channels['1262785282957119540']!.lastMessageTimestamp = 'yesterday'
        expect(validateDoc(bad).some((e) => e.includes('lastMessageTimestamp'))).toBe(true)
    })
})

describe('semanticChecks', () => {
    test('flags a channel cursor pointing at no known thread', () => {
        const bad = structuredClone(VALID)
        bad.state.channels['1262785282957119540']!.lastMessageId = '1111111111111111111'
        const { errors } = semanticChecks(bad, () => true)
        expect(errors.length).toBe(1)
    })
    test('flags two channels sharing a directory', () => {
        const bad = structuredClone(VALID)
        bad.state.channels['9999999999999999999'] = structuredClone(
            bad.state.channels['1262785282957119540']!
        )
        const { errors } = semanticChecks(bad, () => true)
        expect(errors.some((e) => e.includes('shared by channels'))).toBe(true)
    })
    test('warns about missing directories and count drift', () => {
        const drift = structuredClone(VALID)
        drift.state.channels['1262785282957119540']!.messageCount = 99
        const { warnings } = semanticChecks(drift, () => false)
        expect(warnings.some((w) => w.includes('does not exist'))).toBe(true)
        expect(warnings.some((w) => w.includes('99'))).toBe(true)
    })
    test('clean report for a consistent document', () => {
        const { errors, warnings } = semanticChecks(VALID, () => true)
        expect(errors).toEqual([])
        expect(warnings).toEqual([])
    })
})

describe('toJsonSchema', () => {
    test('emits a JSON Schema document', () => {
        const js = toJsonSchema() as Record<string, unknown>
        expect(js['$id']).toBe('discord-sync.schema.json')
        expect(JSON.stringify(js)).toContain('settings')
    })
})
