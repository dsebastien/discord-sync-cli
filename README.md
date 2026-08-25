# Discord Sync CLI

> A CLI/TUI for exporting/synchronizing Discord servers/channels/threads to JSON, HTML & Markdown

`discord-sync` archives Discord channels through [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter), keeps track of what has been synced, downloads the referenced assets before their CDN links expire, and renders everything as readable HTML (with an "Explored" review workflow) and Obsidian-friendly Markdown (YAML frontmatter with an `explore` flag).

## Highlights

- **Interactive TUI** (`discord-sync tui`): browse every server your token can see, drill into channels, select what to sync (✓ synced, ◇ selected), queue syncs.
- **Full CLI parity**: every TUI scenario is scriptable — `servers`, `channels`, `select`, `sync`, `sync-all`, and more.
- **Incremental syncs**: only messages newer than the last recorded message ID are fetched, then merged into the master exports.
- **Asset preservation**: Discord CDN links are signed and expire; `discord-sync assets` fetches attachments/embeds/stickers into a local store keyed by stable URLs.
- **HTML + Markdown output**: one page/file per thread plus an index, with Discord deep links back to every message.

## Quick start

```bash
export DISCORD_TOKEN=...            # or --token, or a .env file
discord-sync tui                    # pick servers/channels, queue syncs
discord-sync sync-all               # later: refresh everything you selected
```

> **Warning**: automating a **user** token violates Discord's Terms of Service and can lead to account termination. Use a **bot** token where possible.

## Documentation

- [User guide](docs/README.md) — installation, usage, configuration, tips.
- [DEVELOPMENT.md](DEVELOPMENT.md) — working on the code.
- [CONTRIBUTING.md](CONTRIBUTING.md) — commit conventions and PRs.

## License

[MIT](LICENSE) — © Sébastien Dubois ([DeveloPassion](https://developassion.be))
