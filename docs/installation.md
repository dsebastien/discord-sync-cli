---
title: Installation
nav_order: 2
---

# Installation

## Prerequisites

| Requirement         | Why                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bun** >= 1.4      | Runs the CLI from source and builds the standalone binary. Not needed if you only use a release binary.                                                                                    |
| **Docker**          | Exports run through the official [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter) image, `tyrrrz/discordchatexporter:stable`. It is pulled automatically on first use. |
| **A Discord token** | Used both to browse servers/channels (Discord REST API) and by DiscordChatExporter to export messages.                                                                                     |

## Getting a binary

**Download a release.** Grab the binary for your platform from the [GitHub releases](https://github.com/dsebastien/discord-sync-cli/releases) page:

- `discord-sync-linux-x64`
- `discord-sync-linux-arm64`
- `discord-sync-darwin-x64`
- `discord-sync-darwin-arm64`
- `discord-sync-windows-x64.exe`

Rename it to `discord-sync`, make it executable (`chmod +x discord-sync`), and put it on your `PATH`.

**Or build from source:**

```bash
git clone https://github.com/dsebastien/discord-sync-cli
cd discord-sync-cli
bun install
bun run build     # -> dist/discord-sync
```

You can also skip the build entirely and run any command with `bun run src/cli.ts <command>`.

## The Discord token

> ⚠️ **Use a bot token.** Automating a **user** token ("self-botting") violates [Discord's Terms of Service](https://discord.com/terms) and can get the account **permanently terminated**. The tool technically accepts both kinds of token, but the only safe path is a **bot token**:
>
> 1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and add a **Bot** to it.
> 2. Enable the **Message Content** privileged intent on the Bot page (without it, exported messages come back empty).
> 3. Invite the bot to your server with at least the **Read Message History** (and View Channels) permissions.
> 4. Copy the bot token and give it to the CLI as described below.
>
> The bot can only export servers it has been invited to.

The token is resolved in this order:

1. **`--token <TOKEN>`** — accepted by the browsing commands (`tui`, `servers`, `channels`, `select`, `deselect`). Handy for one-offs, but it leaks into your shell history.
2. **`DISCORD_TOKEN` environment variable** — works everywhere:

    ```bash
    export DISCORD_TOKEN="your-bot-token"
    ```

3. **A `.env` file** in the working directory:

    ```bash
    # .env
    DISCORD_TOKEN=your-bot-token
    ```

    The compiled binary reads this file explicitly, so it works the same whether you run from source or from a release binary.

Note that the export commands (`sync`, `sync-all`, `export`) require the token to be present as the **`DISCORD_TOKEN` environment variable**, because it is passed through to the DiscordChatExporter docker container. When using a `.env` file, load it into the environment first (e.g. `export $(cat .env)` or a tool like `direnv`).

Whether the token belongs to a bot or a user is detected automatically — no prefix or extra flag needed.

## Verify the setup

```bash
discord-sync servers
```

If the token and Docker are set up correctly, this prints every server the token can see. Then head to the [Usage](usage.md) guide.
