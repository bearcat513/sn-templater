import React, { useState } from 'react'
import { cx } from '../ui/controls'

/** Children shown before a "show more" row: a 500-record job opens without stalling. */
const PAGE = 100
/** Characters of a string shown before it is cut; a base64 image is megabytes. */
const LONG_STRING = 240

/**
 * A collapsible view of any value, the way DevTools shows an object: closed
 * by default below the first level, and only the open parts rendered — so a
 * template full of images or a job with hundreds of records costs nothing
 * until someone opens it.
 */
export function JsonTree({ value, name, open = true }: { value: unknown; name?: string; open?: boolean }) {
    return (
        <div className="tp-dt-tree" role="tree">
            <Node value={value} name={name} depth={0} initiallyOpen={open} ancestors={[]} />
        </div>
    )
}

type NodeProps = {
    value: unknown
    name?: string
    depth: number
    initiallyOpen?: boolean
    /** The objects above this one: a value that contains itself is shown once, not forever. */
    ancestors: readonly object[]
}

function Node({ value, name, depth, initiallyOpen = false, ancestors }: NodeProps) {
    const [open, setOpen] = useState(initiallyOpen)
    const [shown, setShown] = useState(PAGE)

    const label = name !== undefined && <span className="tp-dt-tree__key">{name}: </span>

    if (value === null || typeof value !== 'object') {
        return (
            <div className="tp-dt-tree__row" role="treeitem" style={{ paddingLeft: indent(depth) }}>
                <span className="tp-dt-tree__spacer" />
                {label}
                <Primitive value={value} />
            </div>
        )
    }

    if (ancestors.includes(value)) {
        return (
            <div className="tp-dt-tree__row" role="treeitem" style={{ paddingLeft: indent(depth) }}>
                <span className="tp-dt-tree__spacer" />
                {label}
                <span className="tp-dt-tree__muted">[circular]</span>
            </div>
        )
    }

    const entries = entriesOf(value)
    const lineage = [...ancestors, value]

    return (
        <div role="treeitem" aria-expanded={open}>
            <button
                type="button"
                className="tp-dt-tree__row tp-dt-tree__toggle"
                style={{ paddingLeft: indent(depth) }}
                onClick={() => setOpen(!open)}
            >
                <span className={cx('tp-dt-tree__caret', open && 'is-open')} aria-hidden="true">
                    ▸
                </span>
                {label}
                <span className="tp-dt-tree__summary">{summarize(value, entries.length)}</span>
            </button>
            {open && (
                <div role="group">
                    {entries.slice(0, shown).map(([key, child]) => (
                        <Node key={key} name={key} value={child} depth={depth + 1} ancestors={lineage} />
                    ))}
                    {entries.length > shown && (
                        <button
                            type="button"
                            className="tp-dt-tree__row tp-dt-tree__more"
                            style={{ paddingLeft: indent(depth + 1) }}
                            onClick={() => setShown(shown + PAGE)}
                        >
                            Show {Math.min(PAGE, entries.length - shown)} more of {entries.length - shown}…
                        </button>
                    )}
                    {!entries.length && (
                        <div className="tp-dt-tree__row tp-dt-tree__muted" style={{ paddingLeft: indent(depth + 1) }}>
                            empty
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function Primitive({ value }: { value: unknown }) {
    const [full, setFull] = useState(false)
    if (typeof value === 'string') {
        if (value.length > LONG_STRING && !full) {
            return (
                <span className="tp-dt-tree__string">
                    "{value.slice(0, LONG_STRING)}
                    <button type="button" className="tp-dt-tree__expand" onClick={() => setFull(true)}>
                        … {value.length.toLocaleString()} chars
                    </button>
                    "
                </span>
            )
        }
        return <span className="tp-dt-tree__string">"{value}"</span>
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        return <span className="tp-dt-tree__number">{String(value)}</span>
    }
    if (typeof value === 'boolean') return <span className="tp-dt-tree__boolean">{String(value)}</span>
    if (typeof value === 'function') return <span className="tp-dt-tree__muted">ƒ {value.name || 'anonymous'}()</span>
    if (value === undefined) return <span className="tp-dt-tree__muted">undefined</span>
    return <span className="tp-dt-tree__muted">{String(value)}</span>
}

function entriesOf(value: object): [string, unknown][] {
    if (value instanceof Map) return [...value.entries()].map(([key, child]) => [String(key), child])
    if (value instanceof Set) return [...value.values()].map((child, index) => [String(index), child])
    if (ArrayBuffer.isView(value)) return []
    if (value instanceof Error) return [['name', value.name], ['message', value.message], ['stack', value.stack]]
    if (Array.isArray(value)) return value.map((child, index) => [String(index), child])
    return Object.entries(value)
}

function summarize(value: object, count: number): string {
    if (Array.isArray(value)) return `Array(${count})`
    if (ArrayBuffer.isView(value)) return `${value.constructor.name}(${value.byteLength} bytes)`
    if (value instanceof Map) return `Map(${count})`
    if (value instanceof Set) return `Set(${count})`
    if (value instanceof Error) return `${value.name}: ${value.message}`
    const keys = Object.keys(value)
    const preview = keys.slice(0, 4).join(', ')
    const name = value.constructor && value.constructor !== Object ? `${value.constructor.name} ` : ''
    return `${name}{${preview}${keys.length > 4 ? ', …' : ''}}`
}

const indent = (depth: number) => `${depth * 14 + 4}px`

/** A value on one line: what a log row shows before it is opened. */
export function preview(value: unknown, max = 120): string {
    if (value === undefined) return ''
    if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}…` : value
    try {
        const text = JSON.stringify(value, (_key, child) =>
            ArrayBuffer.isView(child) ? `‹${child.constructor.name}›` : child
        )
        if (text === undefined) return String(value)
        return text.length > max ? `${text.slice(0, max)}…` : text
    } catch {
        return Object.prototype.toString.call(value)
    }
}
