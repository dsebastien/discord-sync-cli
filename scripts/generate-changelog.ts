#!/usr/bin/env bun
/**
 * generate-changelog.ts - prepend a release section to CHANGELOG.md from the
 * conventional commits since the last release tag. Dependency-free (no
 * conventional-changelog toolchain to keep version-matched).
 *
 * Version comes from package.json (the release workflow bumps it first).
 * A date can be passed as the first arg (CI passes one); otherwise today.
 */

const CHANGELOG = 'CHANGELOG.md'

async function git(...args: string[]): Promise<string> {
    const proc = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'ignore' })
    const out = await proc.stdout.text()
    await proc.exited
    return out.trim()
}

const version = ((await Bun.file('package.json').json()) as { version: string }).version
const dateArg = Bun.argv[2]
const date =
    dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg) ? dateArg : new Date().toISOString().slice(0, 10)

const lastTag = await git('describe', '--tags', '--abbrev=0', '--match', '[0-9]*.[0-9]*.[0-9]*')
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
const raw = await git('log', range, '--no-merges', '--pretty=%s%x00')
const subjects = raw
    .split('\0')
    .map((s) => s.trim())
    .filter(Boolean)

const groups: Record<string, string[]> = { feat: [], fix: [], perf: [] }
const labels: Record<string, string> = {
    feat: 'Features',
    fix: 'Bug Fixes',
    perf: 'Performance'
}
const RE = /^(feat|fix|perf)(?:\(([^)]*)\))?!?:\s*(.+)$/

for (const subject of subjects) {
    const m = subject.match(RE)
    if (!m) continue
    const [, type, scope, desc] = m
    groups[type!]!.push(scope ? `**${scope}:** ${desc}` : desc!)
}

const lines: string[] = [`## ${version} (${date})`, '']
let any = false
for (const type of ['feat', 'fix', 'perf']) {
    const items = groups[type]!
    if (!items.length) continue
    any = true
    lines.push(`### ${labels[type]}`, '')
    for (const it of items) lines.push(`- ${it}`)
    lines.push('')
}
if (!any) {
    lines.push('_No user-facing changes._', '')
}
const section = lines.join('\n')

const existing = (await Bun.file(CHANGELOG).exists()) ? await Bun.file(CHANGELOG).text() : ''
// Keep the file's leading title/preamble (everything up to the first "## ")
const firstEntry = existing.search(/^## /m)
const head = firstEntry === -1 ? existing.replace(/\s*$/, '\n\n') : existing.slice(0, firstEntry)
const tail = firstEntry === -1 ? '' : existing.slice(firstEntry)

await Bun.write(CHANGELOG, `${head}${section}\n${tail}`.replace(/\n{3,}/g, '\n\n'))
console.log(`changelog: added ${version} (${subjects.length} commits scanned)`)
