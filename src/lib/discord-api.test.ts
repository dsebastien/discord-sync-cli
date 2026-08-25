import { afterEach, describe, expect, test } from 'bun:test'
import { channelKind, DiscordApi, isExportable, resolveToken, slugify } from './discord-api'

const realFetch = globalThis.fetch

afterEach(() => {
    globalThis.fetch = realFetch
})

function mockFetch(
    handler: (url: string, init?: RequestInit) => Response | Promise<Response>
): void {
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
        Promise.resolve(handler(String(url), init))) as typeof fetch
}

describe('slugify', () => {
    test('produces directory-safe names', () => {
        expect(slugify('Canvas Showcase!')).toBe('canvas-showcase')
        expect(slugify('bases-showcase')).toBe('bases-showcase')
        expect(slugify('études & Notes')).toBe('etudes-notes')
        expect(slugify('***')).toBe('channel')
    })
})

describe('isExportable / channelKind', () => {
    test('keeps text, announcement, forum, media; drops voice and categories', () => {
        expect(isExportable({ id: '1', name: 'x', type: 0 })).toBe(true)
        expect(channelKind({ id: '1', name: 'x', type: 15 })).toBe('forum')
        expect(isExportable({ id: '1', name: 'x', type: 2 })).toBe(false)
        expect(isExportable({ id: '1', name: 'x', type: 4 })).toBe(false)
    })
})

describe('resolveToken', () => {
    test('explicit beats environment', async () => {
        process.env['DISCORD_TOKEN'] = 'from-env'
        expect(await resolveToken('explicit')).toBe('explicit')
        expect(await resolveToken()).toBe('from-env')
        delete process.env['DISCORD_TOKEN']
    })
})

describe('DiscordApi', () => {
    test('falls back to Bot auth when bare token is rejected', async () => {
        const seen: string[] = []
        mockFetch((url, init) => {
            const auth = (init?.headers as Record<string, string>)['Authorization']!
            seen.push(auth)
            if (url.endsWith('/users/@me')) {
                return auth.startsWith('Bot ')
                    ? Response.json({ id: '1' })
                    : new Response('', { status: 401 })
            }
            return Response.json([{ id: '10000000000000000001', name: 'G' }])
        })
        const api = new DiscordApi('tok')
        const guilds = await api.listGuilds()
        expect(seen[0]).toBe('tok')
        expect(seen[1]).toBe('Bot tok')
        expect(guilds).toEqual([{ id: '10000000000000000001', name: 'G' }])
    })

    test('paginates guild listing and sorts by name', async () => {
        const page1 = Array.from({ length: 200 }, (_, i) => ({
            id: String(20000000000000000000n + BigInt(i)),
            name: `z${String(i).padStart(3, '0')}`
        }))
        mockFetch((url) => {
            if (url.endsWith('/users/@me')) return Response.json({ id: '1' })
            if (url.includes('after=0')) return Response.json(page1)
            return Response.json([{ id: '30000000000000000001', name: 'aaa' }])
        })
        const api = new DiscordApi('tok')
        const guilds = await api.listGuilds()
        expect(guilds.length).toBe(201)
        expect(guilds[0]!.name).toBe('aaa')
    })

    test('groups channels under their categories and drops voice', async () => {
        mockFetch((url) => {
            if (url.endsWith('/users/@me')) return Response.json({ id: '1' })
            return Response.json([
                { id: '1', name: 'Showcase', type: 4, position: 0 },
                { id: '2', name: 'canvas-showcase', type: 15, parent_id: '1', position: 1 },
                { id: '3', name: 'General', type: 2, position: 2 },
                { id: '4', name: 'lobby', type: 0, parent_id: null, position: 0 }
            ])
        })
        const api = new DiscordApi('tok')
        const channels = await api.listChannels('g')
        expect(channels.map((c) => c.name)).toEqual(['lobby', 'canvas-showcase'])
        expect(channels[1]!.category).toBe('Showcase')
    })
})
