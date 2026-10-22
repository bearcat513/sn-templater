import React, { useMemo, useState } from 'react'
import { FORMATTERS } from '../engine/tokens'
import { CONTEXT_TOKENS, LIST_TOKENS, type SchemaField } from '../engine/vocabulary'
import { useAsync } from '../hooks/useAsync'
import { SchemaService, type TableSchema } from '../services/schema'
import { Icon } from '../ui/icons'
import { Input, Spinner, cx } from '../ui/controls'
import { useToast } from '../ui/overlays'
import { useTokenTarget } from './TokenTarget'

/**
 * Every token a template on this table can use, searchable, and clickable.
 *
 * A reference field opens to show the fields of the record it points at, and
 * those open in turn — which is all dot-walking is: `record.caller_id.manager.email`.
 */
/** Tokens worth copying the shape of: dot-walking, stored values, and formatters. */
const EXAMPLES = [
    { token: 'record.caller_id.email', description: 'A field of a referenced record (dot-walking)' },
    { token: 'raw.state', description: 'The stored value, not the label' },
    { token: 'record.opened_at | date:"d MMM yyyy"', description: 'A date, formatted' },
    { token: 'record.assigned_to | default:"Unassigned"', description: 'Words for an empty field' },
    { token: 'record.short_description | truncate:60', description: 'Cut short with …' },
    { token: 'record.priority | upper', description: 'In capitals' },
    { token: 'record.business_duration | duration', description: 'A duration as 2d 4h' },
]

export function TokenPanel({ schema }: { schema: TableSchema }) {
    const [term, setTerm] = useState('')
    const target = useTokenTarget()
    const toast = useToast()

    const use = (token: string) => {
        const text = `{{${token}}}`
        if (target.insert(text)) return
        void navigator.clipboard?.writeText(text).then(
            () => toast(`Copied ${text} — click into a text box to insert tokens directly.`, 'info'),
            () => toast(`Click into a text box first, then choose ${text}.`, 'info')
        )
    }

    const needle = term.trim().toLowerCase()
    const context = CONTEXT_TOKENS.concat(LIST_TOKENS).filter(
        entry => !needle || entry.token.includes(needle) || entry.description.toLowerCase().includes(needle)
    )

    return (
        <div className="tp-tokens">
            <div className="tp-tokens__search">
                <Icon name="search" size={14} />
                <Input
                    value={term}
                    onChange={event => setTerm(event.target.value)}
                    placeholder="Search fields and tokens"
                    aria-label="Search tokens"
                />
            </div>
            <p className="tp-tokens__hint">Click a token to insert it where your cursor was.</p>

            <div className="tp-tokens__scroll">
                <h4 className="tp-tokens__group">{schema.label} fields</h4>
                <FieldTree fields={schema.fields} prefix="record." needle={needle} depth={0} onUse={use} />

                {context.length > 0 && <h4 className="tp-tokens__group">Document</h4>}
                <ul className="tp-tokens__list">
                    {context.map(entry => (
                        <li key={entry.token}>
                            <button type="button" className="tp-token" onClick={() => use(entry.token)}>
                                <span className="tp-token__label">{entry.description}</span>
                                <code className="tp-token__code">{entry.token}</code>
                            </button>
                        </li>
                    ))}
                </ul>
                <p className="tp-tokens__hint">
                    <code>record.</code> prints what people see; <code>raw.</code> prints the stored value — a sys_id, a
                    choice's value.
                </p>

                <details className="tp-tokens__examples">
                    <summary className="tp-tokens__group">Examples and formatters</summary>
                    <p className="tp-tokens__hint">
                        Add a formatter after a bar to change how a value prints. Click one to insert it.
                    </p>
                    <ul className="tp-tokens__list">
                        {EXAMPLES.map(example => (
                            <li key={example.token}>
                                <button type="button" className="tp-token" onClick={() => use(example.token)}>
                                    <span className="tp-token__label">{example.description}</span>
                                    <code className="tp-token__code">{example.token}</code>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <h5 className="tp-tokens__group">Every formatter</h5>
                    <ul className="tp-tokens__formatters">
                        {Object.entries(FORMATTERS).map(([name, formatter]) => (
                            <li key={name}>
                                <code>| {formatter.example}</code>{' '}
                                <span className="tp-subtle">{formatter.describe}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            </div>
        </div>
    )
}

function FieldTree({
    fields,
    prefix,
    needle,
    depth,
    onUse,
}: {
    fields: SchemaField[]
    prefix: string
    needle: string
    depth: number
    onUse: (token: string) => void
}) {
    const [open, setOpen] = useState<Record<string, boolean>>({})
    const shown = useMemo(
        () =>
            depth > 0 || !needle
                ? fields
                : fields.filter(
                      field => field.name.toLowerCase().includes(needle) || field.label.toLowerCase().includes(needle)
                  ),
        [fields, needle, depth]
    )

    if (!shown.length) return <p className="tp-tokens__empty">No fields match.</p>

    return (
        <ul className={cx('tp-tokens__list', depth > 0 && 'tp-tokens__list--nested')}>
            {shown.map(field => {
                const token = `${prefix}${field.name}`
                const expandable = Boolean(field.reference) && depth < 3
                return (
                    <li key={field.name}>
                        <div className="tp-token-row">
                            {expandable ? (
                                <button
                                    type="button"
                                    className="tp-token-row__toggle"
                                    aria-expanded={Boolean(open[field.name])}
                                    aria-label={`${open[field.name] ? 'Hide' : 'Show'} fields of ${field.label}`}
                                    onClick={() => setOpen(state => ({ ...state, [field.name]: !state[field.name] }))}
                                >
                                    <Icon
                                        name="chevronRight"
                                        size={12}
                                        className={cx('tp-token-row__chevron', open[field.name] && 'is-open')}
                                    />
                                </button>
                            ) : (
                                <span className="tp-token-row__spacer" />
                            )}
                            <button type="button" className="tp-token" onClick={() => onUse(token)}>
                                <span className="tp-token__label">{field.label}</span>
                                <code className="tp-token__code">{token}</code>
                            </button>
                        </div>
                        {expandable && open[field.name] && (
                            <ReferencedFields
                                table={field.reference!}
                                prefix={`${token}.`}
                                depth={depth + 1}
                                onUse={onUse}
                            />
                        )}
                    </li>
                )
            })}
        </ul>
    )
}

function ReferencedFields({
    table,
    prefix,
    depth,
    onUse,
}: {
    table: string
    prefix: string
    depth: number
    onUse: (token: string) => void
}) {
    const schema = useAsync(() => SchemaService.table(table), [table])
    if (schema.loading)
        return (
            <div className="tp-tokens__loading">
                <Spinner size={14} /> Loading {table}…
            </div>
        )
    if (schema.error || !schema.data) return <p className="tp-tokens__empty">{schema.error || 'Unavailable.'}</p>
    return <FieldTree fields={schema.data.fields} prefix={prefix} needle="" depth={depth} onUse={onUse} />
}
