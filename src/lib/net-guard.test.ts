import { describe, expect, test } from 'bun:test'
import { blockReason, isPrivateIp } from './net-guard'

describe('isPrivateIp', () => {
    test('flags loopback, private, link-local, metadata', () => {
        for (const ip of [
            '127.0.0.1',
            '10.0.0.5',
            '192.168.1.1',
            '172.16.0.1',
            '169.254.169.254',
            '::1',
            'fe80::1',
            'fd00::1'
        ]) {
            expect(isPrivateIp(ip)).toBe(true)
        }
    })
    test('allows public addresses', () => {
        for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) {
            expect(isPrivateIp(ip)).toBe(false)
        }
    })
})

describe('blockReason', () => {
    const publicResolver = async () => ['93.184.216.34']
    const privateResolver = async () => ['127.0.0.1']

    test('blocks non-http(s) schemes', async () => {
        expect(await blockReason('javascript:alert(1)', publicResolver)).toBeTruthy()
        expect(await blockReason('file:///etc/passwd', publicResolver)).toBeTruthy()
    })
    test('blocks literal private hosts without resolving', async () => {
        expect(await blockReason('http://127.0.0.1/x', publicResolver)).toBeTruthy()
        expect(
            await blockReason('http://169.254.169.254/latest/meta-data', publicResolver)
        ).toBeTruthy()
        expect(await blockReason('http://localhost/x', publicResolver)).toBeTruthy()
    })
    test('blocks a public host that resolves to a private address', async () => {
        expect(await blockReason('https://evil.test/x', privateResolver)).toBeTruthy()
    })
    test('allows a public host resolving to a public address', async () => {
        expect(await blockReason('https://example.test/a.png', publicResolver)).toBeNull()
    })
})
