#!/usr/bin/env bun
/**
 * select.ts - add or remove channels from sync-config.json.
 *
 *   discord-sync select -g <GUILD_ID> -c <CHANNEL_ID> [-c ...]
 *   discord-sync select -g <GUILD_ID> --all            # every exportable channel
 *   discord-sync deselect -g <GUILD_ID> -c <CHANNEL_ID>
 *   discord-sync deselect -g <GUILD_ID> --all
 */

import { parseArgs } from 'node:util'
import { DiscordApi, resolveToken, slugify } from '../lib/discord-api'
import { deselectChannel, loadConfig, saveConfig, selectChannel } from '../lib/sync-config'
import { loadState } from '../lib/state'

export function makeMain(mode: 'select' | 'deselect') {
    return async function main(args: string[]): Promise<void> {
        const { values } = parseArgs({
            args,
            options: {
                guild: { type: 'string', short: 'g' },
                channel: { type: 'string', short: 'c', multiple: true },
                all: { type: 'boolean', default: false },
                token: { type: 'string' },
                state: { type: 'string', default: 'exports-state.json' },
                config: { type: 'string', default: 'sync-config.json' }
            }
        })
        if (!values.guild || (!values.channel?.length && !values.all)) {
            console.error(`usage: discord-sync ${mode} -g <GUILD_ID> (-c <CHANNEL_ID> ... | --all)`)
            process.exit(1)
        }
        let config = await loadConfig(values.config)

        if (mode === 'deselect') {
            const targets = values.all
                ? Object.keys(config.guilds[values.guild]?.channels ?? {})
                : values.channel!
            for (const id of targets) {
                config = deselectChannel(config, values.guild, id)
                console.log(`deselected ${id}`)
            }
            await saveConfig(values.config, config)
            return
        }

        // Selecting needs names/directories, so resolve them via the API.
        const token = await resolveToken(values.token)
        if (!token) {
            console.error('error: no token (use --token, DISCORD_TOKEN, or a .env file)')
            process.exit(1)
        }
        const api = new DiscordApi(token)
        const [channels, guilds, state] = await Promise.all([
            api.listChannels(values.guild),
            api.listGuilds(),
            loadState(values.state)
        ])
        const guild = guilds.find((g) => g.id === values.guild)
        if (!guild) {
            console.error(`error: guild ${values.guild} not found among this token's servers`)
            process.exit(1)
        }
        const wanted = values.all
            ? channels
            : values.channel!.map((id) => {
                  const ch = channels.find((c) => c.id === id)
                  if (!ch) {
                      console.error(`error: channel ${id} not found in ${guild.name}`)
                      process.exit(1)
                  }
                  return ch
              })
        for (const ch of wanted) {
            const directory = state.channels[ch.id]?.directory ?? slugify(ch.name)
            config = selectChannel(config, guild, ch, directory)
            console.log(`selected ${ch.id}  ${ch.name} -> ${directory}/`)
        }
        await saveConfig(values.config, config)
    }
}

export const main = makeMain('select')

if (import.meta.main) await main(Bun.argv.slice(2))
