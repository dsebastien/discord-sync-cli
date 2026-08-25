import { describe, expect, test } from 'bun:test'
import { buildChannelState, summarize } from './state'
import type { DceExport } from './types'

const thread = (id: string, msgs: [string, string][]): DceExport => ({
    guild: { id: '686053708261228577', name: 'OMG' },
    channel: {
        id,
        type: 'GuildPublicThread',
        categoryId: '1262785282957119540',
        category: 'canvas-showcase',
        name: `t${id}`
    },
    messages: msgs.map(([mid, ts]) => ({ id: mid, timestamp: ts, author: { name: 'seb' } }))
})

describe('summarize', () => {
    test('maps a thread export to its parent channel', () => {
        const s = summarize(
            thread('111111111111111111', [['222222222222222222', '2026-01-01T00:00:00+00:00']])
        )
        expect(s.channelId).toBe('1262785282957119540')
        expect(s.channelName).toBe('canvas-showcase')
        expect(s.threadId).toBe('111111111111111111')
        expect(s.lastMessageId).toBe('222222222222222222')
    })
    test('picks the newest message by timestamp, snowflake as tiebreak', () => {
        const s = summarize(
            thread('111111111111111111', [
                ['333333333333333333', '2026-01-02T00:00:00+00:00'],
                ['444444444444444444', '2026-01-02T00:00:00+00:00'],
                ['222222222222222222', '2026-01-03T00:00:00+00:00']
            ])
        )
        expect(s.lastMessageId).toBe('222222222222222222')
    })
    test('empty thread yields null cursor', () => {
        const s = summarize(thread('111111111111111111', []))
        expect(s.lastMessageId).toBeNull()
        expect(s.messageCount).toBe(0)
    })
})

describe('buildChannelState', () => {
    test('aggregates threads and finds the channel-wide tip', () => {
        const summaries = [
            summarize(
                thread('111111111111111111', [['222222222222222222', '2026-01-01T00:00:00+00:00']])
            ),
            summarize(
                thread('555555555555555555', [['666666666666666666', '2026-02-01T00:00:00+00:00']])
            )
        ]
        const ch = buildChannelState(summaries, {
            directory: 'canvas',
            now: '2026-08-25T00:00:00Z'
        })
        expect(ch.threadCount).toBe(2)
        expect(ch.messageCount).toBe(2)
        expect(ch.lastThreadId).toBe('555555555555555555')
        expect(ch.lastMessageId).toBe('666666666666666666')
        expect(ch.name).toBe('canvas-showcase')
    })
    test('partitioned threads sum counts but keep the newest cursor', () => {
        const part1 = summarize(
            thread('111111111111111111', [['222222222222222222', '2026-01-01T00:00:00+00:00']])
        )
        const part2 = summarize(
            thread('111111111111111111', [['777777777777777777', '2026-03-01T00:00:00+00:00']])
        )
        const ch = buildChannelState([part1, part2], {
            directory: 'canvas',
            now: '2026-08-25T00:00:00Z'
        })
        expect(ch.threadCount).toBe(1)
        expect(ch.messageCount).toBe(2)
        expect(ch.threads['111111111111111111']!.lastMessageId).toBe('777777777777777777')
    })
    test('name override and previous-name fallback', () => {
        const s = [summarize(thread('111111111111111111', []))]
        expect(
            buildChannelState(s, {
                directory: 'd',
                now: '2026-01-01T00:00:00Z',
                nameOverride: 'forced'
            }).name
        ).toBe('forced')
    })
})
