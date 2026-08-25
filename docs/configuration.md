---
title: Configuration
nav_order: 4
---

# Configuration

There is no configuration UI — the tool is driven by a single JSON file in the working directory, **`discord-sync.json`**, plus a few command-line flags documented in [Usage](usage.md). One file holds three sections with three different owners:

- **`settings`** — hand-edited tuning knobs (delays and Markdown frontmatter).
- **`guilds`** — what **should** be synced: your channel selections.
- **`state`** — what **has** been synced: the facts on disk. **Auto-managed — never hand-edit it.**

`settings` and `guilds` are yours to edit; `state` is rebuilt by `update-state` (which every sync runs), and it rewrites **only** the `state` section, preserving `settings` and `guilds`.

Every command that touches the file takes `--config <FILE>` (default `discord-sync.json`). The whole document is validated against a strict zod schema on load and before every write — guild and channel keys must be Discord snowflakes, directories must be non-empty — so a change that would corrupt it fails instead of being written. If the file does not exist, it is treated as an empty project.

```json
{
    "version": 1,
    "settings": {
        "assetDelayMs": 400,
        "assetJitterMs": 400,
        "exportDelaySeconds": 45,
        "exportJitterSeconds": 30,
        "frontmatter": { "explore": false }
    },
    "guilds": {
        "686053708261228577": {
            "name": "My Community",
            "channels": {
                "1262785282957119540": {
                    "name": "canvas-showcase",
                    "directory": "canvas-showcase"
                }
            }
        }
    },
    "state": {
        "channels": {
            "1262785282957119540": {
                "name": "canvas-showcase",
                "guildId": "686053708261228577",
                "guildName": "My Community",
                "directory": "canvas-showcase",
                "lastExportedAt": "2026-08-25T10:00:00Z",
                "lastMessageId": "1408450000000000000",
                "threadCount": 42,
                "messageCount": 1234,
                "threads": { "...": {} }
            }
        }
    }
}
```

## `settings` — tuning knobs (hand-edited)

`settings` is the one section you tune by hand. It has two kinds of knobs:

**Pacing delays.** `assetDelayMs`/`assetJitterMs` pace the asset downloader (a pause of `assetDelayMs` plus `0..assetJitterMs` between downloads); `exportDelaySeconds`/`exportJitterSeconds` pace the export — the wait between chunked export windows and between sequential channel syncs.

> **Note:** there are no per-message or per-thread delay knobs. DiscordChatExporter handles its **own** per-message rate limiting — it is always invoked with `--respect-rate-limits` (honoring Discord's advisory headers) and `--parallel 1` (a single request stream). The only pacing this tool adds is asset-download pacing and between-unit pacing (between chunks, between channels).

**Markdown frontmatter.** `settings.frontmatter` is a map of YAML keys/values merged into **every** generated Markdown file's frontmatter. Values can be strings, numbers, booleans, or arrays of those. The `explore` flag is special: its precedence is the value already present in an existing Markdown file **>** the `settings.frontmatter` default **>** `false`. So curation you do in Obsidian survives regeneration, and the setting only seeds the default for freshly generated files.

## `guilds` — selections (hand-edited)

`guilds` records what **should** be synced. It is written by the TUI (`space` toggles) and the `select`/`deselect` commands, read by `sync-all` and by the listings to show the `◇` marker. It maps each guild to the channels you chose, each with a display name and a target directory. Editing it by hand is fine, e.g. to change a channel's target `directory` before its first sync. Deselecting the last channel of a guild removes the guild entry entirely.

## `state` — what has been synced (auto-managed)

`state.channels` is rebuilt by `update-state` (which every sync runs) from the export files themselves; read by everything else to decide between incremental and full exports and to show the `✓` marker.

Per channel it records: the name, guild id and name, directory, when it was last exported, the **`lastMessageId`** cursor (the whole basis of incremental sync), the last message timestamp, the last thread id/name, thread and message counts, and a per-thread map with the same cursors (`name`, `type`, `messageCount`, `lastMessageId`, `lastMessageTimestamp`, `lastAuthor`) for every thread in the channel.

> ⚠️ **Do not hand-edit the `state` section.** It is a cache of what is actually on disk and is rebuilt by `update-state` — any manual edit will be overwritten by the next sync (which rewrites `state` only, leaving `settings` and `guilds` untouched). If it ever looks wrong, run `discord-sync update-state <dir>` to rebuild it from the exports, and `discord-sync validate` to check it.

## JSON Schema

A JSON Schema rendition of `discord-sync.json` is generated from the zod schema (the source of truth in `src/lib/schema.ts`) with:

```bash
discord-sync validate --emit-json-schema   # writes discord-sync.schema.json
```

Point the file's `$schema` property at `discord-sync.schema.json` to get editor tooltips and validation.

## Default export parameters

Exports run through the `tyrrrz/discordchatexporter:stable` docker image with these settings (see [`export`](usage.md#export--drive-discordchatexporter-directly) for the flags that override them where applicable):

| Parameter    | Value                   | Notes                                                          |
| ------------ | ----------------------- | -------------------------------------------------------------- |
| Format       | `Json`                  | The only format the merge/HTML/Markdown steps understand       |
| Threads      | `--include-threads All` | Active **and archived** threads — essential for forum channels |
| Partitioning | `--partition 10mb`      | Very large threads are split across several files              |
| Timezone     | `--utc` (+ `TZ=UTC`)    | All timestamps are UTC                                         |
| Parallelism  | `--parallel 1`          | One download at a time                                         |

## Rate limiting

DiscordChatExporter is always invoked with `--respect-rate-limits`, so it honors Discord's advisory rate-limit headers on its own, and `--parallel 1` keeps it to a single request stream. On top of that, chunked exports pause between date windows (`exportDelaySeconds` plus `0..exportJitterSeconds` seconds by default) and retry failed chunks with exponential backoff — chunking exists for resumability and for spreading very large first-time exports over time, not because DiscordChatExporter would otherwise hammer the API.

The asset downloader is similarly polite: `assetDelayMs` (~0.4s) plus jitter between downloads, honoring `Retry-After` on HTTP 429.
