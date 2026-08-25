#!/usr/bin/env bun
/**
 * generate-html.ts - render exports as readable HTML with an "Explored" toggle.
 *
 * Writes <dir>/html/<thread>.html per thread plus index.html. Asset links are
 * rewritten to <dir>/_assets/ when downloaded. Explored state lives in the
 * browser's localStorage keyed by thread ID (stable across regenerations).
 *
 *   bun run generate-html.ts canvas
 */

import { existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { aggregateByThread, defaultRoots } from '../lib/fs'
import { indexPage, threadPage } from '../lib/render-html'
import type { IndexEntry } from '../lib/render-html'
import type { Manifest } from '../lib/types'

export async function generateHtml(root: string): Promise<number> {
    const manifestPath = join(root, '_assets', 'manifest.json')
    const manifest: Manifest = existsSync(manifestPath)
        ? ((await Bun.file(manifestPath).json()) as Manifest)
        : {}

    const htmlDir = join(root, 'html')
    const entries: IndexEntry[] = []
    let made = 0
    for (const { data, slug, threadId } of await aggregateByThread(root)) {
        mkdirSync(htmlDir, { recursive: true })
        const outName = `${slug}.html`
        await Bun.write(join(htmlDir, outName), threadPage(data, manifest))
        made++
        const msgs = data.messages ?? []
        entries.push({
            name: data.channel?.name ?? slug,
            file: outName,
            count: msgs.length,
            last: msgs
                .reduce((acc, m) => ((m.timestamp ?? '') > acc ? m.timestamp! : acc), '')
                .slice(0, 10),
            tid: data.channel?.id ?? threadId
        })
    }
    if (entries.length) {
        await Bun.write(join(htmlDir, 'index.html'), indexPage(basename(root), entries))
        console.log(`${basename(root)}: wrote ${made} thread pages + index -> ${htmlDir}/`)
    } else {
        console.log(`${basename(root)}: no exports found`)
    }
    return made
}

export async function main(args: string[]): Promise<void> {
    const { positionals } = parseArgs({ args: args, allowPositionals: true })
    const roots = positionals.length ? positionals : defaultRoots(process.cwd())
    if (!roots.length) {
        console.error('nothing to scan')
        process.exit(1)
    }
    for (const root of roots) await generateHtml(root)
}

if (import.meta.main) await main(Bun.argv.slice(2))
