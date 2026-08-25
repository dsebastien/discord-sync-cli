---
title: Overview
nav_order: 1
permalink: /
---

# Discord Sync CLI

A **CLI/TUI for exporting/synchronizing Discord servers/channels/threads to JSON, HTML & Markdown**. Point it at the servers you care about, pick the channels worth keeping, and it maintains a local archive: raw JSON exports (via [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter)), downloaded assets, a readable HTML rendition with an "Explored" reading tracker, and Obsidian-friendly Markdown files you can drop straight into a vault.

Built for communities that produce gems worth keeping — forum channels full of hard-won answers, showcase threads, long-running discussions — that would otherwise stay locked inside Discord's search box.

## Key features

- **Incremental synchronization.** The first sync exports a channel in full; every sync after that only fetches messages newer than the last recorded message ID, merges them into the master exports, and regenerates everything downstream.
- **An interactive TUI and a scriptable CLI.** Browse servers and channels in a terminal UI, toggle what to sync, and queue syncs — or drive the same operations from scripts with `servers`, `channels`, `select`, `sync`, and `sync-all`.
- **Polite by design.** Exports run through the official DiscordChatExporter docker image with `--respect-rate-limits` and `--parallel 1`; large first-time exports can be chunked into date windows with sleep and jitter between them, and chunked runs resume where they left off.
- **Assets that outlive Discord's CDN.** Attachments, embeds, and stickers are downloaded into a local `_assets/` folder with a manifest, because Discord's signed CDN links expire.
- **Readable renditions.** Per-thread HTML pages plus an index with "Explored" toggles (stored in your browser, exportable), and Markdown files with YAML frontmatter (`explore`, `discord_url`, per-message deep links) that play nicely with Obsidian Bases and Dataview.
- **Honest state tracking.** A single `discord-sync.json` holds everything: its `guilds` section records what _should_ sync, while its `state` section records what _has_ synced — validated with a zod schema and rebuilt from the export files themselves, never trusted blindly.

## Quick start

1. Install the [prerequisites](installation.md): Bun, Docker, and a Discord **bot** token.
2. Put the token in a `.env` file (`DISCORD_TOKEN=...`) or export it in your shell.
3. Run `discord-sync tui`, open a server, press `space` on the channels you want, then `S` to sync everything selected live in place, and `q` to quit when it finishes.
4. Open `<channel-directory>/html/index.html` in a browser, or point Obsidian at `<channel-directory>/md/`.

See [Installation](installation.md) for setup, the [Usage](usage.md) guide for both workflows and every command, [Configuration](configuration.md) for the `discord-sync.json` project file, and [Tips & best practices](tips.md) for the practical details.

## About

Created by [Sébastien Dubois](https://dsebastien.net).

If this tool is useful to you, you can [buy me a coffee](https://www.buymeacoffee.com/dsebastien) ☕. Source and issues live on [GitHub](https://github.com/dsebastien/discord-sync-cli).

## News & support

To stay up to date about this project, Personal Knowledge Management and note-taking:

- Subscribe to [my newsletter](https://dsebastien.net/newsletter)
- Subscribe to [my YouTube channel](https://youtube.com/@dsebastien)
- Join the [Knowii community](https://www.store.dsebastien.net/product/knowii-community/) and learn to organize your notes and put your knowledge to work, together with fellow knowledge workers

If this project is useful to you, here are the best ways to support my work ❤️:

- [Join the Knowii community](https://www.store.dsebastien.net/product/knowii-community/)
- [Become a GitHub Sponsor](https://github.com/sponsors/dsebastien)
- [Buy me a coffee](https://www.buymeacoffee.com/dsebastien)
- [Subscribe to my YouTube channel](https://youtube.com/@dsebastien)
- [Check out my products](https://store.dsebastien.net)
