import React, { useCallback, useEffect, useState } from 'react'
import { MAX_RECORDS } from '../data/loader'
import { TEMPLATE_KIND_LABELS, type TemplateKind } from '../engine/template'
import { RecordPicker } from '../designer/RecordPicker'
import { useDebounced } from '../hooks/useDebounced'
import { RecordService } from '../services/records'
import { SchemaService, type TableSchema } from '../services/schema'
import type { TemplateRecord } from '../services/templates'
import { Combobox, type ComboOption } from '../ui/Combobox'
import { Icon, type IconName } from '../ui/icons'
import { Field, Input, NumberInput, Segmented, Spinner, Textarea, cx } from '../ui/controls'

/** Each kind of template's icon, wherever templates are listed. */
export const KIND_ICONS: Record<TemplateKind, IconName> = { document: 'file', deck: 'slides', chart: 'chart' }

/** Choosing a table by name or label, among the ones the viewer can read. */
export function TablePicker({
    value,
    label,
    onChange,
    id,
}: {
    value: string
    label?: string
    onChange: (table: string, label: string) => void
    id?: string
}) {
    const search = useCallback(async (term: string): Promise<ComboOption[]> => {
        const tables = await SchemaService.tables(term)
        return tables.map(table => ({ value: table.name, label: table.label, detail: table.name }))
    }, [])
    return (
        <Combobox
            id={id}
            value={value}
            selectedLabel={label ? `${label} (${value})` : value}
            search={search}
            allowCustom
            placeholder="Search tables — incident, change_request…"
            aria-label="Table"
            onChange={option => onChange(option.value, option.label)}
        />
    )
}

/** Templates as a list of choices, one of which is picked. */
export function TemplateChooser({
    templates,
    value,
    onChange,
    empty,
}: {
    templates: TemplateRecord[]
    value: string
    onChange: (template: TemplateRecord) => void
    empty: React.ReactNode
}) {
    if (!templates.length) return <div className="tp-subtle">{empty}</div>
    return (
        <div className="tp-choices" role="radiogroup" aria-label="Template">
            {templates.map(template => (
                <button
                    key={template.sysId}
                    type="button"
                    role="radio"
                    aria-checked={template.sysId === value}
                    className={cx('tp-choice', template.sysId === value && 'is-selected')}
                    onClick={() => onChange(template)}
                >
                    <span className={cx('tp-choice__icon', `tp-kind--${template.kind}`)}>
                        <Icon name={KIND_ICONS[template.kind]} />
                    </span>
                    <span className="tp-choice__text">
                        <span className="tp-choice__name">{template.name}</span>
                        <span className="tp-choice__meta">
                            {TEMPLATE_KIND_LABELS[template.kind]} · {template.tableLabel || template.table}
                        </span>
                    </span>
                    {template.sysId === value && <Icon name="check" className="tp-choice__check" />}
                </button>
            ))}
        </div>
    )
}

export type Selection = {
    mode: 'one' | 'many'
    sysId: string
    query: string
    orderBy: string
    limit: number
}

/** Which records to draw: one picked by hand, or every record a filter matches. */
export function SelectionForm({
    schema,
    selection,
    onChange,
    allowOne = true,
}: {
    schema: TableSchema
    selection: Selection
    onChange: (next: Selection) => void
    allowOne?: boolean
}) {
    const patch = (changes: Partial<Selection>) => onChange({ ...selection, ...changes })
    const query = useDebounced(selection.query, 500)
    const [count, setCount] = useState<{ value: number | null; loading: boolean; error: string }>({
        value: null,
        loading: false,
        error: '',
    })

    useEffect(() => {
        if (selection.mode !== 'many') return
        let live = true
        setCount(current => ({ ...current, loading: true, error: '' }))
        RecordService.count(schema.name, query)
            .then(value => live && setCount({ value, loading: false, error: '' }))
            .catch(failure => live && setCount({ value: null, loading: false, error: failure.message }))
        return () => {
            live = false
        }
    }, [schema.name, query, selection.mode])

    const descending = selection.orderBy.startsWith('-')

    return (
        <div className="tp-stack">
            {allowOne && (
                <Segmented<'one' | 'many'>
                    label="Records"
                    value={selection.mode}
                    onChange={mode => patch({ mode })}
                    options={[
                        { value: 'one', label: 'One record' },
                        { value: 'many', label: 'Records matching a filter' },
                    ]}
                />
            )}

            {selection.mode === 'one' ? (
                <Field label={`${schema.label} record`}>
                    <RecordPicker schema={schema} value={selection.sysId} onChange={sysId => patch({ sysId })} />
                </Field>
            ) : (
                <>
                    <Field
                        label="Filter"
                        hint={
                            <>
                                An encoded query. Build one in the{' '}
                                <a href={`/${schema.name}_list.do`} target="_blank" rel="noreferrer">
                                    {schema.label} list
                                </a>{' '}
                                and use “Copy query”. Empty means every record.
                            </>
                        }
                    >
                        <Textarea
                            className="tp-mono"
                            rows={2}
                            value={selection.query}
                            onChange={event => patch({ query: event.target.value })}
                            placeholder="active=true^priority<=2"
                            spellCheck={false}
                        />
                    </Field>
                    <div className="tp-grid tp-grid--3">
                        <Field label="Sort by (field)">
                            <Input
                                className="tp-mono"
                                value={selection.orderBy.replace(/^-/, '')}
                                placeholder="sys_updated_on"
                                onChange={event =>
                                    patch({
                                        orderBy: `${descending && event.target.value ? '-' : ''}${event.target.value.trim()}`,
                                    })
                                }
                            />
                        </Field>
                        <Field label="Direction">
                            <Segmented<'asc' | 'desc'>
                                label="Sort direction"
                                size="sm"
                                value={descending ? 'desc' : 'asc'}
                                onChange={direction => {
                                    const field = selection.orderBy.replace(/^-/, '')
                                    patch({ orderBy: field ? `${direction === 'desc' ? '-' : ''}${field}` : '' })
                                }}
                                options={[
                                    { value: 'asc', label: 'Ascending' },
                                    { value: 'desc', label: 'Descending' },
                                ]}
                            />
                        </Field>
                        <Field label="At most">
                            <NumberInput
                                min={1}
                                max={MAX_RECORDS}
                                value={selection.limit}
                                onChange={limit => patch({ limit: Math.min(MAX_RECORDS, Math.max(1, limit ?? 1)) })}
                                aria-label="Record limit"
                            />
                        </Field>
                    </div>
                    <p className="tp-subtle tp-row">
                        {count.loading ? (
                            <>
                                <Spinner size={12} /> Counting…
                            </>
                        ) : count.error ? (
                            <span style={{ color: 'var(--tp-critical)' }}>{count.error}</span>
                        ) : count.value !== null ? (
                            `${count.value.toLocaleString()} record${count.value === 1 ? '' : 's'} match${
                                count.value > selection.limit ? ` — the first ${selection.limit} will be used` : ''
                            }.`
                        ) : null}
                    </p>
                </>
            )}
        </div>
    )
}

/** A step heading: number, title, and what it is for. */
export function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
    return (
        <section className="tp-step">
            <header className="tp-step__header">
                <span className="tp-step__number">{number}</span>
                <h2>{title}</h2>
            </header>
            <div className="tp-step__body">{children}</div>
        </section>
    )
}

/** The line a restored local copy adds when it had no room for the pictures added since the last save. */
export const droppedNote = (dropped: number | undefined): string[] =>
    dropped
        ? [
              `${dropped} picture${dropped === 1 ? '' : 's'} added since the last save could not be kept in this browser, and ${
                  dropped === 1 ? 'is' : 'are'
              } left out.`,
          ]
        : []
