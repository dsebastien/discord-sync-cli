/** Extracting and naming the assets referenced by an export. */

import type { DceExport } from './types'

export const IMAGE_EXTS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.avif',
    '.bmp',
    '.svg'
])

/** Canonical manifest key: scheme+host+path. Discord signs its cdn URLs with
 * expiring query params (ex=/is=/hm=), so the query string must not be part
 * of the identity. */
/** Discord CDN hosts whose query strings are volatile signed params (ex/is/hm)
 * and must be dropped from the identity. Other hosts keep their full query. */
function isDiscordCdnHost(host: string): boolean {
    return (
        host.endsWith('.discordapp.com') ||
        host.endsWith('.discordapp.net') ||
        host.endsWith('.discord.com') ||
        host === 'discordapp.com' ||
        host === 'discord.com' ||
        host === 'cdn.discordapp.com'
    )
}

export function urlKey(url: string): string {
    try {
        const u = new URL(url)
        // On Discord CDN the query is an expiring signature -> key on path only.
        // Elsewhere the query is meaningful (?id=alice vs ?id=bob) -> keep it.
        if (isDiscordCdnHost(u.host)) {
            return `${u.protocol}//${u.host}${u.pathname}`
        }
        return `${u.protocol}//${u.host}${u.pathname}${u.search}`
    } catch {
        return url
    }
}

export function safeName(name: string, limit = 120): string {
    const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^[._]+|[._]+$/g, '') || 'asset'
    return cleaned.slice(0, limit)
}

export function extOf(url: string): string {
    try {
        const path = new URL(url).pathname
        const dot = path.lastIndexOf('.')
        return dot === -1 ? '' : path.slice(dot).toLowerCase()
    } catch {
        return ''
    }
}

async function sha1hex(s: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function derivedName(url: string): Promise<string> {
    let base = 'asset'
    try {
        const path = new URL(url).pathname
        base = safeName(path.slice(path.lastIndexOf('/') + 1) || 'asset')
    } catch {
        /* keep default */
    }
    const digest = (await sha1hex(urlKey(url))).slice(0, 10)
    return `${digest}_${base}`
}

export interface AssetRef {
    url: string
    /** Preferred local filename; null means derive one from the URL. */
    fileName: string | null
    kind: string
}

/** Every asset URL referenced by one export file. */
export function collectAssets(data: DceExport): AssetRef[] {
    const out: AssetRef[] = []
    for (const msg of data.messages ?? []) {
        for (const att of msg.attachments ?? []) {
            if (att.url) {
                out.push({
                    url: att.url,
                    fileName: `${att.id ?? ''}_${safeName(att.fileName ?? 'file')}`,
                    kind: 'attachment'
                })
            }
        }
        for (const emb of msg.embeds ?? []) {
            for (const part of ['image', 'thumbnail', 'video'] as const) {
                const url = emb[part]?.url
                if (url) out.push({ url, fileName: null, kind: `embed-${part}` })
            }
            for (const img of emb.images ?? []) {
                if (img.url) out.push({ url: img.url, fileName: null, kind: 'embed-image' })
            }
        }
        for (const st of msg.stickers ?? []) {
            if (st.sourceUrl) {
                out.push({
                    url: st.sourceUrl,
                    fileName: `${st.id ?? ''}_${safeName(st.name ?? 'sticker')}`,
                    kind: 'sticker'
                })
            }
        }
    }
    return out
}
