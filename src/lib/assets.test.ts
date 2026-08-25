import { describe, expect, test } from 'bun:test'
import { collectAssets, derivedName, extOf, safeName, urlKey } from './assets'
import type { DceExport } from './types'

describe('urlKey', () => {
    test("strips Discord's expiring signature params", () => {
        const signed = 'https://cdn.discordapp.com/attachments/1/2/img.png?ex=6a8e&is=6a8d&hm=c2a3&'
        expect(urlKey(signed)).toBe('https://cdn.discordapp.com/attachments/1/2/img.png')
        // Re-signed URL for the same asset yields the same key.
        expect(urlKey(signed.replace('6a8e', 'ffff'))).toBe(urlKey(signed))
    })
})

describe('safeName', () => {
    test('neutralises path and shell characters', () => {
        expect(safeName('../..//etc passwd$(x).png')).toBe('etc_passwd_x_.png')
    })
    test('caps length and never returns empty', () => {
        expect(safeName('x'.repeat(500)).length).toBe(120)
        expect(safeName('###')).toBe('asset')
    })
})

describe('extOf', () => {
    test('reads the extension from the URL path, not the query', () => {
        expect(extOf('https://x.test/a/b.PNG?fake=.gif')).toBe('.png')
        expect(extOf('https://x.test/none')).toBe('')
    })
})

describe('collectAssets', () => {
    const data: DceExport = {
        messages: [
            {
                attachments: [{ id: '42', url: 'https://cdn.test/a.png', fileName: 'a.png' }],
                embeds: [
                    {
                        image: { url: 'https://cdn.test/e.png' },
                        thumbnail: { url: 'https://cdn.test/t.png' }
                    }
                ],
                stickers: [{ id: '7', name: 'wave', sourceUrl: 'https://cdn.test/s.png' }]
            }
        ]
    }
    test('finds attachments, embed images, thumbnails, and stickers', () => {
        const refs = collectAssets(data)
        expect(refs.map((r) => r.kind).sort()).toEqual([
            'attachment',
            'embed-image',
            'embed-thumbnail',
            'sticker'
        ])
        expect(refs.find((r) => r.kind === 'attachment')!.fileName).toBe('42_a.png')
    })
    test('handles empty exports', () => {
        expect(collectAssets({ messages: [] })).toEqual([])
        expect(collectAssets({})).toEqual([])
    })
})

describe('derivedName', () => {
    test('is stable for the same asset regardless of signature', async () => {
        const a = await derivedName('https://cdn.discordapp.com/x/pic.png?ex=1')
        const b = await derivedName('https://cdn.discordapp.com/x/pic.png?ex=2')
        expect(a).toBe(b)
        expect(a.endsWith('_pic.png')).toBe(true)
    })
})
