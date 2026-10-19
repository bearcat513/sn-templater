/**
 * Puts right what the platform's page scripts change underneath us.
 *
 * ServiceNow pages load Prototype.js, which replaces `Array.from` with its
 * `$A`: it ignores the mapping function, so `Array.from({ length: 5 }, fn)`
 * is five `undefined`s, and it reads only array-likes, so a Set or Map comes
 * back empty. This app and d3 both rely on the standard behaviour, so it is
 * restored, before anything else runs, wherever it has been replaced. An
 * object of Prototype's own that offers `toArray` is still read through it.
 */

type MapFn = (value: unknown, index: number) => unknown

const replaced = (() => {
    try {
        return Array.from({ length: 1 }, () => 1)[0] !== 1 || Array.from(new Set([1])).length !== 1
    } catch {
        return true
    }
})()

if (replaced) {
    const standardFrom = function from(items: unknown, map?: MapFn, thisArg?: unknown): unknown[] {
        if (items == null) throw new TypeError('Array.from requires an array-like or iterable object')
        const source = Object(items) as { [Symbol.iterator]?: unknown; toArray?: () => unknown[]; length?: number }
        let values: unknown[]
        if (typeof source[Symbol.iterator] === 'function') {
            values = []
            for (const value of source as Iterable<unknown>) values.push(value)
        } else if (typeof source.toArray === 'function') {
            values = source.toArray()
        } else {
            const length = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(Number(source.length)) || 0))
            values = new Array<unknown>(length)
            for (let index = 0; index < length; index++) values[index] = (source as Record<number, unknown>)[index]
        }
        // A plain loop: Prototype replaces `map` as well.
        if (map) for (let index = 0; index < values.length; index++) values[index] = map.call(thisArg, values[index], index)
        return values
    }
    Object.defineProperty(Array, 'from', { value: standardFrom, writable: true, configurable: true })
}

export {}
