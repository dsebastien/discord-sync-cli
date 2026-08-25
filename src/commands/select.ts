#!/usr/bin/env bun
/**
 * select.ts - add or remove channels from discord-sync.json.
 *
 *   discord-sync select -g <GUILD_ID> -c <CHANNEL_ID> [-c ...]
 *   discord-sync select -g <GUILD_ID> --all            # every exportable channel
 *   discord-sync deselect -g <GUILD_ID> -c <CHANNEL_ID>
 *   discord-sync deselect -g <GUILD_ID> --all
 */

import { parseArgs } from 'node:util'
import { DiscordApi, resolveToken, slugify } from '../lib/discord-api'
import { deselectChannel, directoryTaken, selectChannel } from '../lib/sync-config'
import { DEFAULT_CONFIG_PATH, loadDoc, saveDoc } from '../lib/state'

export function makeMain(mode: 'select' | 'deselect') {
    return async function main(args: string[]): Promise<void> {
        const { values } = parseArgs({
            args,
            options: {
                guild: { type: 'string', short: 'g' },
                channel: { type: 'string', short: 'c', multiple: true },
                all: { type: 'boolean', default: false },
                token: { type: 'string' },
                config: { type: 'string', default: DEFAULT_CONFIG_PATH }
            }
        })
        if (!values.guild || (!values.channel?.length && !values.all)) {
            console.error(`usage: discord-sync ${mode} -g <GUILD_ID> (-c <CHANNEL_ID> ... | --all)`)
            process.exit(1)
        }
        let doc = await loadDoc(values.config)

        if (mode === 'deselect') {
            const targets = values.all
                ? Object.keys(doc.guilds[values.guild]?.channels ?? {})
                : values.channel!
            for (const id of targets) {
                doc = deselectChannel(doc, values.guild, id)
                console.log(`deselected ${id}`)
            }
            await saveDoc(values.config, doc)
            return
        }

        // Selecting needs names/directories, so resolve them via the API.
        const token = await resolveToken(values.token)
        if (!token) {
            console.error('error: no token (use --token, DISCORD_TOKEN, or a .env file)')
            process.exit(1)
        }
        const api = new DiscordApi(token)
        const [channels, guilds] = await Promise.all([
            api.listChannels(values.guild),
            api.listGuilds()
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
            let directory = doc.state.channels[ch.id]?.directory ?? slugify(ch.name)
            // Avoid two channels writing into the same folder (silent data mixing).
            if (directoryTaken(doc, directory, ch.id)) {
                const disambiguated = `${directory}-${ch.id}`
                console.error(
                    `note: directory '${directory}/' is taken; using '${disambiguated}/' for ${ch.name}`
                )
                directory = disambiguated
            }
            doc = selectChannel(doc, guild, ch, directory)
            console.log(`selected ${ch.id}  ${ch.name} -> ${directory}/`)
        }
        await saveDoc(values.config, doc)
    }
}

export const main = makeMain('select')

if (import.meta.main) await main(Bun.argv.slice(2))
