# Discord Sync CLI

> A CLI/TUI for exporting/synchronizing Discord servers/channels/threads to JSON, HTML & Markdown

`discord-sync` archives Discord channels through [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter), keeps track of what has been synced, downloads the referenced assets before their CDN links expire, and renders everything as readable HTML (with an "Explored" review workflow) and Obsidian-friendly Markdown (YAML frontmatter with an `explore` flag).

## Highlights

- **Interactive TUI** (`discord-sync tui`): browse every server your token can see, drill into channels, select what to sync (✓ synced, ◇ selected), queue syncs.
- **Full CLI parity**: every TUI scenario is scriptable — `servers`, `channels`, `select`, `sync`, `sync-all`, and more.
- **Incremental syncs**: only messages newer than the last recorded message ID are fetched, then merged into the master exports.
- **Asset preservation**: Discord CDN links are signed and expire; `discord-sync assets` fetches attachments/embeds/stickers into a local store keyed by stable URLs.
- **HTML + Markdown output**: one page/file per thread plus an index, with Discord deep links back to every message.

## Installation

**Prerequisites**

- [Bun](https://bun.sh) ≥ 1.4 — only to build from source or run the CLI directly.
- [Docker](https://www.docker.com/) — exports run through the official `tyrrrz/discordchatexporter:stable` image (pulled automatically on first use).
- A Discord token — see [token setup](docs/installation.md#the-discord-token).

**Download a release binary** for your platform from the [releases page](https://github.com/dsebastien/discord-sync-cli/releases):

| Platform    | Asset                          |
| ----------- | ------------------------------ |
| Linux x64   | `discord-sync-linux-x64`       |
| Linux arm64 | `discord-sync-linux-arm64`     |
| macOS Intel | `discord-sync-darwin-x64`      |
| macOS Apple | `discord-sync-darwin-arm64`    |
| Windows x64 | `discord-sync-windows-x64.exe` |

```bash
mv discord-sync-linux-x64 discord-sync
chmod +x discord-sync
sudo mv discord-sync /usr/local/bin/   # or anywhere on your PATH
```

**Or build from source:**

```bash
git clone https://github.com/dsebastien/discord-sync-cli
cd discord-sync-cli
bun install
bun run build     # -> dist/discord-sync
```

You can also run any command straight from source with `bun run src/cli.ts <command>`.

See the [installation guide](docs/installation.md) for full token setup (bot **and** user tokens) and the Discord ToS warning.

## Quick start

```bash
export DISCORD_TOKEN=...            # or --token, or a .env file
discord-sync tui                    # pick servers/channels, sync live
discord-sync sync-all               # later: refresh everything you selected
```

> **Warning**: automating a **user** token violates Discord's Terms of Service and can lead to account termination. Use a **bot** token where possible.

## Documentation

- [User guide](docs/README.md) — installation, usage, configuration, tips.
- [DEVELOPMENT.md](DEVELOPMENT.md) — working on the code.
- [CONTRIBUTING.md](CONTRIBUTING.md) — commit conventions and PRs.

## License

[MIT](LICENSE) — © Sébastien Dubois ([DeveloPassion](https://developassion.be))
