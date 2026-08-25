import { describe, expect, test } from 'bun:test'
import {
    channelMark,
    deselectChannel,
    directoryTaken,
    guildMark,
    selectChannel
} from './sync-config'
import { emptyDoc } from './state'
import type { DiscordSyncDoc } from './types'

const GUILD = { id: '686053708261228577', name: 'OMG' }
const CH = { id: '126278528295711954', name: 'canvas-showcase' }

function docWithState(): DiscordSyncDoc {
    const doc = emptyDoc()
    doc.state.channels['126278528295711954'] = {
        name: 'canvas-showcase',
        guildId: '686053708261228577',
        guildName: 'OMG',
        directory: 'canvas',
        lastExportedAt: null,
        lastMessageId: null,
        lastMessageTimestamp: null,
        lastThreadId: null,
        lastThreadName: null,
        threadCount: 0,
        messageCount: 0,
        threads: {}
    }
    return doc
}

describe('select/deselect', () => {
    test('round-trips and prunes empty guilds', () => {
        let doc = selectChannel(emptyDoc(), GUILD, CH, 'canvas')
        expect(doc.guilds[GUILD.id]!.channels[CH.id]!.directory).toBe('canvas')
        doc = deselectChannel(doc, GUILD.id, CH.id)
        expect(doc.guilds[GUILD.id]).toBeUndefined()
    })
    test('reselecting keeps the previously chosen directory', () => {
        let doc = selectChannel(emptyDoc(), GUILD, CH, 'custom-dir')
        doc = selectChannel(doc, GUILD, CH, 'other-dir')
        expect(doc.guilds[GUILD.id]!.channels[CH.id]!.directory).toBe('custom-dir')
    })
})

describe('directoryTaken', () => {
    test('detects a directory already used by another channel', () => {
        const doc = docWithState()
        expect(directoryTaken(doc, 'canvas', '999')).toBe(true)
        expect(directoryTaken(doc, 'canvas', '126278528295711954')).toBe(false)
        expect(directoryTaken(doc, 'other', '999')).toBe(false)
    })
})

describe('marks', () => {
    test('synced beats selected beats none', () => {
        const doc = selectChannel(
            docWithState(),
            GUILD,
            { id: '999999999999999999', name: 'x' },
            'x'
        )
        expect(channelMark(doc, GUILD.id, CH.id)).toBe('synced')
        expect(channelMark(doc, GUILD.id, '999999999999999999')).toBe('selected')
        expect(channelMark(doc, GUILD.id, '111111111111111111')).toBe('none')
        expect(guildMark(doc, GUILD.id)).toBe('synced')
        expect(guildMark(selectChannel(emptyDoc(), GUILD, CH, 'canvas'), GUILD.id)).toBe('selected')
        expect(guildMark(emptyDoc(), GUILD.id)).toBe('none')
    })
})
