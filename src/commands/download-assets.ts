#!/usr/bin/env bun
/**
 * download-assets.ts - fetch every asset referenced by the JSON exports.
 *
 * Collects attachment/embed/sticker URLs into <dir>/_assets/ with a
 * manifest.json keyed on the URL path (Discord's signed query params expire).
 * Reruns skip anything already fetched; expired links are recorded as failed.
 *
 *   bun run download-assets.ts canvas
 *   bun run download-assets.ts canvas --delay 1 --retry-failed
 */

import { parseArgs } from 'node:util'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { collectAssets, derivedName, safeName, urlKey } from '../lib/assets'
import { blockReason } from '../lib/net-guard'
import { jittered, sleep } from '../lib/core'
import { defaultRoots, exportFiles, loadExport } from '../lib/fs'
import type { Manifest } from '../lib/types'

const UA = 'discord-sync-cli/1.0 (archival; contact: repo owner)'

async function fetchAsset(
    url: string,
    dest: string,
    retries: number
): Promise<{ ok: boolean; note: string }> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Follow redirects manually so every hop is SSRF-checked, not just
            // the first URL (a public URL can 302 to http://169.254.169.254).
            let current = url
            let resp: Response | null = null
            for (let hop = 0; hop < 5; hop++) {
                const blocked = await blockReason(current)
                if (blocked) return { ok: false, note: `blocked: ${blocked}` }
                resp = await fetch(current, {
                    headers: { 'User-Agent': UA },
                    redirect: 'manual'
                })
                if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
                    current = new URL(resp.headers.get('location')!, current).href
                    continue
                }
                break
            }
            if (!resp) return { ok: false, note: 'too many redirects' }
            if (resp.ok) {
                await Bun.write(dest, resp)
                return { ok: true, note: 'ok' }
            }
            if ([403, 404, 410].includes(resp.status)) {
                return { ok: false, note: `http ${resp.status} (link likely expired)` }
            }
            if (resp.status === 429) {
                const wait = Number(resp.headers.get('Retry-After') ?? 5) || 5
                await sleep(Math.min(wait + 1, 120) * 1000)
                continue
            }
            if (attempt === retries) return { ok: false, note: `http ${resp.status}` }
        } catch (e) {
            if (attempt === retries) return { ok: false, note: String(e) }
        }
        await sleep(Math.min(2 ** attempt, 30) * 1000)
    }
    return { ok: false, note: 'exhausted retries' }
}

export async function downloadAssets(
    root: string,
    opts: {
        delay: number
        jitter: number
        retries: number
        retryFailed: boolean
        dryRun: boolean
    }
): Promise<Manifest> {
    const wanted = new Map<string, { url: string; fileName: string }>()
    for (const file of exportFiles(root)) {
        const data = await loadExport(file)
        if (!data) continue
        for (const ref of collectAssets(data)) {
            const key = urlKey(ref.url)
            if (!wanted.has(key)) {
                wanted.set(key, {
                    url: ref.url,
                    fileName: ref.fileName ? safeName(ref.fileName) : await derivedName(ref.url)
                })
            }
        }
    }

    const assetsDir = join(root, '_assets')
    const manifestPath = join(assetsDir, 'manifest.json')
    const manifest: Manifest = existsSync(manifestPath)
        ? ((await Bun.file(manifestPath).json()) as Manifest)
        : {}

    const todo: { key: string; url: string; fileName: string }[] = []
    for (const [key, { url, fileName }] of [...wanted].sort()) {
        const entry = manifest[key]
        if (entry?.file && existsSync(join(assetsDir, entry.file))) continue
        if (entry?.error && !opts.retryFailed) continue
        todo.push({ key, url, fileName })
    }

    console.log(
        `${basename(root)}: ${wanted.size} assets referenced, ${wanted.size - todo.length} already handled, ${todo.length} to download`
    )
    if (!todo.length) return manifest

    mkdirSync(assetsDir, { recursive: true })
    let ok = 0,
        failed = 0
    for (let i = 0; i < todo.length; i++) {
        const { key, url, fileName } = todo[i]!
        const dest = join(assetsDir, fileName)
        if (existsSync(dest)) {
            manifest[key] = { file: fileName }
            continue
        }
        if (opts.dryRun) {
            console.log(`  would fetch ${url} -> _assets/${fileName}`)
            continue
        }
        const result = await fetchAsset(url, dest, opts.retries)
        if (result.ok) {
            manifest[key] = { file: fileName }
            ok++
        } else {
            manifest[key] = { error: result.note, url }
            failed++
            console.error(`  FAIL ${fileName}: ${result.note}`)
        }
        if ((i + 1) % 25 === 0 || i + 1 === todo.length) {
            console.log(`  [${i + 1}/${todo.length}] ok=${ok} failed=${failed}`)
            await Bun.write(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
        }
        if (i + 1 < todo.length) await sleep(jittered(opts.delay, opts.jitter))
    }

    if (!opts.dryRun) {
        await Bun.write(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
        console.log(`${basename(root)}: done, ok=${ok} failed=${failed}`)
    }
    return manifest
}

export async function main(args: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args: args,
        options: {
            'delay': { type: 'string', default: '0.4' },
            'jitter': { type: 'string', default: '0.4' },
            'retries': { type: 'string', default: '4' },
            'retry-failed': { type: 'boolean', default: false },
            'dry-run': { type: 'boolean', default: false }
        },
        allowPositionals: true
    })
    const roots = positionals.length ? positionals : defaultRoots(process.cwd())
    if (!roots.length) {
        console.error('nothing to scan')
        process.exit(1)
    }
    for (const root of roots) {
        await downloadAssets(root, {
            delay: Number(values.delay),
            jitter: Number(values.jitter),
            retries: Number(values.retries),
            retryFailed: values['retry-failed'],
            dryRun: values['dry-run']
        })
    }
}

if (import.meta.main) await main(Bun.argv.slice(2))
