#!/usr/bin/env bun
/**
 * sync-all.ts - sync every channel chosen in sync-config.json.
 *
 *   discord-sync sync-all                    # everything configured
 *   discord-sync sync-all -g <GUILD_ID>      # one server only
 *   discord-sync sync-all --full             # force full re-exports
 */

import { parseArgs } from 'node:util'
import { loadConfig } from '../lib/sync-config'
import { syncOne, SyncError } from './sync-channel'

export async function main(args: string[]): Promise<void> {
    const { values } = parseArgs({
        args,
        options: {
            'guild': { type: 'string', short: 'g' },
            'full': { type: 'boolean', default: false },
            'skip-assets': { type: 'boolean', default: false },
            'state': { type: 'string', default: 'exports-state.json' },
            'config': { type: 'string', default: 'sync-config.json' }
        }
    })
    if (!process.env['DISCORD_TOKEN']) {
        console.error('error: DISCORD_TOKEN is not set')
        process.exit(1)
    }
    const config = await loadConfig(values.config)
    const guilds = Object.entries(config.guilds).filter(
        ([id]) => !values.guild || id === values.guild
    )
    const jobs = guilds.flatMap(([, g]) =>
        Object.entries(g.channels).map(([id, ch]) => ({ id, ...ch, guildName: g.name }))
    )
    if (!jobs.length) {
        console.error(
            values.guild
                ? `nothing selected for guild ${values.guild} in ${values.config}`
                : `nothing selected in ${values.config} - run 'discord-sync tui' or 'discord-sync select'`
        )
        process.exit(1)
    }

    console.log(`syncing ${jobs.length} channel(s)\n`)
    const failures: string[] = []
    for (const [i, job] of jobs.entries()) {
        console.log(`[${i + 1}/${jobs.length}] ${job.guildName} / ${job.name}`)
        try {
            await syncOne({
                channel: job.id,
                out: job.directory,
                name: job.name,
                full: values.full,
                skipAssets: values['skip-assets'],
                stateFile: values.state
            })
        } catch (e) {
            if (e instanceof SyncError) {
                console.error(`FAILED ${job.name}: ${e.message} - continuing`)
                failures.push(job.name)
            } else {
                throw e
            }
        }
        console.log('')
    }
    if (failures.length) {
        console.error(`done with ${failures.length} failure(s): ${failures.join(', ')}`)
        process.exit(1)
    }
    console.log('all channels synced')
}

if (import.meta.main) await main(Bun.argv.slice(2))
