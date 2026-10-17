import { useEffect } from 'react'
import {
    addLog,
    clearLogs,
    clearNetwork,
    debugStore,
    exportSnapshot,
    isRecording,
    onDebugStateChange,
    removeInspected,
    setInspected,
    type Level,
} from './store'

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** The browser's own console, before `captureConsole` wrapped it. */
const nativeConsole = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
}

function write(level: Level, source: string, message: string, data?: unknown, duration?: number) {
    if (!isRecording()) return
    addLog({ level, source, message, data, duration })
}

/**
 * The app's logger. Lines go to the developer tools' console, and nowhere at
 * all when the debug property is off.
 *
 * ```ts
 * log.info('loader', 'Read 12 records', { query })
 * const done = log.time('render', 'Drew the PDF')
 * …
 * done({ pages: 4 })
 * ```
 */
export const log = {
    debug: (source: string, message: string, data?: unknown) => write('debug', source, message, data),
    info: (source: string, message: string, data?: unknown) => write('info', source, message, data),
    warn: (source: string, message: string, data?: unknown) => write('warn', source, message, data),
    error: (source: string, message: string, data?: unknown) => write('error', source, message, data),

    /** Starts a stopwatch; calling what it returns logs how long it ran. */
    time(source: string, message: string): (data?: unknown) => number {
        const started = now()
        return (data?: unknown) => {
            const duration = now() - started
            write('debug', source, `${message} (${formatMs(duration)})`, data, duration)
            return duration
        }
    },
}

export const formatMs = (ms: number): string => (ms < 1 ? `${ms.toFixed(2)}ms` : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`)

/** A thrown value as something the console can show. */
export function describeError(failure: unknown): { message: string; data?: unknown } {
    if (failure instanceof Error) {
        return { message: failure.message || failure.name, data: { name: failure.name, stack: failure.stack } }
    }
    return { message: typeof failure === 'string' ? failure : 'Non-Error thrown', data: failure }
}

/* ------------------------------------------------------------ global capture */

let installed = false

/**
 * Copies `console.*` calls, uncaught errors and unhandled rejections into the
 * developer tools, and puts a handle on `window.templater` for poking at the
 * page from the browser's own DevTools. Everything is undone if `/me` says
 * debugging is off.
 */
export function installDebugCapture() {
    if (installed) return
    installed = true

    const wrap = (method: keyof typeof nativeConsole, level: Level) => {
        console[method] = (...args: unknown[]) => {
            nativeConsole[method](...args)
            if (!isRecording()) return
            const [first, ...rest] = args
            const message = typeof first === 'string' ? first : first instanceof Error ? first.message : safeString(first)
            const data = first instanceof Error ? [first, ...rest] : rest
            write(level, 'console', message, data.length ? (data.length === 1 ? data[0] : data) : undefined)
        }
    }
    wrap('debug', 'debug')
    wrap('log', 'info')
    wrap('info', 'info')
    wrap('warn', 'warn')
    wrap('error', 'error')

    const onError = (event: ErrorEvent) => {
        const where = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined
        write('error', 'uncaught', event.message || 'Uncaught error', {
            where,
            stack: event.error instanceof Error ? event.error.stack : undefined,
        })
    }
    const onRejection = (event: PromiseRejectionEvent) => {
        const { message, data } = describeError(event.reason)
        write('error', 'unhandled', `Unhandled rejection: ${message}`, data)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    const handle = {
        log,
        snapshot: () => debugStore.getSnapshot(),
        export: exportSnapshot,
        clear: () => {
            clearLogs()
            clearNetwork()
        },
    }

    onDebugStateChange(state => {
        if (state === 'on') {
            ;(window as unknown as { templater?: typeof handle }).templater = handle
            return
        }
        // Debugging is off: give the page back exactly as it was.
        Object.assign(console, nativeConsole)
        window.removeEventListener('error', onError)
        window.removeEventListener('unhandledrejection', onRejection)
        delete (window as unknown as { templater?: typeof handle }).templater
    })
}

function safeString(value: unknown): string {
    try {
        return typeof value === 'object' ? JSON.stringify(value)?.slice(0, 200) ?? String(value) : String(value)
    } catch {
        return String(value)
    }
}

/* ------------------------------------------------------------------ inspect */

/**
 * Shows a value in the developer tools' State tab under `name`, kept up to
 * date while the component is mounted. Free when debugging is off.
 */
export function useInspect(name: string, value: unknown) {
    useEffect(() => {
        if (isRecording()) setInspected(name, value)
    }, [name, value])
    useEffect(() => () => removeInspected(name), [name])
}
