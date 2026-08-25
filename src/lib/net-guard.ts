/** SSRF guard: message embeds carry attacker-controlled URLs, so before the
 * asset downloader fetches one we require http(s) and a public destination. */

import { lookup } from 'node:dns/promises'

/** True for loopback / private / link-local / reserved IPv4 and IPv6 ranges. */
export function isPrivateIp(ip: string): boolean {
    const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])]
        if (a === 10) return true
        if (a === 127) return true // loopback
        if (a === 0) return true // "this" network
        if (a === 172 && b >= 16 && b <= 31) return true
        if (a === 192 && b === 168) return true
        if (a === 169 && b === 254) return true // link-local incl. cloud metadata
        if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
        if (a >= 224) return true // multicast / reserved
        return false
    }
    const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '')
    if (v6 === '::1' || v6 === '::') return true // loopback / unspecified
    if (v6.startsWith('fe80')) return true // link-local
    if (v6.startsWith('fc') || v6.startsWith('fd')) return true // unique local
    if (v6.startsWith('ff')) return true // multicast
    // IPv4-mapped IPv6 (::ffff:127.0.0.1)
    const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1]!)
    return false
}

/**
 * Resolve a URL and reject it unless it is http(s) to a public address.
 * Returns null when safe, or a reason string when it must be blocked.
 * `resolver` is injected for testability (defaults to DNS lookup).
 */
export async function blockReason(
    url: string,
    resolver: (host: string) => Promise<string[]> = defaultResolver
): Promise<string | null> {
    let u: URL
    try {
        u = new URL(url)
    } catch {
        return 'not a valid URL'
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return `scheme ${u.protocol} not allowed`
    }
    const host = u.hostname.replace(/^\[|\]$/g, '')
    if (host === 'localhost') return 'host resolves to a private address'
    // Literal IP host: check directly.
    if (/^[\d.]+$/.test(host) || host.includes(':')) {
        return isPrivateIp(host) ? 'host is a private/reserved address' : null
    }
    let addresses: string[]
    try {
        addresses = await resolver(host)
    } catch {
        return 'host does not resolve'
    }
    if (addresses.length === 0) return 'host does not resolve'
    // Block if ANY resolved address is private (DNS-rebinding safe).
    if (addresses.some(isPrivateIp)) return 'host resolves to a private address'
    return null
}

async function defaultResolver(host: string): Promise<string[]> {
    const results = await lookup(host, { all: true })
    return results.map((r) => r.address)
}
