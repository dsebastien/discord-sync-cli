---
title: Tips & best practices
nav_order: 5
---

# Tips and best practices

## Download assets soon after exporting

Discord CDN links are **signed and expire** (roughly 24 hours). The sync pipeline downloads assets immediately after each export for exactly this reason — if you use the lower-level commands, run `discord-sync assets <dir>` right after `export`, not next week. Assets that fail (or whose links had already expired) are recorded in `_assets/manifest.json` with the error; once fresh exports re-reference them with new signed URLs, `discord-sync assets <dir> --retry-failed` gives them another chance.

## Incremental syncs still take a few minutes on big forums

An incremental sync only **fetches** messages newer than the recorded `lastMessageId`, but DiscordChatExporter still has to **enumerate every thread** of the channel (that is the shape of the Discord API, not a choice). On a large forum channel expect a few minutes per sync even when only a handful of new messages come back — the win is in the download volume, not the enumeration.

## Spread very large first-time exports

For a first-time export of a huge channel, prefer the chunked `export` command over a flat one: `--step` controls the window size and `--sleep`/`--jitter` the pauses between windows. Chunks are marked `.done` as they finish, so you can interrupt at any point and rerun the same command to resume. Once the full export exists, run `update-state` on the directory and switch to regular `sync` for the increments.

## Explored state lives in your browser

The **Explored** toggles on the HTML pages are stored in the browser's `localStorage`, keyed by thread ID — so they survive regeneration, but they do **not** follow the files to another browser or machine. Use the **export**/**import** buttons on `html/index.html` to move the state as a JSON file.

## The Markdown files are made for Obsidian

Drop a channel's `md/` folder (or the whole channel directory) into a vault:

- The `explore: false` frontmatter property is **preserved across regenerations**, so flipping it to `true` in Obsidian is safe — use it to drive an Obsidian **Base** or **Dataview** query listing what you have not read yet (e.g. `WHERE explore = false`).
- `discord_url` in the frontmatter and the per-message `↗` links jump straight back to the original messages on Discord.
- Attachment links point at the local `_assets/` copies, so images render offline once assets are downloaded.
