import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LockError, withConfigLock } from './lock'

const cfg = join(tmpdir(), `discord-sync-test-${process.pid}.json`)
const lock = `${cfg}.lock`

afterEach(() => rmSync(lock, { force: true }))

describe('withConfigLock', () => {
    test('runs fn and cleans up the lock', async () => {
        const r = await withConfigLock(cfg, async () => 42)
        expect(r).toBe(42)
        expect(existsSync(lock)).toBe(false)
    })
    test('rejects a second holder while a live lock exists', async () => {
        writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now() }))
        await expect(withConfigLock(cfg, async () => 1)).rejects.toBeInstanceOf(LockError)
    })
    test('reclaims a stale lock (dead pid)', async () => {
        // A very high PID that is essentially never live.
        writeFileSync(lock, JSON.stringify({ pid: 2147483646, at: Date.now() }))
        const r = await withConfigLock(cfg, async () => 'ok')
        expect(r).toBe('ok')
    })
    test('releases the lock even when fn throws', async () => {
        await expect(
            withConfigLock(cfg, async () => {
                throw new Error('boom')
            })
        ).rejects.toThrow('boom')
        expect(existsSync(lock)).toBe(false)
    })
})
