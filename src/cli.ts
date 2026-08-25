#!/usr/bin/env bun
/**
 * cli.ts - unified entrypoint for the Discord archive toolkit.
 *
 * Compiled to a standalone binary via `bun run build` (bun build --compile).
 *
 *   discord-sync sync -c 1262785282957119540
 *   discord-sync export -c <ID> --flat -o mydir
 *   discord-sync validate
 */

import { main as exportChannel } from './commands/export-channel'
import { main as updateState } from './commands/update-state'
import { main as mergeExports } from './commands/merge-exports'
import { main as downloadAssets } from './commands/download-assets'
import { main as generateHtml } from './commands/generate-html'
import { main as generateMarkdown } from './commands/generate-markdown'
import { main as validateState } from './commands/validate-state'
import { main as syncChannel } from './commands/sync-channel'
import { main as syncAll } from './commands/sync-all'
import { main as servers } from './commands/servers'
import { main as channels } from './commands/channels'
import { makeMain } from './commands/select'
import { main as tui } from './commands/tui'

const COMMANDS: Record<string, { run: (args: string[]) => Promise<void>; help: string }> = {
    'tui': {
        run: tui,
        help: 'interactive browser: pick servers/channels, select, queue syncs'
    },
    'servers': { run: servers, help: 'list servers the token can see (✓ synced, ◇ selected)' },
    'channels': { run: channels, help: 'list exportable channels of one server (-g <ID>)' },
    'select': {
        run: makeMain('select'),
        help: 'add channels to discord-sync.json (-g <ID> -c <ID> | --all)'
    },
    'deselect': { run: makeMain('deselect'), help: 'remove channels from discord-sync.json' },
    'sync-all': { run: syncAll, help: 'sync every channel chosen in discord-sync.json' },
    'sync': {
        run: syncChannel,
        help: 'export new messages, merge, update state, fetch assets, regenerate html+md'
    },
    'export': {
        run: exportChannel,
        help: 'run DiscordChatExporter (chunked, flat, or --since-state)'
    },
    'update-state': {
        run: updateState,
        help: 'rebuild the state section of discord-sync.json from export dirs'
    },
    'merge': {
        run: mergeExports,
        help: 'fold an incremental _since-* delta into the master exports'
    },
    'assets': {
        run: downloadAssets,
        help: 'download attachments/embeds/stickers into <dir>/_assets/'
    },
    'html': {
        run: generateHtml,
        help: 'generate <dir>/html/ pages (Explored toggle, Discord links)'
    },
    'md': {
        run: generateMarkdown,
        help: 'generate <dir>/md/ files (YAML frontmatter, explore flag)'
    },
    'validate': { run: validateState, help: 'validate discord-sync.json against the zod schema' }
}

function usage(): void {
    console.log('discord-sync <command> [options]\n\nCommands:')
    for (const [name, { help }] of Object.entries(COMMANDS)) {
        console.log(`  ${name.padEnd(14)} ${help}`)
    }
    console.log("\nRun 'discord-sync <command> --help' for command options where available.")
}

const [command, ...rest] = Bun.argv.slice(2)
if (!command || command === '--help' || command === '-h' || command === 'help') {
    usage()
    process.exit(command ? 0 : 1)
}
const entry = COMMANDS[command]
if (!entry) {
    console.error(`error: unknown command '${command}'\n`)
    usage()
    process.exit(1)
}
await entry.run(rest)
