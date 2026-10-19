import React from 'react'
import { CALLOUT_TONES, type BlockAlign, type CalloutTone, type ListStyle, type PdfBlock } from '../engine/template'
import type { TableSchema } from '../services/schema'
import { Button, ColorField, Field, IconButton, Input, NumberInput, Segmented, Select, Switch } from '../ui/controls'
import { FieldPicker } from './FieldPicker'
import { ImagePicker } from './ImagePicker'
import { ReferenceFields } from './ReferenceFields'
import { RelatedListFields } from './RelatedListFields'
import { TokenField } from './TokenTarget'

/** The longest a table block grows from the designer: past this it is a related list's job. */
const MAX_TABLE_ROWS = 200
const MAX_TABLE_COLUMNS = 12

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

        case 'reference':
            return <ReferenceFields block={block} schema={schema} onChange={onChange} />

        case 'code':
            return (
                <div className="tp-stack">
                    <Field label="Code" hint="Spaces, tabs and blank lines are kept as written. Tokens are filled in — {{record.script}}.">
                        <TokenField
                            multiline
                            rows={8}
                            value={block.code}
                            onChange={code => onChange({ code })}
                            className="tp-mono tp-code-input"
                        />
                    </Field>
                    <div className="tp-grid tp-grid--3">
                        <Field label="Label" hint="A language or file name.">
                            <TokenField value={block.title ?? ''} onChange={title => onChange({ title: title || undefined })} />
                        </Field>
                        <Field label="Size (pt)">
                            <NumberInput
                                min={5}
                                max={24}
                                step={0.5}
                                value={block.size}
                                placeholder="auto"
                                onChange={size => onChange({ size })}
                                aria-label="Code size"
                            />
                        </Field>
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
                    <div className="tp-grid tp-grid--2">
                        <ColorField
                            label="Background"
                            allowEmpty
                            value={block.background ?? ''}
                            hint="Empty is light grey."
                            onChange={background => onChange({ background: background || undefined })}
                        />
                        <ColorField label="Text" allowEmpty value={block.color ?? ''} onChange={color => onChange({ color: color || undefined })} />
                    </div>
                    <div className="tp-row tp-row--wrap" style={{ gap: 'var(--tp-space-4)' }}>
                        <Switch
                            checked={block.lineNumbers === true}
                            onChange={lineNumbers => onChange({ lineNumbers: lineNumbers || undefined })}
                            label="Line numbers"
                        />
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onChange({ background: '#0f172a', color: '#e2e8f0' })}
                        >
                            Dark theme
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onChange({ background: undefined, color: undefined })}>
                            Light theme
                        </Button>
                    </div>
                </div>
            )

        case 'link':
            return (
                <div className="tp-stack">
                    <div className="tp-grid tp-grid--2">
                        <Field label="Text" hint="Empty shows the address itself.">
                            <TokenField value={block.text} onChange={text => onChange({ text })} />
                        </Field>
                        <Field label="Address" hint="https://…, mailto:…, tel:…, or a path like /incident_list.do. {{url.record}} is the record.">
                            <TokenField value={block.url} onChange={url => onChange({ url })} />
                        </Field>
                    </div>
                    <div className="tp-row tp-row--wrap">
                        <span className="tp-subtle">Link to</span>
                        <Button size="sm" variant="ghost" onClick={() => onChange({ url: '{{url.record}}' })}>
                            This record
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onChange({ url: 'mailto:{{record.caller_id.email}}' })}>
                            Email the caller
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onChange({ url: '/{{table.name}}_list.do' })}>
                            The table’s list
                        </Button>
                    </div>
                    <div className="tp-grid tp-grid--3">
                        <Field label="Size (pt)">
                            <NumberInput
                                min={5}
                                max={72}
                                step={0.5}
                                value={block.size}
                                placeholder="auto"
                                onChange={size => onChange({ size })}
                                aria-label="Link size"
                            />
                        </Field>
                        <ColorField
                            label="Colour"
                            allowEmpty
                            value={block.color ?? ''}
                            hint="Empty is the accent."
                            onChange={color => onChange({ color: color || undefined })}
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
                        <Switch checked={block.bold ?? false} onChange={bold => onChange({ bold: bold || undefined })} label="Bold" />
                    </div>
                </div>
            )

        case 'callout':
            return (
                <div className="tp-stack">
                    <Field label="Tone">
                        <Segmented<CalloutTone>
                            label="Tone"
                            size="sm"
                            value={block.tone}
                            onChange={tone => onChange({ tone })}
                            options={CALLOUT_TONES.map(entry => ({ value: entry.tone, label: entry.label }))}
                        />
                    </Field>
                    <Field label="Title">
                        <TokenField value={block.title ?? ''} onChange={title => onChange({ title: title || undefined })} />
                    </Field>
                    <Field label="Text">
                        <TokenField multiline rows={3} value={block.text} onChange={text => onChange({ text })} />
                    </Field>
                    <ColorField
                        label="Colour"
                        allowEmpty
                        value={block.color ?? ''}
                        hint="Empty uses the tone’s own."
                        onChange={color => onChange({ color: color || undefined })}
                    />
                </div>
            )

        case 'list': {
            const replace = (index: number, value: string) =>
                onChange({ items: block.items.map((item, at) => (at === index ? value : item)) })
            return (
                <div className="tp-stack">
                    <Field label="Style">
                        <Segmented<ListStyle>
                            label="List style"
                            size="sm"
                            value={block.style}
                            onChange={style => onChange({ style })}
                            options={[
                                { value: 'bullet', label: 'Bullets', icon: 'list' },
                                { value: 'number', label: 'Numbers' },
                                { value: 'check', label: 'Checkboxes', icon: 'check' },
                            ]}
                        />
                    </Field>
                    <p className="tp-subtle">An item that fills in to several lines — a multi-line field — becomes one item per line.</p>
                    <div className="tp-stack tp-stack--tight">
                        {block.items.map((item, index) => (
                            <div key={index} className="tp-row">
                                <span className="tp-list-marker" aria-hidden="true">
                                    {block.style === 'number' ? `${index + 1}.` : block.style === 'check' ? '☐' : '•'}
                                </span>
                                <div className="tp-grow">
                                    <TokenField value={item} onChange={value => replace(index, value)} aria-label={`Item ${index + 1}`} />
                                </div>
                                <IconButton
                                    icon="trash"
                                    label={`Remove item ${index + 1}`}
                                    size="sm"
                                    tone="danger"
                                    onClick={() => onChange({ items: block.items.filter((_, at) => at !== index) })}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="tp-row tp-row--wrap">
                        <div className="tp-grow" style={{ maxWidth: '20rem' }}>
                            <FieldPicker
                                fields={schema.fields}
                                value=""
                                placeholder="Add a field as an item…"
                                aria-label="Add a field item"
                                onChange={field => onChange({ items: [...block.items, `{{record.${field.name}}}`] })}
                            />
                        </div>
                        <Button size="sm" icon="plus" onClick={() => onChange({ items: [...block.items, ''] })}>
                            Item
                        </Button>
                    </div>
                    <Field label="Size (pt)">
                        <NumberInput
                            min={5}
                            max={72}
                            step={0.5}
                            value={block.size}
                            placeholder="auto"
                            onChange={size => onChange({ size })}
                            aria-label="List size"
                        />
                    </Field>
                </div>
            )
        }

        case 'table':
            return <TableFields block={block} onChange={onChange} />

        case 'pageBreak':
            return <p className="tp-subtle">Everything after this starts on a new page — or a new slide.</p>
    }
}

/** A table block: its columns across the top, its cells in a grid underneath, all editable in place. */
function TableFields({
    block,
    onChange,
}: {
    block: Extract<PdfBlock, { type: 'table' }>
    onChange: (changes: Record<string, unknown>) => void
}) {
    const width = block.columns.length
    const setColumn = (index: number, changes: Record<string, unknown>) =>
        onChange({ columns: block.columns.map((column, at) => (at === index ? { ...column, ...changes } : column)) })
    const setCell = (row: number, column: number, value: string) =>
        onChange({ rows: block.rows.map((cells, at) => (at === row ? cells.map((cell, index) => (index === column ? value : cell)) : cells)) })
    const addColumn = () =>
        onChange({
            columns: [...block.columns, { header: `Column ${width + 1}`, width: 1 }],
            rows: block.rows.map(cells => [...cells, '']),
        })
    const removeColumn = (index: number) =>
        onChange({
            columns: block.columns.filter((_, at) => at !== index),
            rows: block.rows.map(cells => cells.filter((_, at) => at !== index)),
        })

    return (
        <div className="tp-stack">
            <div className="tp-table-editor" style={{ gridTemplateColumns: `repeat(${width}, minmax(7rem, 1fr)) auto` }}>
                {block.columns.map((column, index) => (
                    <div key={`h${index}`} className="tp-table-editor__head">
                        <TokenField value={column.header} onChange={header => setColumn(index, { header })} aria-label={`Column ${index + 1} heading`} />
                        <div className="tp-row">
                            <NumberInput
                                min={0.1}
                                max={100}
                                step={0.5}
                                value={column.width}
                                onChange={value => setColumn(index, { width: value ?? 1 })}
                                aria-label={`Column ${index + 1} width`}
                            />
                            <Select<BlockAlign>
                                aria-label={`Column ${index + 1} alignment`}
                                value={column.align ?? 'left'}
                                onChange={align => setColumn(index, { align: align === 'left' ? undefined : align })}
                                options={[
                                    { value: 'left', label: 'Left' },
                                    { value: 'center', label: 'Centre' },
                                    { value: 'right', label: 'Right' },
                                ]}
                            />
                            {width > 1 && (
                                <IconButton icon="x" label={`Remove column ${index + 1}`} size="sm" tone="danger" onClick={() => removeColumn(index)} />
                            )}
                        </div>
                    </div>
                ))}
                <span />
                {block.rows.map((cells, row) => (
                    <React.Fragment key={`r${row}`}>
                        {block.columns.map((_, column) => (
                            <TokenField
                                key={column}
                                value={cells[column] ?? ''}
                                onChange={value => setCell(row, column, value)}
                                aria-label={`Row ${row + 1}, column ${column + 1}`}
                            />
                        ))}
                        <IconButton
                            icon="trash"
                            label={`Remove row ${row + 1}`}
                            size="sm"
                            tone="danger"
                            onClick={() => onChange({ rows: block.rows.filter((_, at) => at !== row) })}
                        />
                    </React.Fragment>
                ))}
            </div>
            <div className="tp-row tp-row--wrap">
                {block.rows.length < MAX_TABLE_ROWS && (
                    <Button size="sm" icon="plus" onClick={() => onChange({ rows: [...block.rows, block.columns.map(() => '')] })}>
                        Row
                    </Button>
                )}
                {width < MAX_TABLE_COLUMNS && (
                    <Button size="sm" icon="plus" onClick={addColumn}>
                        Column
                    </Button>
                )}
            </div>
            <div className="tp-grid tp-grid--3">
                <ColorField label="Header fill" allowEmpty value={block.headerFill ?? ''} onChange={headerFill => onChange({ headerFill: headerFill || undefined })} />
                <ColorField label="Banding" allowEmpty value={block.zebra ?? ''} onChange={zebra => onChange({ zebra: zebra || undefined })} />
                <Field label="Size (pt)">
                    <NumberInput
                        min={5}
                        max={24}
                        step={0.5}
                        value={block.fontSize}
                        placeholder="auto"
                        onChange={fontSize => onChange({ fontSize })}
                        aria-label="Table text size"
                    />
                </Field>
            </div>
        </div>
    )
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
        case 'reference':
            return block.field ? `${block.field} → ${block.table} · ${block.rows.length} fields` : 'not set up yet'
        case 'code':
            return block.title || block.code.split('\n').find(line => line.trim())?.trim().slice(0, 80) || 'empty'
        case 'link':
            return `${block.text || block.url} → ${block.url}`.slice(0, 90)
        case 'callout':
            return `${block.tone}${block.title ? ` · ${block.title}` : ''}`
        case 'list':
            return `${block.items.length} ${block.style === 'number' ? 'numbered' : block.style === 'check' ? 'checkbox' : 'bulleted'} item${block.items.length === 1 ? '' : 's'}`
        case 'table':
            return `${block.columns.length} × ${block.rows.length}`
        case 'pageBreak':
            return 'new page'
    }
}
