#!/usr/bin/env bun
/**
 * tui.ts - interactive terminal UI for browsing servers and channels.
 *
 *   discord-sync tui
 *
 * Keys: up/down or j/k move · enter/l open server · esc/h back
 *       space select/deselect channel (or every channel of a server)
 *       s queue sync of the highlighted item · S queue everything selected
 *       q quit (queued syncs run after the screen closes)
 *
 * Markers: ✓ synced · ◇ selected, not yet synced
 *
 * The TUI edits sync-config.json as you toggle. Queued syncs run AFTER the
 * alternate screen closes, so docker/export output stays plain and scrollable.
 */

import { parseArgs } from 'node:util'
import { channelKind, DiscordApi, resolveToken, slugify } from '../lib/discord-api'
import type { Channel, Guild } from '../lib/discord-api'
import {
    channelMark,
    deselectChannel,
    guildMark,
    loadConfig,
    MARK_GLYPH,
    saveConfig,
    selectChannel
} from '../lib/sync-config'
import type { SyncConfig } from '../lib/sync-config'
import { loadState } from '../lib/state'
import type { ExportsState } from '../lib/types'
import { syncOne, SyncError } from './sync-channel'

const ESC = '\x1b'
const ALT_ON = `${ESC}[?1049h${ESC}[?25l`
const ALT_OFF = `${ESC}[?25h${ESC}[?1049l`
const CLEAR = `${ESC}[2J${ESC}[H`
const DIM = `${ESC}[2m`
const BOLD = `${ESC}[1m`
const INV = `${ESC}[7m`
const GREEN = `${ESC}[32m`
const CYAN = `${ESC}[36m`
const RESET = `${ESC}[0m`

interface Job {
    guild: Guild
    channel: { id: string; name: string; directory: string }
}

interface Ui {
    pane: 'guilds' | 'channels'
    guilds: Guild[]
    guildIdx: number
    channels: (Channel & { category: string | null })[]
    channelIdx: number
    channelCache: Map<string, (Channel & { category: string | null })[]>
    status: string
    queue: Job[]
    state: ExportsState
    config: SyncConfig
    configPath: string
}

function rows(): number {
    return process.stdout.rows || 24
}
function cols(): number {
    return process.stdout.columns || 80
}

function line(s: string): string {
    const width = cols()
    // Rough truncation; markers and names are plain-width text.
    return s.length > width ? s.slice(0, width - 1) + '…' : s
}

function glyph(mark: keyof typeof MARK_GLYPH): string {
    const g = MARK_GLYPH[mark]
    return mark === 'synced'
        ? `${GREEN}${g}${RESET}`
        : mark === 'selected'
          ? `${CYAN}${g}${RESET}`
          : g
}

function render(ui: Ui): void {
    const height = rows() - 4
    const out: string[] = []
    const title =
        ui.pane === 'guilds'
            ? 'discord-sync · servers'
            : `discord-sync · ${ui.guilds[ui.guildIdx]?.name ?? ''} · channels`
    out.push(`${BOLD}${line(title)}${RESET}`)

    const items =
        ui.pane === 'guilds'
            ? ui.guilds.map((g, i) => ({
                  key: i,
                  text: `${glyph(guildMark(ui.state, ui.config, g.id))} ${g.name}`,
                  plain: g.name
              }))
            : ui.channels.map((c, i) => {
                  const guild = ui.guilds[ui.guildIdx]!
                  const cat = c.category ? `${DIM}${c.category} /${RESET} ` : ''
                  return {
                      key: i,
                      text: `${glyph(channelMark(ui.state, ui.config, guild.id, c.id))} ${cat}${c.name} ${DIM}[${channelKind(c)}]${RESET}`,
                      plain: c.name
                  }
              })
    const idx = ui.pane === 'guilds' ? ui.guildIdx : ui.channelIdx
    const top = Math.max(0, Math.min(idx - Math.floor(height / 2), items.length - height))
    for (let i = top; i < Math.min(items.length, top + height); i++) {
        const item = items[i]!
        out.push(i === idx ? `${INV}${line(` ${item.text} `)}${RESET}` : line(` ${item.text}`))
    }
    for (let i = items.length - top; i < height; i++) out.push('')

    const queued = ui.queue.length ? ` · ${ui.queue.length} sync(s) queued` : ''
    out.push(line(`${DIM}${ui.status}${queued}${RESET}`))
    out.push(
        line(
            `${DIM}↑↓/jk move · ⏎/l open · esc/h back · space select · s sync this · S sync selected · q quit${RESET}`
        )
    )
    process.stdout.write(CLEAR + out.join('\n'))
}

function queueJob(ui: Ui, guild: Guild, id: string, name: string): void {
    const directory =
        ui.state.channels[id]?.directory ??
        ui.config.guilds[guild.id]?.channels[id]?.directory ??
        slugify(name)
    if (!ui.queue.some((j) => j.channel.id === id)) {
        ui.queue.push({ guild, channel: { id, name, directory } })
    }
}

async function toggleChannel(
    ui: Ui,
    guild: Guild,
    ch: { id: string; name: string }
): Promise<void> {
    if (ui.config.guilds[guild.id]?.channels[ch.id]) {
        ui.config = deselectChannel(ui.config, guild.id, ch.id)
        ui.status = `deselected ${ch.name}`
    } else {
        const directory = ui.state.channels[ch.id]?.directory ?? slugify(ch.name)
        ui.config = selectChannel(ui.config, guild, ch, directory)
        ui.status = `selected ${ch.name} -> ${directory}/`
    }
    await saveConfig(ui.configPath, ui.config)
}

async function openGuild(ui: Ui): Promise<void> {
    const guild = ui.guilds[ui.guildIdx]
    if (!guild) return
    if (!ui.channelCache.has(guild.id)) {
        ui.status = `loading channels of ${guild.name}...`
        render(ui)
        const api = apiRef!
        ui.channelCache.set(guild.id, await api.listChannels(guild.id))
    }
    ui.channels = ui.channelCache.get(guild.id)!
    ui.channelIdx = 0
    ui.pane = 'channels'
    ui.status = `${ui.channels.length} exportable channel(s)`
}

let apiRef: DiscordApi | null = null

export async function main(args: string[]): Promise<void> {
    const { values } = parseArgs({
        args,
        options: {
            token: { type: 'string' },
            state: { type: 'string', default: 'exports-state.json' },
            config: { type: 'string', default: 'sync-config.json' }
        }
    })
    const token = await resolveToken(values.token)
    if (!token) {
        console.error('error: no token (use --token, DISCORD_TOKEN, or a .env file)')
        process.exit(1)
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error(
            'error: the TUI needs a terminal; use the servers/channels/select/sync commands instead'
        )
        process.exit(1)
    }
    apiRef = new DiscordApi(token)

    console.log('loading servers...')
    const [guilds, state, config] = await Promise.all([
        apiRef.listGuilds(),
        loadState(values.state),
        loadConfig(values.config)
    ])
    const ui: Ui = {
        pane: 'guilds',
        guilds,
        guildIdx: 0,
        channels: [],
        channelIdx: 0,
        channelCache: new Map(),
        status: `${guilds.length} server(s)`,
        queue: [],
        state,
        config,
        configPath: values.config
    }

    process.stdout.write(ALT_ON)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    const cleanup = () => {
        process.stdin.setRawMode(false)
        process.stdout.write(ALT_OFF)
    }
    process.on('SIGINT', () => {
        cleanup()
        process.exit(130)
    })
    process.stdout.on('resize', () => render(ui))
    render(ui)

    try {
        for await (const chunk of process.stdin) {
            const key = chunk.toString()
            const list = ui.pane === 'guilds' ? ui.guilds : ui.channels
            const move = (d: number) => {
                if (ui.pane === 'guilds') {
                    ui.guildIdx = Math.max(0, Math.min(ui.guilds.length - 1, ui.guildIdx + d))
                } else {
                    ui.channelIdx = Math.max(0, Math.min(ui.channels.length - 1, ui.channelIdx + d))
                }
            }

            if (key === 'q' || key === `${ESC}` || (key === `${ESC}` && ui.pane === 'guilds')) {
                if (key === 'q' || ui.pane === 'guilds') break
            }
            if (key === `${ESC}[A` || key === 'k') move(-1)
            else if (key === `${ESC}[B` || key === 'j') move(1)
            else if (key === `${ESC}[5~`) move(-10)
            else if (key === `${ESC}[6~`) move(10)
            else if ((key === '\r' || key === `${ESC}[C` || key === 'l') && ui.pane === 'guilds') {
                await openGuild(ui)
            } else if (
                (key === `${ESC}` || key === `${ESC}[D` || key === 'h') &&
                ui.pane === 'channels'
            ) {
                ui.pane = 'guilds'
                ui.status = `${ui.guilds.length} server(s)`
            } else if (key === ' ') {
                const guild = ui.guilds[ui.guildIdx]!
                if (ui.pane === 'channels') {
                    const ch = ui.channels[ui.channelIdx]
                    if (ch) await toggleChannel(ui, guild, ch)
                } else {
                    // Toggling a server selects/deselects every exportable channel.
                    await openGuild(ui)
                    ui.pane = 'guilds'
                    const allSelected = ui.channels.every(
                        (c) => ui.config.guilds[guild.id]?.channels[c.id]
                    )
                    for (const c of ui.channels) {
                        const has = ui.config.guilds[guild.id]?.channels[c.id]
                        if (allSelected && has) {
                            ui.config = deselectChannel(ui.config, guild.id, c.id)
                        } else if (!allSelected && !has) {
                            const directory = ui.state.channels[c.id]?.directory ?? slugify(c.name)
                            ui.config = selectChannel(ui.config, guild, c, directory)
                        }
                    }
                    await saveConfig(ui.configPath, ui.config)
                    ui.status = allSelected
                        ? `deselected all of ${guild.name}`
                        : `selected all ${ui.channels.length} channel(s) of ${guild.name}`
                }
            } else if (key === 's') {
                const guild = ui.guilds[ui.guildIdx]!
                if (ui.pane === 'channels') {
                    const ch = ui.channels[ui.channelIdx]
                    if (ch) {
                        queueJob(ui, guild, ch.id, ch.name)
                        ui.status = `queued ${ch.name}`
                    }
                } else {
                    const selected = Object.entries(ui.config.guilds[guild.id]?.channels ?? {})
                    for (const [id, ch] of selected) queueJob(ui, guild, id, ch.name)
                    ui.status = selected.length
                        ? `queued ${selected.length} channel(s) of ${guild.name}`
                        : `nothing selected in ${guild.name} (space to select)`
                }
            } else if (key === 'S') {
                for (const [gid, g] of Object.entries(ui.config.guilds)) {
                    const guild = ui.guilds.find((x) => x.id === gid) ?? { id: gid, name: g.name }
                    for (const [id, ch] of Object.entries(g.channels)) {
                        queueJob(ui, guild, id, ch.name)
                    }
                }
                ui.status = `queued everything selected (${ui.queue.length} total)`
            } else if (list.length === 0) {
                ui.status = 'empty'
            }
            render(ui)
        }
    } finally {
        cleanup()
    }

    if (!ui.queue.length) return
    console.log(`running ${ui.queue.length} queued sync(s)\n`)
    const failures: string[] = []
    for (const [i, job] of ui.queue.entries()) {
        console.log(`[${i + 1}/${ui.queue.length}] ${job.guild.name} / ${job.channel.name}`)
        try {
            await syncOne({
                channel: job.channel.id,
                out: job.channel.directory,
                name: job.channel.name,
                stateFile: values.state
            })
        } catch (e) {
            if (e instanceof SyncError) {
                console.error(`FAILED ${job.channel.name}: ${e.message} - continuing`)
                failures.push(job.channel.name)
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
}

if (import.meta.main) await main(Bun.argv.slice(2))
