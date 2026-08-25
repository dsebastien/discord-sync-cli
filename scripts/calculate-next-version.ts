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

const [ma = 0, mi = 0, pa = 0] = (lastTag || '0.0.0').split('.').map(Number)
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
