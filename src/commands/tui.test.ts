import { describe, expect, test } from 'bun:test'
import { tokenizeKeys } from './tui'

const ESC = '\x1b'

describe('tokenizeKeys (#19)', () => {
    test('splits coalesced single keys', () => {
        expect(tokenizeKeys('jj')).toEqual(['j', 'j'])
        expect(tokenizeKeys('kqs')).toEqual(['k', 'q', 's'])
    })
    test('keeps CSI escape sequences intact, even when coalesced', () => {
        expect(tokenizeKeys(`${ESC}[A${ESC}[B`)).toEqual([`${ESC}[A`, `${ESC}[B`])
        expect(tokenizeKeys(`${ESC}[5~`)).toEqual([`${ESC}[5~`])
    })
    test('mixes plain keys and escape sequences', () => {
        expect(tokenizeKeys(`j${ESC}[Ak`)).toEqual(['j', `${ESC}[A`, 'k'])
    })
    test('a bare ESC is its own token', () => {
        expect(tokenizeKeys(ESC)).toEqual([ESC])
    })
})
