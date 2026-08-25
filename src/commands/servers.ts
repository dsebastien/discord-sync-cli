#!/usr/bin/env bun
/**
 * servers.ts - list every Discord server the token can see, with sync markers.
 *
 *   discord-sync servers               ✓ synced   ◇ selected, not yet synced
 *   discord-sync servers --json
 */

import { parseArgs } from 'node:util'
import { DiscordApi, resolveToken } from '../lib/discord-api'
import { guildMark, loadConfig, MARK_GLYPH } from '../lib/sync-config'
import { loadState } from '../lib/state'

export async function main(args: string[]): Promise<void> {
    const { values } = parseArgs({
        args,
        options: {
            token: { type: 'string' },
            json: { type: 'boolean', default: false },
            state: { type: 'string', default: 'exports-state.json' },
            config: { type: 'string', default: 'sync-config.json' }
        }
    })
    const token = await resolveToken(values.token)
    if (!token) {
        console.error('error: no token (use --token, DISCORD_TOKEN, or a .env file)')
        process.exit(1)
    }
    const api = new DiscordApi(token)
    const [guilds, state, config] = await Promise.all([
        api.listGuilds(),
        loadState(values.state),
        loadConfig(values.config)
    ])
    const rows = guilds.map((g) => ({ ...g, mark: guildMark(state, config, g.id) }))
    if (values.json) {
        console.log(JSON.stringify(rows, null, 2))
        return
    }
    for (const r of rows) {
        console.log(`${MARK_GLYPH[r.mark]} ${r.id}  ${r.name}`)
    }
    console.log(`\n${rows.length} server(s) · ✓ synced · ◇ selected, not yet synced`)
}

if (import.meta.main) await main(Bun.argv.slice(2))
