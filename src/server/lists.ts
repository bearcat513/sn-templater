/**
 * A list the platform hands back, as an array. Scoped code gets a JavaScript
 * array from some APIs and a Java list or array from others, and the typings
 * do not say which — so anything iterated or mapped goes through here.
 */
export function listOf(value: unknown): unknown[] {
    if (!value) return []
    if (Array.isArray(value)) return value
    const list = value as { size?: () => number; get?: (index: number) => unknown; length?: number }
    const items: unknown[] = []
    if (typeof list.size === 'function' && typeof list.get === 'function') {
        for (let i = 0; i < list.size(); i++) items.push(list.get(i))
    } else if (typeof list.length === 'number') {
        const indexed = value as { [index: number]: unknown }
        for (let i = 0; i < list.length; i++) items.push(indexed[i])
    }
    return items
}

/** The same, each item as a string. */
export const stringsOf = (value: unknown): string[] => listOf(value).map(String)
