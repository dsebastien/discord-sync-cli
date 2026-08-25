# AGENTS

## This project: discord-sync-cli

> Read this first. It orients you in **this** codebase; the generic guidance follows below.

**What it is.** A CLI/TUI for exporting/synchronizing Discord servers/channels/threads to JSON, HTML & Markdown. Exports run through the `tyrrrz/discordchatexporter:stable` docker image; the tool tracks what has been synced in the `state` section of `discord-sync.json`, downloads referenced assets, and regenerates HTML and Markdown renditions. Repo: <https://github.com/dsebastien/discord-sync-cli>. The compiled binary is `discord-sync` (built via `bun build --compile`).

**Start here.**

- `src/cli.ts` — entrypoint and the authoritative command list + help strings.
- `src/commands/sync-channel.ts` — the full pipeline for one channel (export → merge delta → update state → download assets → regenerate HTML + Markdown).
- `src/lib/schema.ts` — zod schemas; the source of truth for `discord-sync.json`.

**How the code is shaped.**

- `src/cli.ts` dispatches subcommands: `tui`, `servers`, `channels`, `select`, `deselect`, `sync-all`, `sync`, `export`, `update-state`, `merge`, `assets`, `html`, `md`, `validate`.
- `src/commands/*.ts` — one file per command. Each exports `main(args: string[])` for the CLI plus, usually, a library function other commands compose (`syncOne`, `exportChannel`, `mergeDeltaDir`, `updateState`, `downloadAssets`, `generateHtml`, `generateMarkdown`, `validateStateFile`). Put orchestration here, not in `lib/`.
- `src/lib/*.ts` — pure shared modules, tested through their interface: `core.ts` (snowflake/chunk math), `state.ts`, `assets.ts`, `render-html.ts`, `render-md.ts`, `merge.ts`, `schema.ts`, `sync-config.ts`, `discord-api.ts` (minimal REST client), `fs.ts`, `types.ts`. Tests live next to them as `*.test.ts` (bun:test, 56 tests).
- One project file at the root, `discord-sync.json`, with three sections: `settings` (hand-edited tuning knobs — asset/export delays and Markdown `frontmatter`), `guilds` (what SHOULD be synced — per guild/channel with its output directory; managed by `select`/`deselect`/`tui`), and `state` (what HAS been synced; auto-managed by `update-state`, which rewrites only `state`). The whole document is validated by `discord-sync validate`.

**Conventions specific to this repo.**

- **Snowflake IDs exceed 2^53 — never compare them as numbers.** Use `compareSnowflakes` in `src/lib/core.ts`, which orders as `[digit-count, string]`. Converting to `Number` silently corrupts IDs.
- **Discord CDN URLs are signed with expiring query params** (`ex=`/`is=`/`hm=`). The asset manifest keys on `urlKey(url)` (scheme+host+path only, `src/lib/assets.ts`) — never make the query string part of an asset's identity.
- **Generated outputs are committed but must never be hand-edited**: the channel archive directories (e.g. `canvas/`, `bases/`) and their `html/`, `md/`, `_assets/` subdirectories, plus the `state` section of `discord-sync.json` (rebuilt by `update-state`; `settings` and `guilds` in the same file are hand-edited). Regenerate via the CLI. `discord-sync.schema.json` is generated too — regenerate it with `bun run src/commands/validate-state.ts --emit-json-schema`; the zod schema in `src/lib/schema.ts` is the source of truth.
- **Markdown regeneration preserves curation**: `render-md.ts` reads the `explore:` frontmatter flag out of an existing file before rewriting it. Keep that behavior when touching Markdown generation.
- **Token**: `--token` flag > `DISCORD_TOKEN` env > `.env` in cwd (`resolveToken` in `src/lib/discord-api.ts` — compiled binaries do not auto-load `.env`, so it is parsed explicitly). **Discord ToS warning**: automating a user token risks account termination; bot tokens are the safe path.
- **Rate limits**: DiscordChatExporter is invoked with `--respect-rate-limits` and `--parallel 1`. Do not "optimize" these away; chunking exists for resumability, not speed.

## Agent Workflow

### Session-start checklist

1. Read `src/cli.ts` for the current command surface before touching commands.
2. Read the relevant `src/lib/*.ts` module and its `*.test.ts` before changing behavior.
3. Start `bun run tsc:watch` in the background before editing.

### Definition of done

A change is only "done" when **all** of the following hold:

- `bun run tsc` passes with zero errors.
- `bun test` passes; new logic has new `*.test.ts` coverage next to the file it tests.
- `bun run format` has been run and `bun run format:check` passes.
- `bun run build` completes without errors (the compiled binary is a release artifact).
- `bun run validate` (tsc + tests + lint + format check) is green.
- If the project-file shape changed: `src/lib/schema.ts` updated, `discord-sync.schema.json` regenerated.

Anything that talks to the live Discord API or docker cannot be fully self-verified offline. Say explicitly when a change needs a manual run (e.g. `bun run cli sync -c <ID>`) and what to check.

### Commit conventions

- Conventional Commits are enforced by commitlint on every commit (`commitlint.config.ts`).
- Allowed scopes: `all`, `cli`, `export`, `state`, `assets`, `html`, `md`, `schema`, `deps`, `docs`, `ci`, `build` (lowercase, no custom scopes — see `.cz-config.cjs`).
- Use `bun run cm` (commitizen with `cz-customizable`) to build a valid message interactively.
- Never bypass the commit hooks (no `--no-verify`, no `-n`). If a hook fails, fix the underlying problem.
- Keep commits scoped: one logical change per commit.

### Files to ignore

**NEVER modify by hand** unless explicitly instructed:

- The `state` section of `discord-sync.json`, and `discord-sync.schema.json` — generated/managed by the CLI.
- Channel archive directories (`canvas/`, `bases/`, …) including `html/`, `md/`, `_assets/` — generated output.
- `dist/` — build output. `node_modules/` — read-only.

The `settings` and `guilds` sections of `discord-sync.json` are user intent — edit `guilds` through `select`/`deselect`/`tui` (or by hand when asked), and `settings` by hand.

## Environment & tooling

- **[Bun](https://bun.sh/) ≥ 1.4** — runtime, package manager, test runner, and compiler (`bunfig.toml` forces `bun run` scripts through Bun).
- **Docker** — required for `export`/`sync`/`sync-all` (pulls `tyrrrz/discordchatexporter:stable`).
- **Git ≥ 2.54** — config-based hooks (see `.gitconfig` at the repo root).
- Only runtime dependency: `zod`. Keep it that way; prefer Bun built-ins and `node:` modules.

### Install

```bash
bun install
bun run setup   # activate the tracked .gitconfig (pre-commit format + commitlint hooks)
```

### Run the CLI from source

```bash
bun run cli <command> [options]   # e.g. bun run cli servers
bun run tui                       # interactive browser
```

### Production build

```bash
bun run build   # bun build --compile --minify --sourcemap src/cli.ts → dist/ standalone binary
```

## Development Workflow

**Before making ANY code changes**, start the TypeScript watch process in the background:

```bash
bun run tsc:watch
```

Check its output after each edit and fix type errors immediately. Optionally also run:

```bash
bun run test:watch
```

After editing code, always run:

```bash
bun run format
```

Before finishing, run the full gate:

```bash
bun run validate   # tsc + bun test + lint + format:check
```

CI (`.github/workflows/ci.yml`) runs: install (frozen lockfile) → `bun audit` → `bun run tsc` → `bun run test` → `bun run format:check` → `bun run build`. A lint step is being added — keep `bun run lint` clean (`--max-warnings 0`).

## Bun Runtime

Default to Bun instead of Node.js:

- `bun <file>` instead of `node <file>` or `ts-node <file>`.
- `bun test` instead of jest/vitest; `bun install` instead of npm/yarn/pnpm.
- `bunx <package>` instead of `npx <package>`.
- Bun auto-loads `.env` for scripts — but the **compiled binary does not**, which is why `resolveToken` parses `.env` manually. Preserve that.
- `Bun.argv`, `Bun.file`, and `node:util` `parseArgs` are the established patterns here.

## Testing

Use `bun test`. Test files use the **`.test.ts`** extension and sit next to the module they test:

```
src/lib/
    core.ts
    core.test.ts
```

```ts
import { describe, expect, test } from 'bun:test'

test('compareSnowflakes orders by length first', () => {
    expect(compareSnowflakes('99', '100')).toBeLessThan(0)
})
```

Keep tests pure: `src/lib/` modules must stay testable without docker, the network, or a Discord token. Anything needing I/O belongs in `src/commands/`.

## File & folder conventions

- `src/cli.ts` stays small: command table + dispatch only. Feature logic goes in `src/commands/`, pure logic in `src/lib/`.
- New command = new file in `src/commands/` exporting `main(args)`, registered in the `COMMANDS` table in `src/cli.ts` with a one-line help string.
- Never commit build artifacts (`dist/`, `node_modules/` — both gitignored).
- `.prettierignore` excludes generated content (the archive directories under `/*/`, `discord-sync.json`, `discord-sync.schema.json`, `discord-sync.json.lock`, `CHANGELOG.md`) — do not format those.

## Code style

- **Super strict TypeScript** (`tsconfig.json`): `strict`, `noUncheckedIndexedAccess` (indexed access returns `T | undefined` — narrow before use), `noImplicitReturns`, `noUnusedLocals`/`noUnusedParameters`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature` (use `process.env['DISCORD_TOKEN']`, not `.DISCORD_TOKEN`), `allowUnreachableCode: false`. `noEmit` — type checking only; Bun runs the TS directly.
- **Prettier** (`prettier.config.cjs`): 4-space indent, no semicolons, single quotes, `printWidth` 100, no trailing commas. The pre-commit hook formats staged files automatically.
- Explicit return types on exported functions; `const` by default; prefer `async/await` over promise chains.
