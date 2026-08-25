---
title: Configuration
nav_order: 4
---

# Configuration

There is no configuration UI — the tool is driven by two JSON files in the working directory, plus a few command-line flags documented in [Usage](usage.md). The split is deliberate:

- **`sync-config.json`** records what **should** be synced — your choices.
- **`exports-state.json`** records what **has** been synced — the facts on disk.

## sync-config.json

Written by the TUI (`space` toggles) and the `select`/`deselect` commands; read by `sync-all` and by the listings to show the `◇` marker. It maps guilds to the channels you chose, each with a display name and a target directory:

```json
{
    "version": 1,
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
    }
}
```

The file is validated on load (strict schema: guild and channel keys must be Discord snowflakes, `directory` must be non-empty). It is small and human-oriented — editing it by hand is fine, e.g. to change a channel's target `directory` before its first sync. Deselecting the last channel of a guild removes the guild entry entirely. If the file does not exist, it is treated as an empty selection.

## exports-state.json

Rebuilt by `update-state` (which every sync runs) from the export files themselves; read by everything else to decide between incremental and full exports and to show the `✓` marker.

Per channel it records: the name, guild, directory, when it was last exported, the **`lastMessageId`** cursor (the whole basis of incremental sync), the last message timestamp, thread and message counts, and a per-thread map with the same cursors (`lastMessageId`, `lastMessageTimestamp`, `messageCount`, last author) for every thread in the channel.

```json
{
    "version": 1,
    "updatedAt": "2026-08-25T10:00:00Z",
    "channels": {
        "1262785282957119540": {
            "name": "canvas-showcase",
            "guildId": "686053708261228577",
            "directory": "canvas-showcase",
            "lastExportedAt": "2026-08-25T10:00:00Z",
            "lastMessageId": "1408450000000000000",
            "threadCount": 42,
            "messageCount": 1234,
            "threads": { "...": {} }
        }
    }
}
```

> ⚠️ **Do not hand-edit this file.** It is a cache of what is actually on disk and is rebuilt by `update-state` — any manual edit will be overwritten by the next sync. If it ever looks wrong, run `discord-sync update-state <dir>` to rebuild it from the exports, and `discord-sync validate` to check it.

The file is validated against a zod schema on every sync (a sync that would corrupt it fails instead of writing it). A JSON Schema rendition is generated with:

```bash
discord-sync validate --emit-json-schema   # writes exports-state.schema.json
```

Point the file's `$schema` property at it to get editor tooltips and validation.

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

DiscordChatExporter is always invoked with `--respect-rate-limits`, so it honors Discord's advisory rate-limit headers on its own, and `--parallel 1` keeps it to a single request stream. On top of that, chunked exports pause between date windows (`--sleep 45` plus `--jitter 0..30` seconds by default) and retry failed chunks with exponential backoff — chunking exists for resumability and for spreading very large first-time exports over time, not because DiscordChatExporter would otherwise hammer the API.

The asset downloader is similarly polite: ~0.4s (plus jitter) between downloads, honoring `Retry-After` on HTTP 429.
