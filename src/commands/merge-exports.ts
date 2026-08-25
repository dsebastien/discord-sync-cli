#!/usr/bin/env bun
/**
 * merge-exports.ts - fold incremental delta exports into master export files.
 *
 * An incremental run (export-channel.ts --since-state) writes partial thread
 * files into <dir>/_since-<date>/. This merges those messages into the
 * matching master file (dedupe by message ID, sorted by timestamp), adopts
 * files for brand-new threads, and removes the delta folder.
 *
 *   bun run merge-exports.ts canvas/_since-2026-08-25
 */

import { parseArgs } from 'node:util'
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { mergeMessages, threadIdOf } from '../lib/merge'
import { loadExport } from '../lib/fs'

export async function mergeDeltaDir(
    deltaDir: string,
    masterDir: string,
    keep = false
): Promise<{ merged: number; adopted: number; unchanged: number }> {
    // Map thread id -> master files (partitioned threads have several).
    const masters = new Map<string, string[]>()
    for (const name of readdirSync(masterDir).sort()) {
        if (!name.endsWith('.json') || name === 'manifest.json') continue
        const full = join(masterDir, name)
        const data = await loadExport(full)
        if (!data) continue
        const tid = threadIdOf(full, data)
        if (tid) masters.set(tid, [...(masters.get(tid) ?? []), full])
    }

    let merged = 0,
        adopted = 0,
        unchanged = 0
    for (const name of readdirSync(deltaDir).sort()) {
        if (!name.endsWith('.json')) continue
        const full = join(deltaDir, name)
        const delta = await loadExport(full)
        if (!delta) continue
        const tid = threadIdOf(full, delta)
        const parts = tid ? masters.get(tid) : undefined

        if (!parts) {
            // Brand-new thread: adopt the delta file wholesale.
            let target = join(masterDir, name)
            if (existsSync(target)) target = join(masterDir, name.replace(/\.json$/, '.new.json'))
            renameSync(full, target)
            if (tid) masters.set(tid, [target])
            adopted++
            console.log(`new thread: ${basename(target)} (${delta.messages?.length ?? 0} messages)`)
            continue
        }

        // Merge into the last partition; dedupe against ALL partitions.
        const seen = new Set<string>()
        for (const p of parts) {
            for (const m of (await loadExport(p))?.messages ?? []) {
                if (m.id) seen.add(m.id)
            }
        }
        const target = parts.at(-1)!
        const master = await loadExport(target)
        if (!master) continue
        const deltaForTarget = {
            ...delta,
            messages: (delta.messages ?? []).filter((m) => !m.id || !seen.has(m.id))
        }
        const { merged: result, added } = mergeMessages(master, deltaForTarget)
        if (added === 0) {
            unchanged++
            continue
        }
        await Bun.write(target, JSON.stringify(result, null, 2) + '\n')
        merged++
        console.log(`merged ${String(added).padStart(4)} new message(s) into ${basename(target)}`)
    }

    console.log(`done: ${merged} thread(s) updated, ${adopted} new, ${unchanged} unchanged`)
    if (!keep) {
        rmSync(deltaDir, { recursive: true, force: true })
        console.log(`removed ${deltaDir}`)
    }
    return { merged, adopted, unchanged }
}

export async function main(args: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args: args,
        options: {
            into: { type: 'string' },
            keep: { type: 'boolean', default: false }
        },
        allowPositionals: true
    })
    const deltaDir = positionals[0]
    if (!deltaDir || !existsSync(deltaDir)) {
        console.error('usage: bun run merge-exports.ts <delta-dir> [--into DIR] [--keep]')
        process.exit(1)
    }
    await mergeDeltaDir(deltaDir, values.into ?? dirname(deltaDir), values.keep)
}

if (import.meta.main) await main(Bun.argv.slice(2))
