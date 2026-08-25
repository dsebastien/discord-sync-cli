/** A best-effort advisory lock so two processes don't mutate the same
 * discord-sync.json (and its archive) at once and lose each other's writes. */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const STALE_MS = 6 * 60 * 60 * 1000 // 6h: longer than any realistic sync run

function lockPath(configPath: string): string {
    return `${configPath}.lock`
}

export class LockError extends Error {}

/** Run `fn` while holding an exclusive lock for `configPath`. Throws LockError
 * if another live process already holds it. A stale lock (dead PID, or older
 * than STALE_MS) is reclaimed. */
export async function withConfigLock<T>(configPath: string, fn: () => Promise<T>): Promise<T> {
    const path = lockPath(configPath)

    if (existsSync(path)) {
        const stale = isStale(path)
        if (!stale) {
            throw new LockError(
                `another discord-sync process holds ${path}; wait for it or remove the file if it is stale`
            )
        }
        rmSync(path, { force: true })
    }

    writeFileSync(path, JSON.stringify({ pid: process.pid, at: Date.now() }) + '\n', {
        flag: 'w'
    })
    try {
        return await fn()
    } finally {
        rmSync(path, { force: true })
    }
}

function isStale(path: string): boolean {
    try {
        const info = JSON.parse(readFileSync(path, 'utf8')) as { pid?: number; at?: number }
        const ageOk = typeof info.at === 'number' && Date.now() - info.at < STALE_MS
        const pidAlive = typeof info.pid === 'number' && isAlive(info.pid)
        return !ageOk || !pidAlive
    } catch {
        return true // unreadable lock -> treat as stale
    }
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch (e) {
        // ESRCH = no such process; EPERM = exists but not ours (still alive).
        return (e as NodeJS.ErrnoException).code === 'EPERM'
    }
}
