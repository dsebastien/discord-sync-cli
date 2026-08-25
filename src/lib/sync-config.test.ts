import { describe, expect, test } from 'bun:test'
import {
    channelMark,
    deselectChannel,
    emptyConfig,
    guildMark,
    selectChannel,
    SyncConfigSchema
} from './sync-config'
import type { ExportsState } from './types'

const GUILD = { id: '68605370826122857', name: 'OMG' }
const CH = { id: '12627852829571195', name: 'canvas-showcase' }

const STATE: ExportsState = {
    version: 1,
    channels: {
        '12627852829571195': {
            name: 'canvas-showcase',
            guildId: '68605370826122857',
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
    }
}

describe('select/deselect', () => {
    test('round-trips and prunes empty guilds', () => {
        let cfg = selectChannel(emptyConfig(), GUILD, CH, 'canvas')
        expect(cfg.guilds[GUILD.id]!.channels[CH.id]!.directory).toBe('canvas')
        expect(SyncConfigSchema.safeParse(cfg).success).toBe(true)
        cfg = deselectChannel(cfg, GUILD.id, CH.id)
        expect(cfg.guilds[GUILD.id]).toBeUndefined()
    })
    test('reselecting keeps the previously chosen directory', () => {
        let cfg = selectChannel(emptyConfig(), GUILD, CH, 'custom-dir')
        cfg = selectChannel(cfg, GUILD, CH, 'other-dir')
        expect(cfg.guilds[GUILD.id]!.channels[CH.id]!.directory).toBe('custom-dir')
    })
})

describe('marks', () => {
    test('synced beats selected beats none', () => {
        const cfg = selectChannel(emptyConfig(), GUILD, { id: '99999999999999999', name: 'x' }, 'x')
        expect(channelMark(STATE, cfg, GUILD.id, CH.id)).toBe('synced')
        expect(channelMark(STATE, cfg, GUILD.id, '99999999999999999')).toBe('selected')
        expect(channelMark(STATE, cfg, GUILD.id, '11111111111111111')).toBe('none')
        expect(guildMark(STATE, cfg, GUILD.id)).toBe('synced')
        expect(guildMark({ version: 1, channels: {} }, cfg, GUILD.id)).toBe('selected')
        expect(guildMark({ version: 1, channels: {} }, emptyConfig(), GUILD.id)).toBe('none')
    })
})
