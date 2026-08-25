#!/usr/bin/env bun
/**
 * tui.ts - interactive terminal UI for browsing servers and channels.
 *
 *   discord-sync tui
 *
 * Keys: up/down or j/k move · enter/l open server · esc/h back
 *       space select/deselect channel (or every channel of a server)
 *       s sync the highlighted item now · S sync everything selected now
 *       q quit
 *
 * Markers: ✓ synced · ◇ selected, not yet synced
 *
 * The TUI edits sync-config.json as you toggle. Pressing s/S switches to a
 * live "syncing" view that runs the pipeline in place: a per-channel
 * checklist plus a scrolling log fed by the pipeline's own output (docker /
 * DiscordChatExporter progress included). Press a key when it finishes to
 * return to browsing.
 */

import { parseArgs } from 'node:util'
import { channelKind, DiscordApi, resolveToken, slugify } from '../lib/discord-api'
import type { Channel, Guild } from '../lib/discord-api'
import {
    channelMark,
    deselectChannel,
    guildMark,
    MARK_GLYPH,
    selectChannel
} from '../lib/sync-config'
import { DEFAULT_CONFIG_PATH, loadDoc, saveDoc } from '../lib/state'
import type { DiscordSyncDoc } from '../lib/types'
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
const RED = `${ESC}[31m`
const YELLOW = `${ESC}[33m`
const RESET = `${ESC}[0m`

type JobStatus = 'pending' | 'running' | 'done' | 'failed'

interface Job {
    guild: Guild
    channel: { id: string; name: string; directory: string }
    status: JobStatus
}

interface Ui {
    pane: 'guilds' | 'channels' | 'syncing'
    guilds: Guild[]
    guildIdx: number
    channels: (Channel & { category: string | null })[]
    channelIdx: number
    channelCache: Map<string, (Channel & { category: string | null })[]>
    status: string
    jobs: Job[]
    log: string[]
    syncDone: boolean
    doc: DiscordSyncDoc
    configPath: string
    token: string
}

function rows(): number {
    return process.stdout.rows || 24
}
function cols(): number {
    return process.stdout.columns || 80
}

/** Truncate on VISIBLE width: ANSI escape sequences don't take columns. */
function line(s: string): string {
    const width = cols()
    let visible = 0
    let out = ''
    for (let i = 0; i < s.length; i++) {
        if (s[i] === ESC) {
            const end = s.indexOf('m', i)
            if (end !== -1) {
                out += s.slice(i, end + 1)
                i = end
                continue
            }
        }
        if (visible >= width - 1) return out + '…' + RESET
        out += s[i]
        visible++
    }
    return out
}

function glyph(mark: keyof typeof MARK_GLYPH): string {
    const g = MARK_GLYPH[mark]
    return mark === 'synced'
        ? `${GREEN}${g}${RESET}`
        : mark === 'selected'
          ? `${CYAN}${g}${RESET}`
          : g
}

const JOB_GLYPH: Record<JobStatus, string> = {
    pending: `${DIM}○${RESET}`,
    running: `${YELLOW}▸${RESET}`,
    done: `${GREEN}✓${RESET}`,
    failed: `${RED}✗${RESET}`
}

function renderSyncing(ui: Ui): void {
    const height = rows()
    const out: string[] = []
    const done = ui.jobs.filter((j) => j.status === 'done' || j.status === 'failed').length
    out.push(`${BOLD}${line(`discord-sync · syncing ${done}/${ui.jobs.length}`)}${RESET}`)

    // Checklist (capped so a huge queue still leaves room for the log).
    const listCap = Math.min(ui.jobs.length, Math.max(3, Math.floor((height - 4) / 2)))
    const runningIdx = ui.jobs.findIndex((j) => j.status === 'running')
    const start = Math.max(0, Math.min(runningIdx - 1, ui.jobs.length - listCap))
    for (let i = start; i < Math.min(ui.jobs.length, start + listCap); i++) {
        const j = ui.jobs[i]!
        out.push(line(` ${JOB_GLYPH[j.status]} ${j.guild.name} / ${j.channel.name}`))
    }
    out.push(line(`${DIM}${'─'.repeat(Math.max(1, cols()))}${RESET}`))

    const logHeight = height - out.length - 1
    const tail = ui.log.slice(-Math.max(0, logHeight))
    for (const l of tail) out.push(line(`${DIM}${l}${RESET}`))
    for (let i = tail.length; i < logHeight; i++) out.push('')

    out.push(
        line(
            ui.syncDone
                ? `${BOLD}${ui.status}${RESET} ${DIM}· press any key to return${RESET}`
                : `${DIM}${ui.status}${RESET}`
        )
    )
    process.stdout.write(CLEAR + out.join('\n'))
}

function render(ui: Ui): void {
    if (ui.pane === 'syncing') {
        renderSyncing(ui)
        return
    }
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
                  text: `${glyph(guildMark(ui.doc, g.id))} ${g.name}`
              }))
            : ui.channels.map((c, i) => {
                  const guild = ui.guilds[ui.guildIdx]!
                  const cat = c.category ? `${DIM}${c.category} /${RESET} ` : ''
                  return {
                      key: i,
                      text: `${glyph(channelMark(ui.doc, guild.id, c.id))} ${cat}${c.name} ${DIM}[${channelKind(c)}]${RESET}`
                  }
              })
    const idx = ui.pane === 'guilds' ? ui.guildIdx : ui.channelIdx
    const top = Math.max(0, Math.min(idx - Math.floor(height / 2), items.length - height))
    for (let i = top; i < Math.min(items.length, top + height); i++) {
        const item = items[i]!
        out.push(i === idx ? `${INV}${line(` ${item.text} `)}${RESET}` : line(` ${item.text}`))
    }
    for (let i = items.length - top; i < height; i++) out.push('')

    out.push(line(`${DIM}${ui.status}${RESET}`))
    out.push(
        line(
            `${DIM}↑↓/jk move · ⏎/l open · esc/h back · space select · s sync this · S sync selected · q quit${RESET}`
        )
    )
    process.stdout.write(CLEAR + out.join('\n'))
}

function collectJob(ui: Ui, guild: Guild, id: string, name: string, into: Job[]): void {
    const directory =
        ui.doc.state.channels[id]?.directory ??
        ui.doc.guilds[guild.id]?.channels[id]?.directory ??
        slugify(name)
    if (!into.some((j) => j.channel.id === id)) {
        into.push({ guild, channel: { id, name, directory }, status: 'pending' })
    }
}

async function toggleChannel(
    ui: Ui,
    guild: Guild,
    ch: { id: string; name: string }
): Promise<void> {
    if (ui.doc.guilds[guild.id]?.channels[ch.id]) {
        ui.doc = deselectChannel(ui.doc, guild.id, ch.id)
        ui.status = `deselected ${ch.name}`
    } else {
        const directory = ui.doc.state.channels[ch.id]?.directory ?? slugify(ch.name)
        ui.doc = selectChannel(ui.doc, guild, ch, directory)
        ui.status = `selected ${ch.name} -> ${directory}/`
    }
    await saveDoc(ui.configPath, ui.doc)
}

async function openGuild(ui: Ui): Promise<void> {
    const guild = ui.guilds[ui.guildIdx]
    if (!guild) return
    if (!ui.channelCache.has(guild.id)) {
        ui.status = `loading channels of ${guild.name}...`
        render(ui)
        ui.channelCache.set(guild.id, await apiRef!.listChannels(guild.id))
    }
    ui.channels = ui.channelCache.get(guild.id)!
    ui.channelIdx = 0
    ui.pane = 'channels'
    ui.status = `${ui.channels.length} exportable channel(s)`
}

/** Run the given jobs in the live syncing view, capturing the pipeline's
 * console output into a scrolling log. Returns when every job is finished. */
async function runSyncs(ui: Ui, jobs: Job[]): Promise<void> {
    ui.jobs = jobs
    ui.log = []
    ui.syncDone = false
    ui.pane = 'syncing'
    ui.status = 'starting...'

    // Redirect the pipeline's console output into the log pane. The renderer
    // writes to stdout directly (not via console), so there is no recursion.
    const origLog = console.log
    const origErr = console.error
    const capture = (...parts: unknown[]) => {
        const text = parts.map((p) => (typeof p === 'string' ? p : String(p))).join(' ')
        for (const l of text.split('\n')) ui.log.push(l)
        if (ui.log.length > 500) ui.log.splice(0, ui.log.length - 500)
        render(ui)
    }
    console.log = capture
    console.error = capture

    let failures = 0
    try {
        for (const job of jobs) {
            job.status = 'running'
            ui.status = `syncing ${job.channel.name}`
            render(ui)
            try {
                await syncOne({
                    channel: job.channel.id,
                    out: job.channel.directory,
                    name: job.channel.name,
                    configFile: ui.configPath,
                    token: ui.token
                })
                job.status = 'done'
            } catch (e) {
                job.status = 'failed'
                failures++
                capture(
                    `FAILED ${job.channel.name}: ${e instanceof SyncError ? e.message : String(e)}`
                )
                if (!(e instanceof SyncError)) throw e
            }
            // Reload so browsing markers reflect what was just synced.
            ui.doc = await loadDoc(ui.configPath)
            render(ui)
        }
    } finally {
        console.log = origLog
        console.error = origErr
    }

    ui.syncDone = true
    ui.status = failures
        ? `done · ${failures} failed, ${jobs.length - failures} ok`
        : `done · ${jobs.length} channel(s) synced`
    render(ui)
}

let apiRef: DiscordApi | null = null

export async function main(args: string[]): Promise<void> {
    const { values } = parseArgs({
        args,
        options: {
            token: { type: 'string' },
            config: { type: 'string', default: DEFAULT_CONFIG_PATH }
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
    const [guilds, doc] = await Promise.all([apiRef.listGuilds(), loadDoc(values.config)])
    const ui: Ui = {
        pane: 'guilds',
        guilds,
        guildIdx: 0,
        channels: [],
        channelIdx: 0,
        channelCache: new Map(),
        status: `${guilds.length} server(s)`,
        jobs: [],
        log: [],
        syncDone: false,
        doc,
        configPath: values.config,
        token
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

            // The syncing view is modal: any key after completion returns to
            // browsing; keys during a sync are ignored.
            if (ui.pane === 'syncing') {
                if (ui.syncDone) {
                    ui.pane = 'guilds'
                    ui.status = `${ui.guilds.length} server(s)`
                    render(ui)
                }
                continue
            }

            const list = ui.pane === 'guilds' ? ui.guilds : ui.channels
            const move = (d: number) => {
                if (ui.pane === 'guilds') {
                    ui.guildIdx = Math.max(0, Math.min(ui.guilds.length - 1, ui.guildIdx + d))
                } else {
                    ui.channelIdx = Math.max(0, Math.min(ui.channels.length - 1, ui.channelIdx + d))
                }
            }

            if (key === 'q' || (key === `${ESC}` && ui.pane === 'guilds')) break
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
                        (c) => ui.doc.guilds[guild.id]?.channels[c.id]
                    )
                    for (const c of ui.channels) {
                        const has = ui.doc.guilds[guild.id]?.channels[c.id]
                        if (allSelected && has) {
                            ui.doc = deselectChannel(ui.doc, guild.id, c.id)
                        } else if (!allSelected && !has) {
                            const directory =
                                ui.doc.state.channels[c.id]?.directory ?? slugify(c.name)
                            ui.doc = selectChannel(ui.doc, guild, c, directory)
                        }
                    }
                    await saveDoc(ui.configPath, ui.doc)
                    ui.status = allSelected
                        ? `deselected all of ${guild.name}`
                        : `selected all ${ui.channels.length} channel(s) of ${guild.name}`
                }
            } else if (key === 's') {
                const guild = ui.guilds[ui.guildIdx]!
                const jobs: Job[] = []
                if (ui.pane === 'channels') {
                    const ch = ui.channels[ui.channelIdx]
                    if (ch) collectJob(ui, guild, ch.id, ch.name, jobs)
                } else {
                    for (const [id, ch] of Object.entries(
                        ui.doc.guilds[guild.id]?.channels ?? {}
                    )) {
                        collectJob(ui, guild, id, ch.name, jobs)
                    }
                }
                if (jobs.length) await runSyncs(ui, jobs)
                else ui.status = `nothing to sync here (space to select first)`
            } else if (key === 'S') {
                const jobs: Job[] = []
                for (const [gid, g] of Object.entries(ui.doc.guilds)) {
                    const guild = ui.guilds.find((x) => x.id === gid) ?? { id: gid, name: g.name }
                    for (const [id, ch] of Object.entries(g.channels)) {
                        collectJob(ui, guild, id, ch.name, jobs)
                    }
                }
                if (jobs.length) await runSyncs(ui, jobs)
                else ui.status = 'nothing selected anywhere (space to select first)'
            } else if (list.length === 0) {
                ui.status = 'empty'
            }
            render(ui)
        }
    } finally {
        cleanup()
    }
}

if (import.meta.main) await main(Bun.argv.slice(2))
