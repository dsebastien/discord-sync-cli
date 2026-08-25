/** Rendering exports as Markdown with YAML frontmatter (Obsidian-friendly). */

import { IMAGE_EXTS, extOf, urlKey } from './assets'
import { discordUrl } from './core'
import type { DceExport, Manifest } from './types'

function localAssetMd(url: string, manifest: Manifest): string | null {
    const entry = manifest[urlKey(url)]
    if (!entry?.file) return null
    // Encode only what breaks markdown links; keep the path readable.
    return `../_assets/${entry.file.replace(/[()\s]/g, (c) => encodeURIComponent(c))}`
}

export function yamlStr(value: string): string {
    return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

const EXPLORE_RE = /^explore:\s*(true|false)\s*$/m

/** Read the explore flag out of an existing file so regeneration preserves it. */
export function existingExplore(existing: string | null): 'true' | 'false' {
    if (existing?.startsWith('---')) {
        const fm = existing.split('---')[1] ?? ''
        const m = fm.match(EXPLORE_RE)
        if (m) return m[1] as 'true' | 'false'
    }
    return 'false'
}

export function threadMarkdown(
    data: DceExport,
    manifest: Manifest,
    existing: string | null
): string {
    const ch = data.channel ?? {}
    const guild = data.guild ?? {}
    const msgs = data.messages ?? []
    const tid = ch.id ?? ''
    const gid = guild.id ?? ''
    const baseUrl = gid && tid ? discordUrl(gid, tid) : ''

    const timestamps = msgs
        .map((m) => m.timestamp ?? '')
        .filter(Boolean)
        .sort()
    const authors = [...new Set(msgs.map((m) => m.author?.name ?? '').filter(Boolean))].sort()

    const fm = [
        '---',
        `explore: ${existingExplore(existing)}`,
        `thread: ${yamlStr(ch.name ?? '')}`,
        `thread_id: "${tid}"`,
        `channel: ${yamlStr(ch.category ?? '')}`,
        `channel_id: "${ch.categoryId ?? ''}"`,
        `guild: ${yamlStr(guild.name ?? '')}`,
        `guild_id: "${gid}"`,
        `discord_url: ${baseUrl}`,
        `created: ${timestamps[0]?.slice(0, 10) ?? ''}`,
        `last_message: ${timestamps.at(-1)?.slice(0, 10) ?? ''}`,
        `message_count: ${msgs.length}`,
        'authors:',
        ...authors.map((a) => `  - ${yamlStr(a)}`),
        '---'
    ]

    const lines: string[] = ['', `# ${ch.name ?? 'thread'}`, '']
    if (baseUrl) lines.push(`[Open in Discord](${baseUrl})`, '')

    for (const msg of msgs) {
        const author = msg.author?.name ?? 'unknown'
        const ts = (msg.timestamp ?? '').slice(0, 16).replace('T', ' ')
        const mid = msg.id ?? ''
        const link = baseUrl && mid ? ` · [↗](${discordUrl(gid, tid, mid)})` : ''
        lines.push(`## ${author} — ${ts} UTC${link}`, '')
        if (msg.content) lines.push(msg.content, '')
        for (const att of msg.attachments ?? []) {
            const url = att.url ?? ''
            const href = localAssetMd(url, manifest) ?? url
            const name = att.fileName ?? 'attachment'
            const prefix = IMAGE_EXTS.has(extOf(url)) ? '!' : ''
            lines.push(`${prefix}[${name}](${href})`, '')
        }
        for (const emb of msg.embeds ?? []) {
            if (emb.title || emb.description) {
                if (emb.title) {
                    lines.push(emb.url ? `> **[${emb.title}](${emb.url})**` : `> **${emb.title}**`)
                }
                for (const dline of (emb.description ?? '').split('\n')) lines.push(`> ${dline}`)
                lines.push('')
            }
            for (const part of ['image', 'thumbnail'] as const) {
                const url = emb[part]?.url
                if (url) lines.push(`![embed](${localAssetMd(url, manifest) ?? url})`, '')
            }
        }
        const reactions = msg.reactions ?? []
        if (reactions.length) {
            const chips = reactions.map((r) => `${r.emoji?.name ?? '?'} ${r.count ?? 0}`).join('  ')
            lines.push(`*Reactions: ${chips}*`, '')
        }
    }

    return fm.join('\n') + '\n' + lines.join('\n').replace(/\s+$/, '') + '\n'
}
