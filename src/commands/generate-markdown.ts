#!/usr/bin/env bun
/**
 * generate-markdown.ts - render exports as Markdown with YAML frontmatter.
 *
 * Writes <dir>/md/<thread>.md per thread: frontmatter with explore: false by
 * default (preserved on regeneration, so flipping it in Obsidian survives a
 * re-sync), thread metadata, the Discord deep link, then the messages.
 *
 *   bun run generate-markdown.ts canvas
 */

import { existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { aggregateByThread, defaultRoots } from '../lib/fs'
import { threadMarkdown } from '../lib/render-md'
import type { FrontmatterValue, Manifest } from '../lib/types'

export async function generateMarkdown(
    root: string,
    frontmatter: Record<string, FrontmatterValue> = {}
): Promise<number> {
    const manifestPath = join(root, '_assets', 'manifest.json')
    const manifest: Manifest = existsSync(manifestPath)
        ? ((await Bun.file(manifestPath).json()) as Manifest)
        : {}

    const mdDir = join(root, 'md')
    let made = 0
    for (const { data, slug } of await aggregateByThread(root)) {
        mkdirSync(mdDir, { recursive: true })
        const out = join(mdDir, `${slug}.md`)
        const existing = existsSync(out) ? await Bun.file(out).text() : null
        await Bun.write(out, threadMarkdown(data, manifest, existing, frontmatter))
        made++
    }
    console.log(`${basename(root)}: wrote ${made} markdown file(s) -> ${mdDir}/`)
    return made
}

export async function main(args: string[]): Promise<void> {
    const { positionals } = parseArgs({ args: args, allowPositionals: true })
    const roots = positionals.length ? positionals : defaultRoots(process.cwd())
    if (!roots.length) {
        console.error('nothing to scan')
        process.exit(1)
    }
    for (const root of roots) await generateMarkdown(root)
}

if (import.meta.main) await main(Bun.argv.slice(2))
