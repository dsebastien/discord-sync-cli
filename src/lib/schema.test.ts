import { describe, expect, test } from 'bun:test'
import { semanticChecks, toJsonSchema, validateState } from './schema'
import type { ExportsState } from './types'

const VALID: ExportsState = {
    $schema: './exports-state.schema.json',
    version: 1,
    updatedAt: '2026-08-25T06:33:52Z',
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

describe('validateState', () => {
    test('accepts a valid state', () => {
        expect(validateState(VALID)).toEqual([])
    })
    test('rejects wrong version, bad snowflakes, unknown keys', () => {
        expect(validateState({ ...VALID, version: 2 }).length).toBeGreaterThan(0)
        expect(
            validateState({ ...VALID, channels: { abc: VALID.channels['1262785282957119540'] } })
                .length
        ).toBeGreaterThan(0)
        expect(validateState({ ...VALID, extra: true }).length).toBeGreaterThan(0)
    })
    test('rejects malformed timestamps', () => {
        const bad = structuredClone(VALID)
        bad.channels['1262785282957119540']!.lastMessageTimestamp = 'yesterday'
        expect(validateState(bad).some((e) => e.includes('lastMessageTimestamp'))).toBe(true)
    })
})

describe('semanticChecks', () => {
    test('flags a channel cursor pointing at no known thread', () => {
        const bad = structuredClone(VALID)
        bad.channels['1262785282957119540']!.lastMessageId = '1111111111111111111'
        const { errors } = semanticChecks(bad, () => true)
        expect(errors.length).toBe(1)
    })
    test('warns about missing directories and count drift', () => {
        const drift = structuredClone(VALID)
        drift.channels['1262785282957119540']!.messageCount = 99
        const { warnings } = semanticChecks(drift, () => false)
        expect(warnings.some((w) => w.includes('does not exist'))).toBe(true)
        expect(warnings.some((w) => w.includes('99'))).toBe(true)
    })
    test('clean report for a consistent state', () => {
        const { errors, warnings } = semanticChecks(VALID, () => true)
        expect(errors).toEqual([])
        expect(warnings).toEqual([])
    })
})

describe('toJsonSchema', () => {
    test('emits a JSON Schema document', () => {
        const js = toJsonSchema() as Record<string, unknown>
        expect(js['$id']).toBe('exports-state.schema.json')
        expect(JSON.stringify(js)).toContain('channels')
    })
})
