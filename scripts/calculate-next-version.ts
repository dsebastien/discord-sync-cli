#!/usr/bin/env bun
/**
 * calculate-next-version.ts - suggest the next SemVer from conventional commits.
 *
 * Looks at commits since the last release tag: BREAKING CHANGE / '!' -> major,
 * feat -> minor, anything else -> patch. With --verbose, prints the analysis.
 */

const verbose = Bun.argv.includes('--verbose')

async function git(...args: string[]): Promise<string> {
    const proc = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'ignore' })
    const out = await proc.stdout.text()
    await proc.exited
    return out.trim()
}

const lastTag = await git('describe', '--tags', '--abbrev=0', '--match', '[0-9]*.[0-9]*.[0-9]*')
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
const log = await git('log', range, '--pretty=%s%n%b%x00')
const commits = log
    .split('\0')
    .map((c) => c.trim())
    .filter(Boolean)

let major = 0,
    minor = 0,
    patch = 0
for (const c of commits) {
    const subject = c.split('\n')[0] ?? ''
    if (/^[a-z]+(\([^)]*\))?!:/.test(subject) || /BREAKING CHANGE/.test(c)) major++
    else if (/^feat(\([^)]*\))?:/.test(subject)) minor++
    else patch++
}

// Base off the greater of the latest tag and the current package.json version,
// so a first release (no tags) never downgrades a package already at e.g. 1.0.0.
const pkgVersion = (await Bun.file('package.json').json()).version ?? '0.0.0'
function cmp(a: string, b: string): number {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
    }
    return 0
}
const base = lastTag && cmp(lastTag, pkgVersion) > 0 ? lastTag : pkgVersion
const [ma = 0, mi = 0, pa = 0] = base.split('.').map(Number)
let next: string
if (major > 0) next = `${ma + 1}.0.0`
else if (minor > 0) next = `${ma}.${mi + 1}.0`
else next = `${ma}.${mi}.${pa + 1}`

if (verbose) {
    console.log(`last tag: ${lastTag || '(none)'}`)
    console.log(
        `commits since: ${commits.length} (${major} breaking, ${minor} feat, ${patch} other)`
    )
    console.log(`suggested: ${next}`)
} else {
    console.log(next)
}
