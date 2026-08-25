/** Filesystem helpers shared by the CLI entrypoints. */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
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
