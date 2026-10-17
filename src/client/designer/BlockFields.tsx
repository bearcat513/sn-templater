import React from 'react'
import type { BlockAlign, PdfBlock } from '../engine/template'
import type { TableSchema } from '../services/schema'
import { Button, ColorField, Field, IconButton, Input, NumberInput, Segmented, Switch } from '../ui/controls'
import { FieldPicker } from './FieldPicker'
import { ImagePicker } from './ImagePicker'
import { RelatedListFields } from './RelatedListFields'
import { TokenField } from './TokenTarget'

type Props = {
    block: PdfBlock
    schema: TableSchema
    onChange: (changes: Record<string, unknown>) => void
}

function AlignControl({ value, onChange }: { value: BlockAlign | undefined; onChange: (align: BlockAlign | undefined) => void }) {
    return (
        <Segmented<BlockAlign>
            label="Alignment"
            size="sm"
            value={value ?? 'left'}
            onChange={align => onChange(align === 'left' ? undefined : align)}
            options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Centre' },
                { value: 'right', label: 'Right' },
            ]}
        />
    )
}

/** The fields that edit one block, by type. */
export function BlockFields({ block, schema, onChange }: Props) {
    switch (block.type) {
        case 'heading':
        case 'text':
            return (
                <div className="tp-stack">
                    <Field label="Text" hint="Tokens are filled in for each record.">
                        <TokenField
                            multiline
                            rows={block.type === 'heading' ? 2 : 4}
                            value={block.text}
                            onChange={text => onChange({ text })}
                        />
                    </Field>
                    <div className="tp-grid tp-grid--3">
                        <Field label="Size (pt)">
                            <NumberInput
                                min={5}
                                max={96}
                                step={0.5}
                                value={block.size}
                                placeholder="auto"
                                onChange={size => onChange({ size })}
                                aria-label="Text size"
                            />
                        </Field>
                        <ColorField
                            label="Colour"
                            value={block.color ?? ''}
                            onChange={color => onChange({ color: color || undefined })}
                            allowEmpty
                        />
                        <Field label="Space after (pt)">
                            <NumberInput
                                min={0}
                                max={200}
                                value={block.spaceAfter}
                                placeholder="auto"
                                onChange={spaceAfter => onChange({ spaceAfter })}
                                aria-label="Space after"
                            />
                        </Field>
                    </div>
                    <div className="tp-row tp-row--wrap" style={{ gap: 'var(--tp-space-4)' }}>
                        <AlignControl value={block.align} onChange={align => onChange({ align })} />
                        {block.type === 'text' && (
                            <>
                                <Switch checked={block.bold ?? false} onChange={bold => onChange({ bold: bold || undefined })} label="Bold" />
                                <Switch
                                    checked={block.italic ?? false}
                                    onChange={italic => onChange({ italic: italic || undefined })}
                                    label="Italic"
                                />
                            </>
                        )}
                    </div>
                </div>
            )

        case 'image':
            return (
                <div className="tp-stack">
                    <ImagePicker
                        value={block.source}
                        onChange={source => onChange({ source })}
                        hint="Transparency is flattened onto white, because that is what the page is."
                    />
                    <div className="tp-grid tp-grid--2">
                        <Field label="Width (pt)" hint="72pt is an inch. The height follows.">
                            <NumberInput min={8} max={900} value={block.width} onChange={width => onChange({ width: width ?? 140 })} aria-label="Image width" />
                        </Field>
                        <Field label="Caption">
                            <TokenField value={block.caption ?? ''} onChange={caption => onChange({ caption: caption || undefined })} />
                        </Field>
                    </div>
                    <AlignControl value={block.align} onChange={align => onChange({ align })} />
                </div>
            )

        case 'spacer':
            return (
                <Field label="Height (pt)">
                    <NumberInput min={0} max={400} value={block.height} onChange={height => onChange({ height: height ?? 0 })} aria-label="Spacer height" />
                </Field>
            )

        case 'divider':
            return (
                <div className="tp-grid tp-grid--2">
                    <ColorField label="Colour" value={block.color ?? ''} onChange={color => onChange({ color: color || undefined })} allowEmpty />
                    <Field label="Thickness (pt)">
                        <NumberInput
                            min={0.1}
                            max={8}
                            step={0.25}
                            value={block.thickness ?? 0.75}
                            onChange={thickness => onChange({ thickness })}
                            aria-label="Divider thickness"
                        />
                    </Field>
                </div>
            )

        case 'columns': {
            const replace = (index: number, changes: Record<string, unknown>) =>
                onChange({ columns: block.columns.map((column, at) => (at === index ? { ...column, ...changes } : column)) })
            return (
                <div className="tp-stack">
                    {block.columns.map((column, index) => (
                        <div key={index} className="tp-subcard">
                            <div className="tp-row">
                                <Field label={`Column ${index + 1} heading`} className="tp-grow">
                                    <TokenField
                                        value={column.heading ?? ''}
                                        onChange={heading => replace(index, { heading: heading || undefined })}
                                    />
                                </Field>
                                <IconButton
                                    icon="trash"
                                    label={`Remove column ${index + 1}`}
                                    size="sm"
                                    tone="danger"
                                    onClick={() => onChange({ columns: block.columns.filter((_, at) => at !== index) })}
                                />
                            </div>
                            <Field label="Text">
                                <TokenField multiline rows={3} value={column.text} onChange={text => replace(index, { text })} />
                            </Field>
                            <AlignControl value={column.align} onChange={align => replace(index, { align })} />
                        </div>
                    ))}
                    {block.columns.length < 4 && (
                        <div>
                            <Button size="sm" icon="plus" onClick={() => onChange({ columns: [...block.columns, { text: '' }] })}>
                                Column
                            </Button>
                        </div>
                    )}
                </div>
            )
        }

        case 'fields': {
            const replace = (index: number, changes: Record<string, unknown>) =>
                onChange({ rows: block.rows.map((row, at) => (at === index ? { ...row, ...changes } : row)) })
            return (
                <div className="tp-stack">
                    <div className="tp-pairs">
                        {block.rows.map((row, index) => (
                            <div key={index} className="tp-pairs__row">
                                <TokenField value={row.label} onChange={label => replace(index, { label })} aria-label={`Row ${index + 1} label`} />
                                <TokenField value={row.value} onChange={value => replace(index, { value })} aria-label={`Row ${index + 1} value`} />
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
                    <div className="tp-row tp-row--wrap">
                        <div className="tp-grow" style={{ maxWidth: '20rem' }}>
                            <FieldPicker
                                fields={schema.fields}
                                value=""
                                placeholder="Add a field…"
                                aria-label="Add a field row"
                                onChange={field =>
                                    onChange({ rows: [...block.rows, { label: field.label, value: `{{record.${field.name}}}` }] })
                                }
                            />
                        </div>
                        <Button size="sm" icon="plus" onClick={() => onChange({ rows: [...block.rows, { label: '', value: '' }] })}>
                            Empty row
                        </Button>
                    </div>
                </div>
            )
        }

        case 'relatedList':
            return <RelatedListFields block={block} schema={schema} onChange={onChange} />

        case 'stats': {
            const replace = (index: number, changes: Record<string, unknown>) =>
                onChange({ items: block.items.map((item, at) => (at === index ? { ...item, ...changes } : item)) })
            return (
                <div className="tp-stack">
                    <div className="tp-pairs">
                        {block.items.map((item, index) => (
                            <div key={index} className="tp-pairs__row">
                                <TokenField value={item.label} onChange={label => replace(index, { label })} aria-label={`Figure ${index + 1} label`} />
                                <TokenField value={item.value} onChange={value => replace(index, { value })} aria-label={`Figure ${index + 1} value`} />
                                <IconButton
                                    icon="trash"
                                    label={`Remove figure ${index + 1}`}
                                    size="sm"
                                    tone="danger"
                                    onClick={() => onChange({ items: block.items.filter((_, at) => at !== index) })}
                                />
                            </div>
                        ))}
                    </div>
                    {block.items.length < 6 && (
                        <div style={{ maxWidth: '20rem' }}>
                            <FieldPicker
                                fields={schema.fields}
                                value=""
                                placeholder="Add a field as a figure…"
                                aria-label="Add a figure"
                                onChange={field =>
                                    onChange({ items: [...block.items, { label: field.label, value: `{{record.${field.name}}}` }] })
                                }
                            />
                        </div>
                    )}
                    <ColorField label="Accent" value={block.color ?? ''} onChange={color => onChange({ color: color || undefined })} allowEmpty />
                </div>
            )
        }

        case 'signatures': {
            const replace = (index: number, changes: Record<string, unknown>) =>
                onChange({ parties: block.parties.map((party, at) => (at === index ? { ...party, ...changes } : party)) })
            return (
                <div className="tp-stack">
                    <div className="tp-pairs">
                        {block.parties.map((party, index) => (
                            <div key={index} className="tp-pairs__row">
                                <TokenField value={party.label} onChange={label => replace(index, { label })} aria-label={`Party ${index + 1}`} />
                                <Input
                                    value={party.caption ?? ''}
                                    placeholder="Caption"
                                    aria-label={`Party ${index + 1} caption`}
                                    onChange={event => replace(index, { caption: event.target.value || undefined })}
                                />
                                <IconButton
                                    icon="trash"
                                    label={`Remove party ${index + 1}`}
                                    size="sm"
                                    tone="danger"
                                    onClick={() => onChange({ parties: block.parties.filter((_, at) => at !== index) })}
                                />
                            </div>
                        ))}
                    </div>
                    {block.parties.length < 4 && (
                        <div>
                            <Button size="sm" icon="plus" onClick={() => onChange({ parties: [...block.parties, { label: '' }] })}>
                                Party
                            </Button>
                        </div>
                    )}
                </div>
            )
        }

        case 'pageBreak':
            return <p className="tp-subtle">Everything after this starts on a new page — or a new slide.</p>
    }
}

/** The one-line description beside a collapsed block. */
export function summarise(block: PdfBlock): string {
    switch (block.type) {
        case 'heading':
        case 'text':
            return block.text.replace(/\s+/g, ' ').slice(0, 80) || 'empty'
        case 'image':
            return block.source ? `${block.width}pt wide${block.caption ? ` · ${block.caption}` : ''}` : 'no image chosen'
        case 'spacer':
            return `${block.height}pt`
        case 'divider':
            return block.color ?? 'rule'
        case 'columns':
            return block.columns.map(column => column.heading || 'column').join(' · ')
        case 'fields':
            return block.rows.map(row => row.label).filter(Boolean).join(' · ') || 'no rows'
        case 'relatedList':
            return block.table ? `${block.table}.${block.field} · ${block.columns.length} columns` : 'not set up yet'
        case 'stats':
            return block.items.map(item => item.label).filter(Boolean).join(' · ') || 'no figures'
        case 'signatures':
            return block.parties.map(party => party.label || 'party').join(' · ')
        case 'pageBreak':
            return 'new page'
    }
}
