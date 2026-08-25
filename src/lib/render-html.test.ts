import { describe, expect, test } from 'bun:test'
import {
    escapeHtml,
    indexPage,
    localAsset,
    renderMarkdown,
    renderMessage,
    threadPage
} from './render-html'
import type { DceMessage, Manifest } from './types'

const MANIFEST: Manifest = {
    'https://cdn.discordapp.com/attachments/1/2/shot.png': { file: '2_shot.png' },
    'https://cdn.discordapp.com/attachments/1/3/gone.png': { error: 'http 404' }
}

describe('escapeHtml', () => {
    test('neutralises markup', () => {
        expect(escapeHtml(`<img onerror="x('y')">&`)).toBe(
            '&lt;img onerror=&quot;x(&#39;y&#39;)&quot;&gt;&amp;'
        )
    })
})

describe('renderMarkdown', () => {
    test('escapes html but linkifies URLs', () => {
        const out = renderMarkdown('see <b>https://example.test/page</b>')
        expect(out).toContain('&lt;b&gt;')
        expect(out).toContain('href="https://example.test/page"')
    })
    test('renders code fences without linkifying their contents', () => {
        const out = renderMarkdown('```\nconst a = "<x>";\n```')
        expect(out).toContain('<pre')
        expect(out).toContain('&lt;x&gt;')
    })
    test('inline code and bold', () => {
        expect(renderMarkdown('`code` and **loud**')).toContain('<code')
        expect(renderMarkdown('`code` and **loud**')).toContain('<strong>loud</strong>')
    })
})

describe('localAsset', () => {
    test('resolves a downloaded asset regardless of the signature params', () => {
        expect(
            localAsset(
                'https://cdn.discordapp.com/attachments/1/2/shot.png?ex=123&hm=abc',
                MANIFEST
            )
        ).toBe('../_assets/2_shot.png')
    })
    test('returns null for failed or unknown assets', () => {
        expect(
            localAsset('https://cdn.discordapp.com/attachments/1/3/gone.png', MANIFEST)
        ).toBeNull()
        expect(localAsset('https://cdn.discordapp.com/other.png', MANIFEST)).toBeNull()
    })
})

describe('renderMessage', () => {
    const msg: DceMessage = {
        id: '999999999999999999',
        timestamp: '2026-08-25T06:08:40.14+00:00',
        author: { name: 'seb' },
        content: 'hello',
        attachments: [
            {
                id: '2',
                url: 'https://cdn.discordapp.com/attachments/1/2/shot.png?ex=1',
                fileName: 'shot.png'
            }
        ]
    }
    test('uses local asset paths and links the timestamp to Discord', () => {
        const html = renderMessage(msg, MANIFEST, 'https://discord.com/channels/g/t')
        expect(html).toContain('src="../_assets/2_shot.png"')
        expect(html).toContain('href="https://discord.com/channels/g/t/999999999999999999"')
    })
    test('falls back to the remote URL when the asset is missing', () => {
        const html = renderMessage(
            {
                ...msg,
                attachments: [
                    {
                        id: '3',
                        url: 'https://cdn.discordapp.com/attachments/1/3/gone.png',
                        fileName: 'gone.png'
                    }
                ]
            },
            MANIFEST
        )
        expect(html).toContain('src="https://cdn.discordapp.com/attachments/1/3/gone.png"')
    })
})

describe('threadPage / indexPage', () => {
    test('thread page carries the explored toggle and the Discord link', () => {
        const page = threadPage(
            {
                guild: { id: '686', name: 'OMG' },
                channel: { id: '126', name: 'My Canvas', category: 'canvas-showcase' },
                messages: []
            },
            {}
        )
        expect(page).toContain('data-thread-id="126"')
        expect(page).toContain('https://discord.com/channels/686/126')
        expect(page).toContain('discord-sync-explored')
        expect(page).toContain('cdn.tailwindcss.com')
    })
    test('index sorts newest-first and includes per-row toggles', () => {
        const page = indexPage('canvas', [
            { name: 'old', file: 'old.html', count: 1, last: '2024-01-01', tid: '1' },
            { name: 'new', file: 'new.html', count: 2, last: '2026-01-01', tid: '2' }
        ])
        expect(page.indexOf('new.html')).toBeLessThan(page.indexOf('old.html'))
        expect(page).toContain('exportState()')
        expect(page).toContain('data-thread-id="2"')
    })
})
