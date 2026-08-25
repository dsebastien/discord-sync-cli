import { describe, expect, test } from 'bun:test'
import {
    compareSnowflakes,
    discordUrl,
    isSnowflake,
    isoDay,
    planChunks,
    snowflakeToDate
} from './core'

describe('snowflakeToDate', () => {
    test('decodes the canvas-showcase channel creation date', () => {
        expect(isoDay(snowflakeToDate('1262785282957119540'))).toBe('2024-07-16')
    })
    test('epoch snowflake maps to 2015-01-01', () => {
        expect(isoDay(snowflakeToDate('4194304'))).toBe('2015-01-01') // 1 << 22
    })
})

describe('isSnowflake', () => {
    test('accepts 17-20 digit ids', () => {
        expect(isSnowflake('1262785282957119540')).toBe(true)
    })
    test('rejects non-numeric and short strings', () => {
        expect(isSnowflake('abc')).toBe(false)
        expect(isSnowflake('12345')).toBe(false)
        expect(isSnowflake('')).toBe(false)
    })
})

describe('planChunks', () => {
    test('splits a range into half-open windows with no gaps or overlap', () => {
        const chunks = planChunks('2024-01-01', '2024-03-15', 30)
        expect(chunks.length).toBe(3)
        expect(chunks[0]).toEqual({
            after: '2024-01-01 00:00',
            before: '2024-01-31 00:00',
            label: '2024-01-01 -> 2024-01-31'
        })
        // adjacent windows share their boundary
        expect(chunks[1]!.after.slice(0, 10)).toBe(chunks[0]!.before.slice(0, 10))
        // last window is clamped to `to`
        expect(chunks.at(-1)!.before).toBe('2024-03-15 00:00')
    })
    test('rejects inverted ranges and bad steps', () => {
        expect(() => planChunks('2024-02-01', '2024-01-01', 30)).toThrow()
        expect(() => planChunks('2024-01-01', '2024-02-01', 0)).toThrow()
        expect(() => planChunks('bogus', '2024-02-01', 30)).toThrow()
    })
})

describe('compareSnowflakes', () => {
    test('orders ids beyond Number.MAX_SAFE_INTEGER correctly', () => {
        // Same digit count: string order; different counts: length wins.
        expect(compareSnowflakes('1541690758854213693', '1541690758854213694')).toBeLessThan(0)
        expect(compareSnowflakes('999999999999999999', '1000000000000000000')).toBeLessThan(0)
        expect(compareSnowflakes(null, '1')).toBeLessThan(0)
        expect(compareSnowflakes('5', '5')).toBe(0)
    })
})

describe('discordUrl', () => {
    test('builds channel and message deep links', () => {
        expect(discordUrl('686', '126')).toBe('https://discord.com/channels/686/126')
        expect(discordUrl('686', '126', '154')).toBe('https://discord.com/channels/686/126/154')
    })
})
