#!/usr/bin/env bun
/**
 * validate-state.ts - validate exports-state.json against the zod schema.
 *
 *   bun run src/validate-state.ts
 *   bun run src/validate-state.ts path/to/state.json
 *   bun run src/validate-state.ts --emit-json-schema   # regen exports-state.schema.json
 */

import { parseArgs } from 'node:util'
import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { semanticChecks, toJsonSchema, validateState } from '../lib/schema'
import type { ExportsState } from '../lib/types'

export async function validateStateFile(
    statePath: string
): Promise<{ errors: string[]; warnings: string[] }> {
    const state = (await Bun.file(statePath).json()) as ExportsState
    const errors = validateState(state)
    const base = dirname(resolve(statePath))
    const { errors: semErrors, warnings } = semanticChecks(state, (dir) => {
        try {
            return statSync(join(base, dir)).isDirectory()
        } catch {
            return false
        }
    })
    return { errors: [...errors, ...semErrors], warnings }
}

export async function main(args: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args: args,
        options: { 'emit-json-schema': { type: 'boolean', default: false } },
        allowPositionals: true
    })

    if (values['emit-json-schema']) {
        const out = join(import.meta.dir, '..', 'exports-state.schema.json')
        await Bun.write(out, JSON.stringify(toJsonSchema(), null, 2) + '\n')
        console.log(`wrote ${out}`)
    }

    const statePath = positionals[0] ?? 'exports-state.json'
    if (!existsSync(statePath)) {
        console.error(`error: ${statePath} not found`)
        process.exit(1)
    }
    const { errors, warnings } = await validateStateFile(statePath)
    for (const w of warnings) console.log(`warning: ${w}`)
    if (errors.length) {
        for (const e of errors) console.error(`error: ${e}`)
        console.error(`INVALID: ${errors.length} error(s)`)
        process.exit(1)
    }
    const state = (await Bun.file(statePath).json()) as ExportsState
    console.log(
        `OK: ${statePath} is valid (${Object.keys(state.channels ?? {}).length} channel(s))`
    )
}

if (import.meta.main) await main(Bun.argv.slice(2))
