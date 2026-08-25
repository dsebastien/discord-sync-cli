/** Filesystem helpers shared by the CLI entrypoints. */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { mergeMessages, threadIdOf } from './merge'
import type { DceExport } from './types'

const SKIP_PARTS = new Set(['_assets', 'html', 'md', '.git', 'node_modules'])

/** Transient incremental-delta directories must never be scanned as masters:
 * they hold partial data that would double-count or advance cursors wrongly. */
function isSkipped(name: string): boolean {
    return SKIP_PARTS.has(name) || name.startsWith('_since-') || name.includes('.staging-')
}

/** All export JSON files under a directory, skipping generated folders. */
export function exportFiles(root: string): string[] {
    const out: string[] = []
    const walk = (dir: string) => {
        for (const name of readdirSync(dir).sort()) {
            const full = join(dir, name)
            const st = statSync(full)
            if (st.isDirectory()) {
                if (!isSkipped(name)) walk(full)
            } else if (name.endsWith('.json') && name !== 'manifest.json') {
                out.push(full)
            }
        }
    }
    walk(root)
    return out
}

/** Parse one export file; null when unparsable or not a DCE export. */
export async function loadExport(path: string): Promise<DceExport | null> {
    try {
        const data = (await Bun.file(path).json()) as DceExport
        return Array.isArray(data.messages) ? data : null
    } catch {
        return null
    }
}

/** Subdirectories of cwd that contain export JSONs (default scan roots). */
export function defaultRoots(cwd: string): string[] {
    return readdirSync(cwd)
        .filter((name) => {
            if (isSkipped(name) || name.startsWith('.')) return false
            const full = join(cwd, name)
            try {
                return (
                    statSync(full).isDirectory() &&
                    readdirSync(full).some((f) => f.endsWith('.json'))
                )
            } catch {
                return false
            }
        })
        .sort()
}

/** One rendered thread: its merged export plus a stable output basename. */
export interface AggregatedThread {
    threadId: string
    data: DceExport
    /** Basename (without extension) for the generated html/md file. */
    slug: string
}

function threadSlug(threadId: string, data: DceExport): string {
    const name = (data.channel?.name ?? 'thread')
        .replace(/[^\w.-]+/g, '_')
        .replace(/^[._]+|[._]+$/g, '')
    return `${name || 'thread'} [${threadId}]`
}

/**
 * Group every export file under `root` by thread ID and merge their messages
 * (dedupe by message id, newest metadata wins). This makes partitioned masters
 * and chunked exports render as one page per thread instead of overwriting
 * each other by filename.
 */
export async function aggregateByThread(root: string): Promise<AggregatedThread[]> {
    const byThread = new Map<string, DceExport>()
    const orphans: { data: DceExport; path: string }[] = []
    for (const file of exportFiles(root)) {
        const data = await loadExport(file)
        if (!data) continue
        const tid = threadIdOf(file, data)
        if (!tid) {
            orphans.push({ data, path: file })
            continue
        }
        const existing = byThread.get(tid)
        byThread.set(tid, existing ? mergeMessages(existing, data).merged : data)
    }
    const out: AggregatedThread[] = []
    for (const [threadId, data] of byThread) {
        out.push({ threadId, data, slug: threadSlug(threadId, data) })
    }
    // Files without a resolvable thread id still render under their own name.
    for (const { data, path } of orphans) {
        const base = path
            .split('/')
            .pop()!
            .replace(/\.json$/, '')
        out.push({ threadId: base, data, slug: base })
    }
    return out
}
