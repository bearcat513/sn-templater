import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { downloadBytes } from '../hooks/usePdf'
import { Icon } from '../ui/icons'
import { IconButton, cx } from '../ui/controls'
import { JsonTree, preview } from './JsonTree'
import { formatMs } from './log'
import {
    clearLogs,
    clearNetwork,
    debugStore,
    exportSnapshot,
    type Level,
    type LogEntry,
    type NetworkEntry,
} from './store'

type Tab = 'console' | 'network' | 'state'

const TABS: { value: Tab; label: string }[] = [
    { value: 'console', label: 'Console' },
    { value: 'network', label: 'Network' },
    { value: 'state', label: 'State' },
]

const LEVELS: Level[] = ['debug', 'info', 'warn', 'error']

const MIN_HEIGHT = 140
const DEFAULT_HEIGHT = 320

/* ------------------------------------------------------------- preferences */

type Prefs = { open: boolean; height: number; tab: Tab }

const PREFS_KEY = 'x_1040823_template.devtools'

function readPrefs(): Prefs {
    const fallback: Prefs = { open: false, height: DEFAULT_HEIGHT, tab: 'console' }
    try {
        const stored = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
        if (!stored) return fallback
        return {
            open: stored.open === true,
            height: typeof stored.height === 'number' ? stored.height : fallback.height,
            tab: TABS.some(tab => tab.value === stored.tab) ? stored.tab! : fallback.tab,
        }
    } catch {
        return fallback
    }
}

function writePrefs(prefs: Prefs) {
    try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
        // Storage blocked: the panel just forgets its place next time.
    }
}

/* ------------------------------------------------------------------- shell */

/**
 * Developer tools docked to the bottom of the page, shown only when the
 * x_1040823_template.debug property is true. Ctrl+` toggles it.
 */
export function DevTools() {
    const snapshot = useSyncExternalStore(debugStore.subscribe, debugStore.getSnapshot)
    const [prefs, setPrefs] = useState(readPrefs)
    const [seenErrors, setSeenErrors] = useState(0)

    const update = useCallback((patch: Partial<Prefs>) => {
        setPrefs(current => {
            const next = { ...current, ...patch }
            writePrefs(next)
            return next
        })
    }, [])

    const enabled = snapshot.state === 'on'
    const height = clampHeight(prefs.height)

    useEffect(() => {
        if (!enabled) return
        const onKey = (event: KeyboardEvent) => {
            if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === 'Backquote') {
                event.preventDefault()
                setPrefs(current => {
                    const next = { ...current, open: !current.open }
                    writePrefs(next)
                    return next
                })
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [enabled])

    // Make room at the bottom of the page, the way a docked DevTools shrinks the viewport.
    // Full-height layouts subtract --tp-devtools-inset (see tokens.css).
    useLayoutEffect(() => {
        if (!enabled || !prefs.open) return
        const root = document.documentElement
        root.classList.add('tp-has-devtools')
        root.style.setProperty('--tp-devtools-inset', `${height}px`)
        return () => {
            root.classList.remove('tp-has-devtools')
            root.style.removeProperty('--tp-devtools-inset')
        }
    }, [enabled, prefs.open, height])

    const errors = useMemo(
        () =>
            snapshot.logs.filter(entry => entry.level === 'error').length +
            snapshot.network.filter(entry => entry.state === 'failed').length,
        [snapshot.logs, snapshot.network]
    )

    useEffect(() => {
        if (prefs.open) setSeenErrors(errors)
    }, [prefs.open, errors])

    if (!enabled) return null

    if (!prefs.open) {
        const unseen = Math.max(0, errors - seenErrors)
        return (
            <button
                type="button"
                className={cx('tp-dt-launcher', unseen > 0 && 'has-errors')}
                onClick={() => update({ open: true })}
                title="Open developer tools (Ctrl+`)"
                aria-label={`Open developer tools${unseen ? `, ${unseen} new errors` : ''}`}
            >
                <Icon name="bug" size={16} />
                {unseen > 0 && <span className="tp-dt-launcher__count">{unseen > 99 ? '99+' : unseen}</span>}
            </button>
        )
    }

    return (
        <section className="tp-dt" style={{ height }} aria-label="Developer tools">
            <ResizeHandle height={height} onResize={next => update({ height: next })} />
            <header className="tp-dt__bar">
                <span className="tp-dt__title">
                    <Icon name="bug" size={14} /> Templater DevTools
                </span>
                <div className="tp-dt__tabs" role="tablist" aria-label="Developer tools">
                    {TABS.map(tab => (
                        <button
                            key={tab.value}
                            type="button"
                            role="tab"
                            aria-selected={prefs.tab === tab.value}
                            className={cx('tp-dt__tab', prefs.tab === tab.value && 'is-active')}
                            onClick={() => update({ tab: tab.value })}
                        >
                            {tab.label}
                            <TabCount tab={tab.value} logs={snapshot.logs} network={snapshot.network} />
                        </button>
                    ))}
                </div>
                <span className="tp-dt__spacer" />
                <IconButton
                    icon="download"
                    size="sm"
                    label="Export everything recorded as JSON"
                    onClick={() => {
                        const text = JSON.stringify(exportSnapshot(), jsonSafe, 2)
                        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
                        downloadBytes(new TextEncoder().encode(text), `templater-debug-${stamp}.json`, 'application/json')
                    }}
                />
                <IconButton icon="x" size="sm" label="Close developer tools (Ctrl+`)" onClick={() => update({ open: false })} />
            </header>
            <div className="tp-dt__body" role="tabpanel">
                {prefs.tab === 'console' && <ConsoleTab logs={snapshot.logs} />}
                {prefs.tab === 'network' && <NetworkTab entries={snapshot.network} />}
                {prefs.tab === 'state' && <StateTab inspected={snapshot.inspected} />}
            </div>
        </section>
    )
}

function TabCount({ tab, logs, network }: { tab: Tab; logs: LogEntry[]; network: NetworkEntry[] }) {
    if (tab === 'console') {
        const errors = logs.filter(entry => entry.level === 'error').length
        const warnings = logs.filter(entry => entry.level === 'warn').length
        return (
            <>
                {errors > 0 && <span className="tp-dt__pill tp-dt__pill--error">{errors}</span>}
                {warnings > 0 && <span className="tp-dt__pill tp-dt__pill--warn">{warnings}</span>}
            </>
        )
    }
    if (tab === 'network') {
        const failed = network.filter(entry => entry.state === 'failed').length
        return failed > 0 ? <span className="tp-dt__pill tp-dt__pill--error">{failed}</span> : null
    }
    return null
}

const clampHeight = (height: number) =>
    Math.round(Math.max(MIN_HEIGHT, Math.min(height, Math.max(MIN_HEIGHT, window.innerHeight - 80))))

function ResizeHandle({ height, onResize }: { height: number; onResize: (height: number) => void }) {
    const start = useRef<{ y: number; height: number } | null>(null)
    return (
        <div
            className="tp-dt__resize"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize developer tools"
            aria-valuenow={height}
            tabIndex={0}
            onKeyDown={event => {
                if (event.key === 'ArrowUp') onResize(clampHeight(height + 24))
                if (event.key === 'ArrowDown') onResize(clampHeight(height - 24))
            }}
            onPointerDown={event => {
                start.current = { y: event.clientY, height }
                event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={event => {
                if (!start.current) return
                onResize(clampHeight(start.current.height + (start.current.y - event.clientY)))
            }}
            onPointerUp={() => (start.current = null)}
            onPointerCancel={() => (start.current = null)}
        />
    )
}

/* ------------------------------------------------------------------ console */

function ConsoleTab({ logs }: { logs: LogEntry[] }) {
    const [filter, setFilter] = useState('')
    const [levels, setLevels] = useState<Record<Level, boolean>>({ debug: true, info: true, warn: true, error: true })
    const scroller = useRef<HTMLDivElement>(null)
    const pinned = useRef(true)

    const counts = useMemo(() => {
        const out: Record<Level, number> = { debug: 0, info: 0, warn: 0, error: 0 }
        for (const entry of logs) out[entry.level]++
        return out
    }, [logs])

    const shown = useMemo(() => {
        const term = filter.trim().toLowerCase()
        return logs.filter(
            entry =>
                levels[entry.level] &&
                (!term ||
                    entry.message.toLowerCase().includes(term) ||
                    entry.source.toLowerCase().includes(term) ||
                    preview(entry.data, 2000).toLowerCase().includes(term))
        )
    }, [logs, filter, levels])

    // Follow new lines while scrolled to the bottom, like a terminal; stay put otherwise.
    useLayoutEffect(() => {
        const element = scroller.current
        if (element && pinned.current) element.scrollTop = element.scrollHeight
    }, [shown])

    return (
        <div className="tp-dt-pane">
            <div className="tp-dt-toolbar">
                <IconButton icon="ban" size="sm" label="Clear console" onClick={clearLogs} />
                <FilterInput value={filter} onChange={setFilter} placeholder="Filter messages, sources, data" />
                <div className="tp-dt-levels" role="group" aria-label="Levels">
                    {LEVELS.map(level => (
                        <button
                            key={level}
                            type="button"
                            aria-pressed={levels[level]}
                            className={cx('tp-dt-level', `tp-dt-level--${level}`, levels[level] && 'is-on')}
                            onClick={() => setLevels({ ...levels, [level]: !levels[level] })}
                        >
                            {level} <span className="tp-dt-level__count">{counts[level]}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div
                ref={scroller}
                className="tp-dt-scroll"
                onScroll={event => {
                    const element = event.currentTarget
                    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
                }}
            >
                {shown.length ? (
                    shown.map(entry => <LogRow key={entry.id} entry={entry} />)
                ) : (
                    <p className="tp-dt-empty">{logs.length ? 'Nothing matches the filter.' : 'Nothing logged yet.'}</p>
                )}
            </div>
        </div>
    )
}

function LogRow({ entry }: { entry: LogEntry }) {
    const [open, setOpen] = useState(false)
    const hasData = entry.data !== undefined
    return (
        <div className={cx('tp-dt-log', `tp-dt-log--${entry.level}`)}>
            <button
                type="button"
                className="tp-dt-log__line"
                onClick={() => hasData && setOpen(!open)}
                aria-expanded={hasData ? open : undefined}
                disabled={!hasData}
            >
                <span className={cx('tp-dt-tree__caret', open && 'is-open', !hasData && 'is-hidden')} aria-hidden="true">
                    ▸
                </span>
                <span className="tp-dt-log__time" title={new Date(entry.time).toLocaleString()}>
                    {clock(entry.time)}
                </span>
                <span className="tp-dt-log__source">{entry.source}</span>
                <span className="tp-dt-log__message">
                    {entry.message}
                    {hasData && !open && <span className="tp-dt-log__preview"> {preview(entry.data)}</span>}
                </span>
            </button>
            {open && (
                <div className="tp-dt-log__data">
                    <JsonTree value={entry.data} />
                </div>
            )}
        </div>
    )
}

/* ------------------------------------------------------------------ network */

function NetworkTab({ entries }: { entries: NetworkEntry[] }) {
    const [filter, setFilter] = useState('')
    const [failedOnly, setFailedOnly] = useState(false)
    const [selected, setSelected] = useState<number | null>(null)

    const shown = useMemo(() => {
        const term = filter.trim().toLowerCase()
        return entries.filter(
            entry =>
                (!failedOnly || entry.state === 'failed') &&
                (!term || entry.url.toLowerCase().includes(term) || entry.method.toLowerCase().includes(term))
        )
    }, [entries, filter, failedOnly])

    const current = entries.find(entry => entry.id === selected) ?? null
    const totalBytes = shown.reduce((sum, entry) => sum + (entry.size ?? 0), 0)

    return (
        <div className="tp-dt-pane">
            <div className="tp-dt-toolbar">
                <IconButton
                    icon="ban"
                    size="sm"
                    label="Clear network log"
                    onClick={() => {
                        clearNetwork()
                        setSelected(null)
                    }}
                />
                <FilterInput value={filter} onChange={setFilter} placeholder="Filter URLs" />
                <label className="tp-dt-check">
                    <input type="checkbox" checked={failedOnly} onChange={event => setFailedOnly(event.target.checked)} />
                    Failed only
                </label>
                <span className="tp-dt-toolbar__meta">
                    {shown.length} requests · {formatBytes(totalBytes)}
                </span>
            </div>
            <div className={cx('tp-dt-split', current && 'has-detail')}>
                <div className="tp-dt-scroll">
                    <table className="tp-dt-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Method</th>
                                <th>Name</th>
                                <th className="is-num">Size</th>
                                <th className="is-num">Time</th>
                                <th className="is-num" title="Time spent on the server, from its Server-Timing header">
                                    Server
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map(entry => (
                                <tr
                                    key={entry.id}
                                    className={cx(
                                        entry.id === selected && 'is-selected',
                                        entry.state === 'failed' && 'is-failed',
                                        entry.state === 'pending' && 'is-pending'
                                    )}
                                    onClick={() => setSelected(entry.id === selected ? null : entry.id)}
                                >
                                    <td>{entry.state === 'pending' ? '…' : entry.status || entry.error || '—'}</td>
                                    <td>{entry.method}</td>
                                    <td className="tp-dt-table__name" title={entry.url}>
                                        {requestName(entry.url)}
                                    </td>
                                    <td className="is-num">{entry.size === undefined ? '' : formatBytes(entry.size)}</td>
                                    <td className="is-num">{entry.duration === undefined ? '' : formatMs(entry.duration)}</td>
                                    <td className="is-num">
                                        {entry.serverDuration === undefined ? '' : formatMs(entry.serverDuration)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!shown.length && (
                        <p className="tp-dt-empty">{entries.length ? 'Nothing matches the filter.' : 'No requests yet.'}</p>
                    )}
                </div>
                {current && <RequestDetail entry={current} onClose={() => setSelected(null)} />}
            </div>
        </div>
    )
}

function RequestDetail({ entry, onClose }: { entry: NetworkEntry; onClose: () => void }) {
    const [part, setPart] = useState<'headers' | 'request' | 'response'>('response')
    const url = new URL(entry.url, window.location.origin)
    const params = Object.fromEntries(url.searchParams.entries())

    return (
        <div className="tp-dt-detail">
            <div className="tp-dt-detail__bar">
                {(['headers', 'request', 'response'] as const).map(name => (
                    <button
                        key={name}
                        type="button"
                        className={cx('tp-dt__tab', part === name && 'is-active')}
                        onClick={() => setPart(name)}
                    >
                        {name === 'headers' ? 'Headers' : name === 'request' ? 'Payload' : 'Response'}
                    </button>
                ))}
                <span className="tp-dt__spacer" />
                <IconButton
                    icon="copy"
                    size="sm"
                    label="Copy URL"
                    onClick={() => void navigator.clipboard?.writeText(url.toString())}
                />
                {entry.method === 'GET' && (
                    <IconButton
                        icon="external"
                        size="sm"
                        label="Open in a new tab"
                        onClick={() => window.open(url.toString(), '_blank', 'noopener')}
                    />
                )}
                <IconButton icon="x" size="sm" label="Close details" onClick={onClose} />
            </div>
            <div className="tp-dt-scroll tp-dt-detail__body">
                {part === 'headers' && (
                    <>
                        <h4>General</h4>
                        <dl className="tp-dt-dl">
                            <dt>URL</dt>
                            <dd>{url.toString()}</dd>
                            <dt>Method</dt>
                            <dd>{entry.method}</dd>
                            <dt>Status</dt>
                            <dd>
                                {entry.status ? `${entry.status} ${entry.statusText}` : entry.state}
                                {entry.error && ` — ${entry.error}`}
                            </dd>
                            <dt>Started</dt>
                            <dd>{clock(entry.time)}</dd>
                            {entry.duration !== undefined && (
                                <>
                                    <dt>Duration</dt>
                                    <dd>
                                        {formatMs(entry.duration)}
                                        {entry.serverDuration !== undefined && ` (server ${formatMs(entry.serverDuration)})`}
                                    </dd>
                                </>
                            )}
                        </dl>
                        <h4>Response headers</h4>
                        <HeaderList headers={entry.responseHeaders} />
                        <h4>Request headers</h4>
                        <HeaderList headers={entry.requestHeaders} />
                    </>
                )}
                {part === 'request' && (
                    <>
                        {Object.keys(params).length > 0 && (
                            <>
                                <h4>Query string</h4>
                                <JsonTree value={params} />
                            </>
                        )}
                        <h4>Body</h4>
                        {entry.requestBody === undefined ? (
                            <p className="tp-dt-empty">No request body.</p>
                        ) : (
                            <JsonTree value={entry.requestBody} />
                        )}
                    </>
                )}
                {part === 'response' &&
                    (entry.state === 'pending' ? (
                        <p className="tp-dt-empty">Waiting for the response…</p>
                    ) : entry.responseBody === undefined ? (
                        <p className="tp-dt-empty">{entry.error ?? 'No response body.'}</p>
                    ) : typeof entry.responseBody === 'string' ? (
                        <pre className="tp-dt-pre">{entry.responseBody}</pre>
                    ) : (
                        <JsonTree value={entry.responseBody} />
                    ))}
            </div>
        </div>
    )
}

function HeaderList({ headers }: { headers: Record<string, string> }) {
    const entries = Object.entries(headers)
    if (!entries.length) return <p className="tp-dt-empty">None.</p>
    return (
        <dl className="tp-dt-dl">
            {entries.map(([name, value]) => (
                <React.Fragment key={name}>
                    <dt>{name}</dt>
                    <dd>{value}</dd>
                </React.Fragment>
            ))}
        </dl>
    )
}

/* -------------------------------------------------------------------- state */

const ENVIRONMENT = 'environment'

function StateTab({ inspected }: { inspected: Record<string, { value: unknown; updated: number }> }) {
    const names = useMemo(() => Object.keys(inspected).sort(), [inspected])
    const [selected, setSelected] = useState<string>(names[0] ?? ENVIRONMENT)
    const active = selected === ENVIRONMENT || selected in inspected ? selected : names[0] ?? ENVIRONMENT

    return (
        <div className="tp-dt-split has-detail tp-dt-split--state">
            <nav className="tp-dt-scroll tp-dt-keys" aria-label="Inspected values">
                {[...names, ENVIRONMENT].map(name => (
                    <button
                        key={name}
                        type="button"
                        className={cx('tp-dt-key', active === name && 'is-active')}
                        onClick={() => setSelected(name)}
                    >
                        {name}
                    </button>
                ))}
            </nav>
            <div className="tp-dt-scroll tp-dt-detail__body">
                {active === ENVIRONMENT ? (
                    <JsonTree value={environment()} />
                ) : (
                    <>
                        <p className="tp-dt-toolbar__meta">Updated {clock(inspected[active]!.updated)}</p>
                        <JsonTree key={active} value={inspected[active]!.value} />
                    </>
                )}
            </div>
        </div>
    )
}

function environment() {
    // Chromium only, and not in the DOM typings.
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
    return {
        url: window.location.href,
        inFrame: window.self !== window.top,
        viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
        language: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent,
        sessionToken: window.g_ck ? 'present' : 'missing',
        memory: memory
            ? { used: formatBytes(memory.usedJSHeapSize), limit: formatBytes(memory.jsHeapSizeLimit) }
            : 'not reported by this browser',
        uptime: formatMs(performance.now()),
    }
}

/* ------------------------------------------------------------------ helpers */

function FilterInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
    return (
        <label className="tp-dt-filter">
            <Icon name="filter" size={12} />
            <input
                type="search"
                value={value}
                placeholder={placeholder}
                aria-label={placeholder}
                onChange={event => onChange(event.target.value)}
            />
        </label>
    )
}

const clock = (time: number) => {
    const date = new Date(time)
    const pad = (n: number, width = 2) => String(n).padStart(width, '0')
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** The last path segment and the query, as DevTools names a request. */
function requestName(url: string): string {
    const parsed = new URL(url, window.location.origin)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const tail = segments.slice(-2).join('/')
    return `${tail}${parsed.search ? ` ${decodeURIComponent(parsed.search).slice(0, 80)}` : ''}`
}

/** Byte arrays become a note when exported; a PDF's bytes are no use in a bug report. */
const jsonSafe = (_key: string, value: unknown) =>
    ArrayBuffer.isView(value) ? `‹${value.constructor.name} ${value.byteLength} bytes›` : value
