# Contributing

Thank you for your interest in contributing to discord-sync-cli!

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) 1.4+
- [Git](https://git-scm.com/) 2.54+ (required for the config-based git hooks)
- [Docker](https://www.docker.com/) if you want to run actual exports (DiscordChatExporter runs in a container)

### Fork and Clone

1. Fork this repository by clicking the "Fork" button on GitHub
2. Clone your fork locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/discord-sync-cli.git
    cd discord-sync-cli
    ```
3. Add the upstream repository as a remote:
    ```bash
    git remote add upstream https://github.com/dsebastien/discord-sync-cli.git
    ```

### Install Dependencies

```bash
bun install
```

## Git hooks (Git 2.54+)

This repo uses [Git's built-in config-based hooks](https://github.blog/open-source/git/highlights-from-git-2-54/) (introduced in **Git 2.54**) instead of Husky + `lint-staged`. The hook definitions live in a tracked `.gitconfig` file at the repo root.

### Enable the hooks once per clone

After the first `bun install`, run:

```bash
bun run setup
```

That runs `git config --local include.path ../.gitconfig` — the path is relative to `.git/`, so `../.gitconfig` resolves to the repo root. Git then picks up:

- **`pre-commit` → `scripts/git-hooks/format-staged.sh`** — runs Prettier over the staged files and re-stages them.
- **`commit-msg` → `bunx commitlint --edit`** — validates the commit message against `commitlint.config.ts`.

Git versions older than 2.54 silently ignore config-based hooks — the hooks won't run, but nothing breaks.

## Development Workflow

### Create a Branch

```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names: `feature/`, `fix/`, `docs/`, `refactor/`.

### Development

Start the TypeScript watch process, and optionally the tests in watch mode:

```bash
bun run tsc:watch
bun run test:watch
```

### Code Quality

Before pushing, ensure your code passes all checks:

```bash
bun run validate
```

This runs, in order: `bun run tsc` (type check), `bun test`, `bun run lint`, and `bun run format:check`. You can also run each individually, plus `bun run format` to fix formatting and `bun run lint:fix` to auto-fix lint errors.

### Commit Your Changes

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) via commitlint. The easiest way to write a valid message is the interactive prompt:

```bash
bun run cm
```

Allowed scopes (see `commitlint.config.ts` and `.cz-config.cjs`):

`all`, `cli`, `export`, `state`, `assets`, `html`, `md`, `schema`, `deps`, `docs`, `ci`, `build`

Examples:

```
feat(export): support forum channels
fix(state): order snowflakes by [length, string]
docs(all): document the sync pipeline
```

Do not bypass the hooks (`--no-verify`); if a hook fails, fix the underlying problem.

### Keep Your Fork Updated

```bash
git fetch upstream
git rebase upstream/main
```

### Push Your Changes

```bash
git push origin feature/your-feature-name
```

## Creating a Pull Request

1. Go to your fork on GitHub and click "Compare & pull request"
2. Provide a clear title (conventional-commit style is appreciated)
3. Describe what you changed and why; reference related issues (e.g., "Fixes #123")
4. Submit the pull request

## Pull Request Guidelines

- Keep PRs focused on a single change
- Ensure all CI checks pass (audit, type check, tests, format check, build)
- Add or update tests (`src/lib/*.test.ts`) for new functionality
- Never hand-edit generated content (`exports-state.json`, `exports-state.schema.json`, archive output directories)
- Update documentation if behavior or commands change
- Be responsive to feedback and review comments

## Code Style

This project uses:

- **Prettier** for formatting (4-space indent, no semicolons, single quotes)
- **TypeScript** in maximum-strictness mode (`noUncheckedIndexedAccess` and friends)
- **ESLint** for linting (`bun run lint`, zero warnings allowed)

The CI pipeline enforces these standards. Run `bun run validate` before pushing.

## Questions?

If you have questions, feel free to open an issue for discussion.
