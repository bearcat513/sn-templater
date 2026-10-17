import React, { useMemo, useState } from 'react'
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
                    <code>record.</code> prints what people see; <code>raw.</code> prints the stored value — a
                    sys_id, a choice's value.
                </p>
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
