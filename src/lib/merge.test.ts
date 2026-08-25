import { describe, expect, test } from 'bun:test'
import { mergeMessages, threadIdOf } from './merge'
import type { DceExport } from './types'

const master: DceExport = {
    channel: { id: '111111111111111111' },
    exportedAt: '2026-08-01T00:00:00Z',
    messages: [
        { id: '100000000000000001', timestamp: '2026-01-01T00:00:00+00:00' },
        { id: '100000000000000002', timestamp: '2026-02-01T00:00:00+00:00' }
    ]
}

describe('mergeMessages', () => {
    test('appends only unseen messages, keeps chronological order', () => {
        const delta: DceExport = {
            exportedAt: '2026-08-25T00:00:00Z',
            messages: [
                { id: '100000000000000002', timestamp: '2026-02-01T00:00:00+00:00' }, // duplicate
                { id: '100000000000000000', timestamp: '2025-12-01T00:00:00+00:00' }, // older than master
                { id: '100000000000000003', timestamp: '2026-03-01T00:00:00+00:00' }
            ]
        }
        const { merged, added } = mergeMessages(master, delta)
        expect(added).toBe(2)
        expect(merged.messages!.map((m) => m.id)).toEqual([
            '100000000000000000',
            '100000000000000001',
            '100000000000000002',
            '100000000000000003'
        ])
        expect(merged.exportedAt).toBe('2026-08-25T00:00:00Z')
        expect((merged as { messageCount?: number }).messageCount).toBe(4)
    })
    test('no-op when everything is already present', () => {
        const { merged, added } = mergeMessages(master, { messages: master.messages })
        expect(added).toBe(0)
        expect(merged).toBe(master)
    })
})

describe('threadIdOf', () => {
    test('prefers the channel id, falls back to the [id] in the filename', () => {
        expect(threadIdOf('x.json', { channel: { id: '42' } })).toBe('42')
        expect(threadIdOf('Guild - chan - Name [123456789012345678].json', {})).toBe(
            '123456789012345678'
        )
        expect(threadIdOf('plain.json', {})).toBeNull()
    })
})
