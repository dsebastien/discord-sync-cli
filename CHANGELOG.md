# Changelog

All notable changes to this project are documented in this file.

The format is based on [Conventional Commits](https://www.conventionalcommits.org/); sections are generated with `bun run release:changelog` during the release workflow.

## 1.1.0 (2026-08-25)

### Features

- **export:** stage full exports and swap in on success
- **state:** advisory config lock to serialize concurrent syncs
- **state:** unify config+state into discord-sync.json
- **cli:** live in-TUI sync view with progress log
- **all:** Discord sync toolkit - CLI/TUI, exporters, renderers, state tracking

### Bug Fixes

- **build:** replace conventional-changelog with a dependency-free generator
- **deps:** override tmp>=0.2.6 to clear high audit advisory
- **html:** aggregate exports by thread ID before rendering
- harden asset fetch, merge, thread renames, TUI keys, version base
- **html:** escape URL attributes, allowlist protocols, fix angle-bracket links
- **export:** resolve outDir to an absolute path for docker --volume

