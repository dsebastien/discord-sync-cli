# Development Guide

This guide explains how to build, run, and test discord-sync-cli locally.

## Prerequisites

- [Bun](https://bun.sh/) 1.4+ (runtime, package manager, test runner, and compiler)
- [Docker](https://www.docker.com/) — exports run through the `tyrrrz/discordchatexporter:stable` image
- [Git](https://git-scm.com/) 2.54+ — required for the config-based pre-commit hooks
- A Discord token. Prefer a **bot token**: automating a **user token** is against Discord's ToS and risks account termination.

## Setup

### Clone the Repository

```bash
git clone https://github.com/dsebastien/discord-sync-cli.git
cd discord-sync-cli
```

### Install Dependencies

```bash
bun install
```

### Activate the Git Hooks

```bash
bun run setup
```

This runs `git config --local include.path ../.gitconfig`, activating the tracked `.gitconfig` at the repo root: a `pre-commit` hook that formats staged files with Prettier (`scripts/git-hooks/format-staged.sh`) and a `commit-msg` hook that runs commitlint. See `CONTRIBUTING.md` for details.

### Configure the Token

Provide the Discord token one of three ways (highest precedence first):

1. `--token <TOKEN>` flag on commands that need it
2. `DISCORD_TOKEN` environment variable
3. A `.env` file in the working directory containing `DISCORD_TOKEN=...` (parsed explicitly, so it also works with the compiled binary)

## Development Workflow

### Run the CLI from source

```bash
bun run cli <command>     # e.g. bun run cli servers
bun run tui               # interactive server/channel browser
bun run cli --help        # authoritative command list
```

### Type Checking

Keep this running in a separate terminal while you code:

```bash
bun run tsc:watch
```

### Run Tests

```bash
bun test                  # or: bun run test
bun run test:watch
bun test src/lib/core.test.ts   # single file
```

### Linting and Formatting

```bash
bun run lint          # ESLint, zero warnings allowed
bun run lint:fix      # Auto-fix lint errors
bun run format        # Format with Prettier
bun run format:check  # Check formatting without changes
```

### Full validation gate

```bash
bun run validate      # tsc + tests + lint + format:check — run before pushing
```

## Building the Binary

```bash
bun run build
```

This compiles `src/cli.ts` into a standalone, minified `discord-sync` binary (with sourcemap) in `dist/` via `bun build --compile`. The binary needs no Bun installation on the target machine — only docker for the export commands.

## Available Scripts

| Script                            | Description                                                               |
| --------------------------------- | ------------------------------------------------------------------------- |
| `bun run cli`                     | Run the CLI from source (`bun run src/cli.ts`)                            |
| `bun run tui`                     | Interactive browser: pick servers/channels, select, queue syncs           |
| `bun run servers`                 | List servers the token can see                                            |
| `bun run sync`                    | Full pipeline for one channel (export → merge → state → assets → html+md) |
| `bun run sync-all`                | Sync every channel selected in `discord-sync.json`                        |
| `bun run export`                  | Run DiscordChatExporter (chunked, flat, or `--since-state`)               |
| `bun run update-state`            | Rebuild the `state` section of `discord-sync.json` from export dirs       |
| `bun run merge`                   | Fold an incremental `_since-*` delta into the master exports              |
| `bun run assets`                  | Download attachments/embeds/stickers into `<dir>/_assets/`                |
| `bun run html` / `md`             | Regenerate the HTML pages / Markdown files                                |
| `bun run validate-state`          | Validate `discord-sync.json` against the zod schema                       |
| `bun run tsc` / `tsc:watch`       | Type check (once / watch mode; `tscw` is an alias)                        |
| `bun run test` / `test:watch`     | Run tests (once / watch mode)                                             |
| `bun run lint` / `lint:fix`       | Run ESLint / auto-fix                                                     |
| `bun run format` / `format:check` | Format with Prettier / check only                                         |
| `bun run validate`                | tsc + tests + lint + format check                                         |
| `bun run build`                   | Compile the standalone binary into `dist/`                                |
| `bun run cm`                      | Create a commit with Commitizen (`commit` is an alias)                    |
| `bun run setup`                   | Activate the tracked `.gitconfig` (git hooks)                             |
| `bun run release`                 | Trigger the release workflow (see below)                                  |

## Release Process

Releases are fully automated through a **two-phase GitHub workflow** (`.github/workflows/release.yml`), triggered locally:

```bash
bun run release
```

The script (`scripts/release.sh`):

1. Checks that the GitHub CLI (`gh`) is installed and authenticated, that you are on `main`, and that the working tree is clean
2. Pulls the latest changes and suggests the next SemVer version from the conventional-commit history (`scripts/calculate-next-version.ts`)
3. Prompts for confirmation, pushes, and dispatches `release.yml` with the chosen version

The workflow then runs in two phases (so the provenance attestation is bound to the tag commit):

1. **Prepare** — bumps `package.json`, regenerates `CHANGELOG.md` (conventional-changelog), commits, tags the release commit, and re-dispatches the workflow at the tag ref
2. **Publish** — cross-compiles the binary for every target (`discord-sync-linux-x64`, `discord-sync-linux-arm64`, `discord-sync-darwin-x64`, `discord-sync-darwin-arm64`, `discord-sync-windows-x64.exe`), generates build-provenance attestations, and creates the GitHub release with the binaries attached

Watch it with `gh run watch`.

## Troubleshooting

### `export`/`sync` fails immediately

- Verify docker is running and can pull `tyrrrz/discordchatexporter:stable`
- Check the token (flag > `DISCORD_TOKEN` env > `.env` file)

### Commit rejected

- The `commit-msg` hook enforces conventional commits with a fixed scope list — use `bun run cm` to build a valid message
- If hooks don't run at all, check `git --version` (2.54+ required) and re-run `bun run setup`

### Build or type errors

- Run `bun install` to ensure dependencies are up to date
- Run `bun run tsc` and fix errors — the config is maximally strict (`noUncheckedIndexedAccess` etc.)

### State validation fails

- `bun run validate-state` reports schema violations in `discord-sync.json`
- Never hand-edit the `state` section of `discord-sync.json`; rebuild it with `bun run update-state` (that rewrites only `state`, leaving `settings` and `guilds` intact)
- After changing `src/lib/schema.ts`, regenerate the JSON schema: `bun run src/commands/validate-state.ts --emit-json-schema`
