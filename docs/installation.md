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

> ⚠️ **Use a bot token.** Automating a **user** token ("self-botting") violates [Discord's Terms of Service](https://discord.com/terms) and can get the account **permanently terminated**. The tool technically accepts both kinds of token, but the only safe path is a **bot token**. The bot can only export servers it has been invited to.

### Getting a bot token (recommended)

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**. Give it any name (e.g. `my-archive-bot`).
2. In the left sidebar, open the **Bot** page.
3. Under **Privileged Gateway Intents**, enable **Message Content Intent** (without it, exported messages come back with empty text).
4. Still on the Bot page, click **Reset Token**, confirm, and **copy the token immediately** — it is shown only once. This is the value you give to the CLI.
5. Invite the bot to the server(s) you want to archive:
    - Open **OAuth2 → URL Generator** in the sidebar.
    - Under **Scopes**, check `bot`.
    - Under **Bot Permissions**, check **View Channels** and **Read Message History**.
    - Copy the generated URL at the bottom, open it in a browser, pick the server, and confirm. (You need the **Manage Server** permission on that server — for servers you don't manage, ask an admin to use the invite URL, or fall back to a user token at your own risk.)

Treat the token like a password: anyone who has it can act as the bot. If it leaks, go back to the Bot page and **Reset Token**.

### Getting your user token (at your own risk)

For servers where you cannot invite a bot (e.g. large communities you don't manage), the only option is your own user token — with the ToS/termination risk described above. A user token gives **full access to your account**, so guard it accordingly. The usual retrieval method, as described in [DiscordChatExporter's guide](https://github.com/Tyrrrz/DiscordChatExporter/blob/master/.docs/Token-and-IDs.md):

**From the Network tab:**

1. Open Discord in a **browser** (not the desktop app) and log in.
2. Open the browser developer tools (`F12` or `Ctrl+Shift+I`) and switch to the **Network** tab.
3. Interact with Discord (e.g. click a channel) so requests appear, and click any request to `discord.com/api/...`.
4. In the **Request Headers**, find `Authorization` — its value is your user token.

**Or with a console snippet.** On an open `discord.com` tab, open the developer tools **Console** and run this — it pulls the token out of Discord's own module registry and copies it to your clipboard (`copy()` is a DevTools console helper):

```js
;(() => {
    let token
    window.webpackChunkdiscord_app.push([
        [Symbol()],
        {},
        (req) => {
            for (const m of Object.values(req.c)) {
                if (m?.exports?.default?.getToken) token = m.exports.default.getToken()
            }
        }
    ])
    console.log(token)
    copy(token)
})()
```

> **You'll have to type `allow` first.** By default Discord blocks pasting into the console (a "self-XSS" protection): it shows a big red **"Stop!"** warning and, the first time, asks you to **type the word `allow` and press Enter** before it will accept a paste. Do that, then paste the snippet and run it. This safeguard exists because scammers talk people into pasting malicious code — so only ever paste snippets you understand, like this one, which just reads your own token.

If Discord's internals have changed and the snippet errors, fall back to the Network-tab method above.

Never share this token, never commit it, and consider any machine that stores it as holding your Discord credentials.

### Giving the token to the CLI

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
