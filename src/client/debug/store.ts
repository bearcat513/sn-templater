/**
 * The developer tools' memory: log lines, network calls and inspected state.
 *
 * It records from the moment the page loads, because the first requests go out
 * before anyone knows whether debugging is on — that answer comes back with
 * `/me`. Once it does, `setDebugEnabled(false)` empties everything and every
 * later call is a no-op, so a page with debugging off pays one boolean check.
 *
 * Subscribers are told about changes on a short timer rather than at once: a
 * log line written while React is rendering must not make the panel render
 * inside someone else's render.
 */

export type Level = 'debug' | 'info' | 'warn' | 'error'

export type LogEntry = {
    id: number
    /** Milliseconds since the page started, like DevTools' own timestamps. */
    at: number
    time: number
    level: Level
    /** Which part of the app said it: `http`, `loader`, `render`, `console`… */
    source: string
    message: string
    data?: unknown
    /** For a timing: how long the measured thing took. */
    duration?: number
}

export type NetworkEntry = {
    id: number
    at: number
    time: number
    method: string
    url: string
    requestHeaders: Record<string, string>
    requestBody?: unknown
    /** 0 until the response arrives; stays 0 when the request never got one. */
    status: number
    statusText: string
    responseHeaders: Record<string, string>
    responseBody?: unknown
    /** Bytes of response body, when it was read. */
    size?: number
    duration?: number
    /** The server's own timing, from a Server-Timing header. */
    serverDuration?: number
    error?: string
    state: 'pending' | 'done' | 'failed'
}

export type DebugState = 'pending' | 'on' | 'off'

export type DebugSnapshot = {
    state: DebugState
    logs: LogEntry[]
    network: NetworkEntry[]
    inspected: Record<string, { value: unknown; updated: number }>
}

const MAX_LOGS = 1000
const MAX_NETWORK = 300

let snapshot: DebugSnapshot = { state: 'pending', logs: [], network: [], inspected: {} }
let nextId = 1
const listeners = new Set<() => void>()
const stateListeners = new Set<(state: DebugState) => void>()
let flushTimer: number | undefined

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function changed(next: Partial<DebugSnapshot>) {
    snapshot = { ...snapshot, ...next }
    if (flushTimer !== undefined) return
    flushTimer = window.setTimeout(() => {
        flushTimer = undefined
        listeners.forEach(listener => listener())
    }, 50)
}

/** True while anything is worth recording: before `/me` answers, and after it says yes. */
export const isRecording = (): boolean => snapshot.state !== 'off'

export const isDebugOn = (): boolean => snapshot.state === 'on'

export const debugStore = {
    subscribe(listener: () => void) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
    },
    getSnapshot: (): DebugSnapshot => snapshot,
}

/** Called once the session says whether the debug property is on. */
export function setDebugEnabled(on: boolean) {
    const state: DebugState = on ? 'on' : 'off'
    if (snapshot.state === state) return
    changed(on ? { state } : { state, logs: [], network: [], inspected: {} })
    stateListeners.forEach(listener => listener(state))
}

export function onDebugStateChange(listener: (state: DebugState) => void) {
    stateListeners.add(listener)
    return () => void stateListeners.delete(listener)
}

export function addLog(entry: Omit<LogEntry, 'id' | 'at' | 'time'>) {
    if (!isRecording()) return
    const logs = snapshot.logs.length >= MAX_LOGS ? snapshot.logs.slice(-MAX_LOGS + 1) : snapshot.logs.slice()
    logs.push({ ...entry, id: nextId++, at: now(), time: Date.now() })
    changed({ logs })
}

export function clearLogs() {
    changed({ logs: [] })
}

/** Starts a network entry and returns its id, or 0 when nothing is recording. */
export function startRequest(entry: Pick<NetworkEntry, 'method' | 'url' | 'requestHeaders' | 'requestBody'>): number {
    if (!isRecording()) return 0
    const id = nextId++
    const network =
        snapshot.network.length >= MAX_NETWORK ? snapshot.network.slice(-MAX_NETWORK + 1) : snapshot.network.slice()
    network.push({
        ...entry,
        id,
        at: now(),
        time: Date.now(),
        status: 0,
        statusText: '',
        responseHeaders: {},
        state: 'pending',
    })
    changed({ network })
    return id
}

export function updateRequest(id: number, patch: Partial<NetworkEntry>) {
    if (!id || !isRecording()) return
    const index = snapshot.network.findIndex(entry => entry.id === id)
    if (index < 0) return
    const network = snapshot.network.slice()
    const current = network[index]!
    network[index] = {
        ...current,
        ...patch,
        ...(patch.state && patch.state !== 'pending' && current.duration === undefined
            ? { duration: now() - current.at }
            : {}),
    }
    changed({ network })
}

export function clearNetwork() {
    changed({ network: [] })
}

export function setInspected(name: string, value: unknown) {
    if (!isRecording()) return
    changed({ inspected: { ...snapshot.inspected, [name]: { value, updated: Date.now() } } })
}

export function removeInspected(name: string) {
    if (!(name in snapshot.inspected)) return
    const inspected = { ...snapshot.inspected }
    delete inspected[name]
    changed({ inspected })
}

/** Everything recorded, as one JSON-ready object, for attaching to a bug report. */
export function exportSnapshot() {
    return {
        exportedAt: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        logs: snapshot.logs,
        network: snapshot.network,
        state: Object.fromEntries(Object.entries(snapshot.inspected).map(([key, entry]) => [key, entry.value])),
    }
}
