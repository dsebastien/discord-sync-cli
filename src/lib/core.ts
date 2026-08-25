/** Core helpers: snowflake math, chunk planning, polite sleeping. */

export const DISCORD_EPOCH_MS = 1_420_070_400_000n // 2015-01-01T00:00:00Z

/** A Discord snowflake encodes its creation time in the upper 42 bits. */
export function snowflakeToDate(id: string): Date {
    const ms = (BigInt(id) >> 22n) + DISCORD_EPOCH_MS
    return new Date(Number(ms))
}

export function isSnowflake(s: string): boolean {
    return /^[0-9]{17,20}$/.test(s)
}

/** Deep link to a guild channel/thread, optionally down to one message. */
export function discordUrl(guildId: string, channelId: string, messageId?: string): string {
    const base = `https://discord.com/channels/${guildId}/${channelId}`
    return messageId ? `${base}/${messageId}` : base
}

export function isoDay(d: Date): string {
    return d.toISOString().slice(0, 10)
}

export interface Chunk {
    after: string // "YYYY-MM-DD 00:00"
    before: string
    label: string
}

/** Plan half-open [from, to) date windows of stepDays each. */
export function planChunks(fromDay: string, toDay: string, stepDays: number): Chunk[] {
    if (stepDays <= 0) throw new Error('stepDays must be positive')
    const from = new Date(`${fromDay}T00:00:00Z`)
    const to = new Date(`${toDay}T00:00:00Z`)
    if (Number.isNaN(+from) || Number.isNaN(+to)) throw new Error('invalid date')
    if (from >= to) throw new Error(`from (${fromDay}) must be earlier than to (${toDay})`)
    const chunks: Chunk[] = []
    let cursor = from
    while (cursor < to) {
        let next = new Date(cursor.getTime() + stepDays * 86_400_000)
        if (next > to) next = to
        chunks.push({
            after: `${isoDay(cursor)} 00:00`,
            before: `${isoDay(next)} 00:00`,
            label: `${isoDay(cursor)} -> ${isoDay(next)}`
        })
        cursor = next
    }
    return chunks
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function jittered(baseSeconds: number, jitterSeconds: number): number {
    return Math.round((baseSeconds + Math.random() * jitterSeconds) * 1000)
}

/**
 * Snowflakes exceed Number.MAX_SAFE_INTEGER, so order them as
 * [digit-count, string] instead of converting to numbers.
 */
export function compareSnowflakes(a: string | null, b: string | null): number {
    if (a === b) return 0
    if (a === null) return -1
    if (b === null) return 1
    if (a.length !== b.length) return a.length - b.length
    return a < b ? -1 : a > b ? 1 : 0
}
