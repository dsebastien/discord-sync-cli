---
title: Usage
nav_order: 3
---

# Usage

Discord Sync CLI has two front doors that drive the same machinery: an **interactive TUI** for picking and syncing channels by hand, and a **scriptable CLI** for automation. Both maintain the same two files — [`sync-config.json` and `exports-state.json`](configuration.md) — so you can mix them freely.

## The interactive TUI

```bash
discord-sync tui
```

The TUI opens a full-screen browser over every server the token can see. Keys:

| Key                | Action                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `↑`/`↓` or `j`/`k` | Move up/down (`PgUp`/`PgDn` jump by 10)                                                            |
| `⏎` or `l`         | Open the highlighted server and list its exportable channels                                       |
| `esc` or `h`       | Back to the server list                                                                            |
| `space`            | Select/deselect the highlighted channel — on a **server**, toggles **all** of its channels at once |
| `s`                | Sync the highlighted item **now** (a server syncs all of its selected channels)                    |
| `S`                | Sync everything selected, across all servers, **now**                                              |
| `q`                | Quit                                                                                               |

Markers, in the TUI and in the `servers`/`channels` listings:

- `✓` — synced (present in `exports-state.json`)
- `◇` — selected in `sync-config.json`, but not yet synced

### Watching a sync

Pressing `s` or `S` switches to a **live syncing view** inside the TUI: a per-channel checklist (`○` pending, `▸` running, `✓` done, `✗` failed) above a scrolling log that streams the pipeline's own output — including DiscordChatExporter and docker progress. Channels are synced one at a time; the `✓`/`◇` markers update as each finishes. When the run completes, the footer shows a summary and **any key returns you to browsing**. Because syncing needs to pass the token through to docker, the TUI requires `DISCORD_TOKEN` to be set in the environment (not only `--token`/`.env`).

Selections are written to `sync-config.json` immediately as you toggle them. Options: `--token <TOKEN>`, `--state <FILE>` (default `exports-state.json`), `--config <FILE>` (default `sync-config.json`).

## The scriptable CLI

Run `discord-sync` without arguments to list every command. The typical flow:

```bash
discord-sync servers                          # find the guild ID
discord-sync channels -g <GUILD_ID>           # find the channel IDs
discord-sync select -g <GUILD_ID> -c <CHANNEL_ID>
discord-sync sync-all                         # sync everything selected
```

### `servers` — list servers

Lists every server the token can see, with the `✓`/`◇` markers. Options: `--token`, `--json`, `--state`, `--config`.

### `channels` — list a server's channels

```bash
discord-sync channels -g <GUILD_ID>
```

Lists the **exportable** channels (text, announcement, forum, media) of one server with their kind and category. Options: `-g/--guild <ID>` (required), `--token`, `--json`, `--state`, `--config`.

### `select` / `deselect` — choose what to sync

```bash
discord-sync select -g <GUILD_ID> -c <CHANNEL_ID> [-c <CHANNEL_ID> ...]
discord-sync select -g <GUILD_ID> --all          # every exportable channel
discord-sync deselect -g <GUILD_ID> -c <CHANNEL_ID>
discord-sync deselect -g <GUILD_ID> --all
```

Adds channels to (or removes them from) `sync-config.json`. Selecting resolves names via the Discord API and assigns each channel a directory: the one already recorded in `exports-state.json` if the channel was synced before, otherwise a slug of the channel name (`Canvas Showcase!` → `canvas-showcase/`). Options: `-g/--guild <ID>` (required), `-c/--channel <ID>` (repeatable) or `--all`, `--token`, `--state`, `--config`.

### `sync` — one channel, end to end

```bash
discord-sync sync -c <CHANNEL_ID>                          # known channel
discord-sync sync -c <NEW_ID> -o mydir --name my-channel   # first time
```

Runs the full pipeline for one channel (see below). For a channel already in `exports-state.json`, the directory and name are read from the state; for a brand-new channel, pass `-o` (and ideally `--name`).

| Option               | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `-c, --channel <ID>` | Channel ID (required)                                              |
| `-o, --out <DIR>`    | Output directory (required for channels not yet in the state file) |
| `--name <NAME>`      | Human-readable channel name recorded in the state                  |
| `--full`             | Force a full re-export instead of an incremental one               |
| `--skip-assets`      | Skip the asset download step                                       |
| `--state <FILE>`     | State file (default `exports-state.json`)                          |

### `sync-all` — everything selected

```bash
discord-sync sync-all                # every channel in sync-config.json
discord-sync sync-all -g <GUILD_ID>  # one server only
discord-sync sync-all --full         # force full re-exports
```

Syncs every channel chosen in `sync-config.json`, one at a time; a failing channel is reported and skipped, not fatal. Options: `-g/--guild <ID>`, `--full`, `--skip-assets`, `--state <FILE>`, `--config <FILE>`.

## The sync pipeline

Every sync (from the TUI queue, `sync`, or `sync-all`) runs the same steps in order:

1. **Export** — via the DiscordChatExporter docker image. For a channel already in `exports-state.json` this is **incremental**: only messages after the last recorded message ID are fetched, into a temporary `_since-<date>/` folder. Unknown channels (or `--full`) get a full export.
2. **Merge delta** — incremental messages are folded into the master export files: deduplicated by message ID, sorted by timestamp, brand-new threads adopted wholesale, and the delta folder removed.
3. **Update state** — `exports-state.json` is rebuilt from the export files on disk and validated; a sync that would corrupt the state fails instead.
4. **Download assets** — attachments, embeds, and stickers into `_assets/` (skipped with `--skip-assets`).
5. **Generate HTML + Markdown** — the `html/` and `md/` renditions are regenerated.

## Output layout

Each synced channel lives in its own directory:

```
canvas-showcase/
├── <thread>.json          # one DiscordChatExporter export per thread
│                          # (large threads are partitioned into several files)
├── _assets/               # downloaded attachments/embeds/stickers
│   └── manifest.json      # URL -> local file (or recorded failure)
├── html/
│   ├── index.html         # sortable thread index with Explored toggles
│   └── <thread>.html      # one readable page per thread
└── md/
    └── <thread>.md        # Obsidian-friendly Markdown per thread
```

**HTML** — `index.html` lists every thread with message counts and an **Explored** toggle, so you can track what you have already read. Explored state lives in your browser's `localStorage`, keyed by thread ID — stable across regenerations — and the index page has **export/import** buttons to move that state between browsers as a JSON file. Every page links back to the original messages on Discord.

**Markdown** — each thread gets YAML frontmatter (`explore: false` by default — flipping it to `true` in Obsidian **survives regeneration** — `thread`, `thread_id`, `channel`, `channel_id`, `guild`, `guild_id`, `discord_url`, `created`, `last_message`, `message_count`, `authors`), an "Open in Discord" link, and one section per message with a `↗` deep link to that exact message on Discord. Attachments and embeds point at the local `_assets/` copies when downloaded.

## Lower-level commands

`sync` is a composition of these; they are all available individually.

### `export` — drive DiscordChatExporter directly

```bash
discord-sync export -c <CHANNEL_ID>                 # chunked, date-bounded
discord-sync export -c <CHANNEL_ID> --flat -o mydir # one flat pass
discord-sync export -c <CHANNEL_ID> --since-state   # incremental
```

By default the export is **chunked** into date windows (derived from the channel's creation date, so it never grinds through empty years), with a pause between windows. Each finished window is marked `.done`, so a rerun **resumes** instead of redoing.

| Option                | Default                             | Description                                                                                                                   |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `-c, --channel <ID>`  | (required)                          | Channel ID                                                                                                                    |
| `-o, --out <DIR>`     | `exports`                           | Output directory                                                                                                              |
| `--from` / `--to`     | channel creation / tomorrow         | Date bounds (ISO days) for chunked mode                                                                                       |
| `--step <DAYS>`       | `30`                                | Chunk size in days                                                                                                            |
| `--sleep <SECONDS>`   | `45`                                | Pause between chunks                                                                                                          |
| `--jitter <SECONDS>`  | `30`                                | Random extra pause (0..N) added to `--sleep`                                                                                  |
| `-f, --format <FMT>`  | `Json`                              | DiscordChatExporter output format                                                                                             |
| `--threads <MODE>`    | `All`                               | Passed to `--include-threads`                                                                                                 |
| `-p, --partition <S>` | `10mb`                              | Split large exports into partitions                                                                                           |
| `--retries <N>`       | `5`                                 | Attempts per chunk, with exponential backoff                                                                                  |
| `--filter <EXPR>`     | —                                   | DiscordChatExporter message filter                                                                                            |
| `--media`             | off                                 | Let DiscordChatExporter download media itself                                                                                 |
| `--flat`              | off                                 | Single pass, no chunking                                                                                                      |
| `--since-state`       | off                                 | Incremental: export after the state's `lastMessageId` (implies `--flat`; writes to `<dir>/_since-<date>/` for known channels) |
| `--state <FILE>`      | `exports-state.json`                | State file used by `--since-state`                                                                                            |
| `--image <IMAGE>`     | `tyrrrz/discordchatexporter:stable` | Docker image                                                                                                                  |
| `--force`             | off                                 | Re-export chunks already marked `.done`                                                                                       |
| `--dry-run`           | off                                 | Print the docker commands without running them                                                                                |

### `update-state` — rebuild the state file

```bash
discord-sync update-state <DIR> [<DIR> ...]
discord-sync update-state <DIR> --name canvas-showcase
discord-sync update-state                # rescan every export directory
```

Rebuilds `exports-state.json` from the export files in the given directories (every export directory in the working directory when none are given). Options: `--state <FILE>`, `--name <NAME>`, `--channel <ID>`.

### `merge` — fold a delta into the master exports

```bash
discord-sync merge canvas-showcase/_since-2026-08-25
```

Merges an incremental `_since-*` delta into the matching master files (dedupe by message ID, sorted by timestamp), adopts files for brand-new threads, and removes the delta folder. Options: `--into <DIR>` (default: the delta's parent directory), `--keep` (keep the delta folder).

### `assets` — download referenced assets

```bash
discord-sync assets <DIR> [<DIR> ...]
discord-sync assets <DIR> --delay 1 --retry-failed
```

Downloads every attachment/embed/sticker URL referenced by the JSON exports into `<DIR>/_assets/`, tracked in `manifest.json`. Reruns skip anything already fetched; expired links are recorded as failed. Options: `--delay <SECONDS>` (default `0.4`), `--jitter <SECONDS>` (default `0.4`), `--retries <N>` (default `4`), `--retry-failed` (retry URLs previously recorded as failed), `--dry-run`.

### `html` / `md` — regenerate the renditions

```bash
discord-sync html <DIR> [<DIR> ...]
discord-sync md <DIR> [<DIR> ...]
```

Regenerate `<DIR>/html/` and `<DIR>/md/` from the JSON exports and the asset manifest. Both are safe to rerun at any time: the HTML Explored state lives in the browser, and the Markdown `explore` frontmatter is preserved from the existing files.

### `validate` — check the state file

```bash
discord-sync validate                     # exports-state.json
discord-sync validate path/to/state.json
discord-sync validate --emit-json-schema  # regenerate exports-state.schema.json
```

Validates the state file against the zod schema, plus semantic checks (e.g. that recorded directories exist). Exits non-zero when invalid.
