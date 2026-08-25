#!/usr/bin/env bun
/**
 * validate-state.ts - validate discord-sync.json against the zod schema.
 *
 *   discord-sync validate
 *   discord-sync validate path/to/discord-sync.json
 *   discord-sync validate --emit-json-schema   # regen discord-sync.schema.json
 */

import { parseArgs } from 'node:util'
import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DiscordSyncSchema, semanticChecks, toJsonSchema, validateDoc } from '../lib/schema'
import { DEFAULT_CONFIG_PATH } from '../lib/state'
import type { DiscordSyncDoc } from '../lib/types'

export async function validateConfigFile(
    configPath: string
): Promise<{ errors: string[]; warnings: string[] }> {
    const raw = await Bun.file(configPath).json()
    const errors = validateDoc(raw)
    if (errors.length) return { errors, warnings: [] }
    // Parse (applies defaults) before the semantic pass.
    const doc = DiscordSyncSchema.parse(raw) as DiscordSyncDoc
    const base = dirname(resolve(configPath))
    const { errors: semErrors, warnings } = semanticChecks(doc, (dir) => {
        try {
            return statSync(join(base, dir)).isDirectory()
        } catch {
            return false
        }
    })
    return { errors: semErrors, warnings }
}

export async function main(args: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args,
        options: { 'emit-json-schema': { type: 'boolean', default: false } },
        allowPositionals: true
    })

    if (values['emit-json-schema']) {
        const out = join(import.meta.dir, '..', '..', 'discord-sync.schema.json')
        await Bun.write(out, JSON.stringify(toJsonSchema(), null, 2) + '\n')
        console.log(`wrote ${out}`)
    }

    const configPath = positionals[0] ?? DEFAULT_CONFIG_PATH
    if (!existsSync(configPath)) {
        console.error(`error: ${configPath} not found`)
        process.exit(1)
    }
    const { errors, warnings } = await validateConfigFile(configPath)
    for (const w of warnings) console.log(`warning: ${w}`)
    if (errors.length) {
        for (const e of errors) console.error(`error: ${e}`)
        console.error(`INVALID: ${errors.length} error(s)`)
        process.exit(1)
    }
    const doc = (await Bun.file(configPath).json()) as { state?: { channels?: object } }
    const n = Object.keys(doc.state?.channels ?? {}).length
    console.log(`OK: ${configPath} is valid (${n} channel(s) in state)`)
}

if (import.meta.main) await main(Bun.argv.slice(2))
