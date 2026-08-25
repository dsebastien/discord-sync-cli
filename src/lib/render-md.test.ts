import { describe, expect, test } from 'bun:test'
import { existingExplore, threadMarkdown, yamlStr } from './render-md'
import type { DceExport } from './types'

const DATA: DceExport = {
    guild: { id: '686053708261228577', name: 'Obsidian Members Group (OMG)' },
    channel: {
        id: '1512189374282862824',
        type: 'GuildPublicThread',
        categoryId: '1262785282957119540',
        category: 'canvas-showcase',
        name: 'My "Canvas"'
    },
    messages: [
        {
            id: '1512189374282862824',
            timestamp: '2026-06-04T20:20:41.949+00:00',
            author: { name: 'w01ak' },
            content: 'look at this',
            attachments: [
                {
                    id: '9',
                    url: 'https://cdn.discordapp.com/attachments/1/9/pic.png?ex=1',
                    fileName: 'pic.png'
                }
            ]
        }
    ]
}

describe('threadMarkdown', () => {
    const md = threadMarkdown(
        DATA,
        { 'https://cdn.discordapp.com/attachments/1/9/pic.png': { file: '9_pic.png' } },
        null
    )

    test('frontmatter defaults explore to false and quotes strings', () => {
        expect(md.startsWith('---\nexplore: false\n')).toBe(true)
        expect(md).toContain('thread: "My \\"Canvas\\""')
        expect(md).toContain('thread_id: "1512189374282862824"')
        expect(md).toContain('message_count: 1')
        expect(md).toContain('  - "w01ak"')
    })
    test('includes the Discord deep links', () => {
        expect(md).toContain(
            'discord_url: https://discord.com/channels/686053708261228577/1512189374282862824'
        )
        expect(md).toContain(
            '(https://discord.com/channels/686053708261228577/1512189374282862824/1512189374282862824)'
        )
    })
    test('rewrites downloaded assets to local paths', () => {
        expect(md).toContain('![pic.png](../_assets/9_pic.png)')
    })
    test('preserves explore: true from an existing file', () => {
        const regenerated = threadMarkdown(DATA, {}, md.replace('explore: false', 'explore: true'))
        expect(regenerated).toContain('explore: true')
    })
})

describe('existingExplore', () => {
    test('defaults to false for missing or malformed files', () => {
        expect(existingExplore(null)).toBe('false')
        expect(existingExplore('no frontmatter')).toBe('false')
    })
})

describe('yamlStr', () => {
    test('escapes backslashes and quotes', () => {
        expect(yamlStr('a"b\\c')).toBe('"a\\"b\\\\c"')
    })
})

describe('configurable frontmatter', () => {
    const doc: DceExport = {
        guild: { id: '686053708261228577', name: 'OMG' },
        channel: { id: '1512189374282862824', category: 'canvas-showcase', name: 'My Canvas' },
        messages: [
            {
                id: '1',
                timestamp: '2026-06-04T20:20:41.949+00:00',
                author: { name: 'w01ak' },
                content: 'hi ![[Secret note]] there'
            }
        ]
    }
    test('injects user keys and honors explore default from settings', () => {
        const md = threadMarkdown(doc, {}, null, {
            explore: true,
            status: 'inbox',
            tags: ['discord', 'showcase']
        })
        expect(md).toContain('explore: true')
        expect(md).toContain('status: "inbox"')
        expect(md).toContain('tags: ["discord", "showcase"]')
    })
    test('existing explore wins over settings default', () => {
        const md = threadMarkdown(doc, {}, '---\nexplore: false\n---', { explore: true })
        expect(md).toContain('explore: false')
    })
    test('neutralizes Obsidian embed syntax in message content', () => {
        const md = threadMarkdown(doc, {}, null, {})
        expect(md).toContain('!\\[\\[Secret note]]')
        expect(md).not.toContain('hi ![[Secret note]]')
    })
})
