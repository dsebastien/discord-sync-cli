#!/usr/bin/env bun
/**
 * channels.ts - list the exportable channels of one server, with sync markers.
 *
 *   discord-sync channels -g 686053708261228577
 *   discord-sync channels -g <ID> --json
 */

import { parseArgs } from 'node:util'
import { channelKind, DiscordApi, resolveToken } from '../lib/discord-api'
import { channelMark, MARK_GLYPH } from '../lib/sync-config'
import { DEFAULT_CONFIG_PATH, loadDoc } from '../lib/state'

export async function main(args: string[]): Promise<void> {
    const { values } = parseArgs({
        args,
        options: {
            guild: { type: 'string', short: 'g' },
            token: { type: 'string' },
            json: { type: 'boolean', default: false },
            config: { type: 'string', default: DEFAULT_CONFIG_PATH }
        }
    })
    if (!values.guild) {
        console.error('error: --guild is required')
        process.exit(1)
    }
    const token = await resolveToken(values.token)
    if (!token) {
        console.error('error: no token (use --token, DISCORD_TOKEN, or a .env file)')
        process.exit(1)
    }
    const api = new DiscordApi(token)
    const [channels, doc] = await Promise.all([
        api.listChannels(values.guild),
        loadDoc(values.config)
    ])
    const rows = channels.map((c) => ({
        id: c.id,
        name: c.name,
        kind: channelKind(c),
        category: c.category,
        mark: channelMark(doc, values.guild!, c.id)
    }))
    if (values.json) {
        console.log(JSON.stringify(rows, null, 2))
        return
    }
    for (const r of rows) {
        const cat = r.category ? `${r.category} / ` : ''
        console.log(`${MARK_GLYPH[r.mark]} ${r.id}  [${r.kind}] ${cat}${r.name}`)
    }
    console.log(`\n${rows.length} channel(s) · ✓ synced · ◇ selected, not yet synced`)
}

if (import.meta.main) await main(Bun.argv.slice(2))
