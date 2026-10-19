import React, { useState } from 'react'
import { pickStarterFields, type ReferenceBlock } from '../engine/template'
import { useAsync } from '../hooks/useAsync'
import { SchemaService, type TableSchema } from '../services/schema'
import { Button, ColorField, Field, IconButton, Input, Segmented, Spinner, Switch } from '../ui/controls'
import { FieldPicker } from './FieldPicker'
import { TokenField } from './TokenTarget'

/**
 * Setting up a reference record: which reference field to follow, and which
 * fields of the record at the other end to show.
 *
 * Choosing the field reads the referenced table's schema and starts the card
 * on the fields people look for first — a user's email and phone, a group's
 * manager — so a new card is never empty.
 */
export function ReferenceFields({
    block,
    schema,
    onChange,
}: {
    block: ReferenceBlock
    schema: TableSchema
    onChange: (changes: Partial<ReferenceBlock>) => void
}) {
    const references = schema.fields.filter(field => field.reference)
    const target = useAsync(() => SchemaService.table(block.table), [block.table], Boolean(block.table))
    const [choosing, setChoosing] = useState(false)
    const [error, setError] = useState('')

    const choose = async (name: string) => {
        const field = references.find(entry => entry.name === name) ?? schema.fields.find(entry => entry.name === name)
        if (!field?.reference) {
            setError(`${name} is not a reference field on ${schema.label}.`)
            return
        }
        setError('')
        setChoosing(true)
        try {
            const referenced = await SchemaService.table(field.reference)
            const picked = pickStarterFields(referenced.fields, 4).filter(entry => entry.name !== 'sys_id')
            onChange({
                field: field.name,
                table: field.reference,
                title: block.title || `{{record.${field.name}}}`,
                rows: picked.map(entry => ({ label: entry.label, field: entry.name })),
            })
        } catch {
            onChange({ field: field.name, table: field.reference, rows: [] })
        } finally {
            setChoosing(false)
        }
    }

    const replace = (index: number, changes: Partial<ReferenceBlock['rows'][number]>) =>
        onChange({ rows: block.rows.map((row, at) => (at === index ? { ...row, ...changes } : row)) })

    return (
        <div className="tp-stack">
            <Field
                label="Reference field"
                hint={
                    block.table
                        ? `Shows a record from ${target.data?.label ?? block.table}.`
                        : 'A field on this record that points at another — a caller, a group, a CI.'
                }
            >
                <div className="tp-row">
                    <div className="tp-grow">
                        <FieldPicker
                            fields={references}
                            value={block.field}
                            placeholder="Choose a reference field…"
                            aria-label="Reference field"
                            onChange={field => void choose(field.name)}
                        />
                    </div>
                    {choosing && <Spinner size={14} label="Reading the referenced table" />}
                </div>
            </Field>
            {error && <p className="tp-subtle tp-field-error">{error}</p>}

            {block.field && (
                <>
                    <Field label="Title" hint="Empty leaves the card without one.">
                        <TokenField value={block.title ?? ''} onChange={title => onChange({ title: title || undefined })} />
                    </Field>

                    <div className="tp-pairs">
                        {block.rows.map((row, index) => (
                            <div key={index} className="tp-pairs__row">
                                <Input
                                    value={row.label}
                                    placeholder="Label"
                                    aria-label={`Row ${index + 1} label`}
                                    onChange={event => replace(index, { label: event.target.value })}
                                />
                                {target.data ? (
                                    <FieldPicker
                                        fields={target.data.fields}
                                        value={row.field}
                                        aria-label={`Row ${index + 1} field`}
                                        onChange={field => replace(index, { field: field.name, label: row.label || field.label })}
                                    />
                                ) : (
                                    <Input
                                        value={row.field}
                                        className="tp-mono"
                                        aria-label={`Row ${index + 1} field`}
                                        onChange={event => replace(index, { field: event.target.value.trim() })}
                                    />
                                )}
                                <IconButton
                                    icon="trash"
                                    label={`Remove row ${index + 1}`}
                                    size="sm"
                                    tone="danger"
                                    onClick={() => onChange({ rows: block.rows.filter((_, at) => at !== index) })}
                                />
                            </div>
                        ))}
                    </div>

                    {block.rows.length < 16 && (
                        <div className="tp-row tp-row--wrap">
                            {target.data ? (
                                <div className="tp-grow" style={{ maxWidth: '20rem' }}>
                                    <FieldPicker
                                        fields={target.data.fields}
                                        value=""
                                        placeholder={`Add a field of ${target.data.label}…`}
                                        aria-label="Add a field"
                                        onChange={field => onChange({ rows: [...block.rows, { label: field.label, field: field.name }] })}
                                    />
                                </div>
                            ) : target.loading ? (
                                <span className="tp-row tp-subtle">
                                    <Spinner size={14} /> Reading {block.table}…
                                </span>
                            ) : (
                                <Button size="sm" icon="plus" onClick={() => onChange({ rows: [...block.rows, { label: '', field: '' }] })}>
                                    Row
                                </Button>
                            )}
                        </div>
                    )}

                    <div className="tp-row tp-row--wrap" style={{ gap: 'var(--tp-space-4)' }}>
                        <Segmented<'card' | 'plain'>
                            label="Layout"
                            size="sm"
                            value={block.layout === 'plain' ? 'plain' : 'card'}
                            onChange={layout => onChange({ layout })}
                            options={[
                                { value: 'card', label: 'Card' },
                                { value: 'plain', label: 'Plain' },
                            ]}
                        />
                        <Switch
                            checked={block.link === true}
                            onChange={link => onChange({ link: link || undefined })}
                            label="Title links to the record"
                        />
                    </div>
                    <div className="tp-grid tp-grid--2">
                        <Field label="When empty" hint="Printed when the field has no record. Empty prints nothing.">
                            <TokenField value={block.emptyText ?? ''} onChange={emptyText => onChange({ emptyText: emptyText || undefined })} />
                        </Field>
                        <ColorField label="Accent" allowEmpty value={block.color ?? ''} onChange={color => onChange({ color: color || undefined })} />
                    </div>
                </>
            )}
        </div>
    )
}
