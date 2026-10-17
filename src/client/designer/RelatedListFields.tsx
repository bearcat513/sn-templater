import React, { useMemo } from 'react'
import { MAX_RELATED_ROWS, pickStarterFields, type ListColumn, type RelatedListBlock } from '../engine/template'
import { useAsync } from '../hooks/useAsync'
import { SchemaService, type TableSchema } from '../services/schema'
import { Combobox, type ComboOption } from '../ui/Combobox'
import {
    Button,
    ColorField,
    Field,
    IconButton,
    Input,
    Notice,
    NumberInput,
    Select,
    Spinner,
    Switch,
    Textarea,
} from '../ui/controls'
import { FieldPicker } from './FieldPicker'
import { TokenField } from './TokenTarget'

type Props = {
    block: RelatedListBlock
    schema: TableSchema
    onChange: (changes: Partial<RelatedListBlock>) => void
}

const ALIGNS = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Centre' },
    { value: 'right', label: 'Right' },
] as const

/**
 * A related list: which table, through which reference field, filtered and
 * sorted how, and which of its columns to print.
 */
export function RelatedListFields({ block, schema, onChange }: Props) {
    const related = useAsync(() => SchemaService.table(block.table), [block.table], Boolean(block.table))

    const relationshipOptions = useMemo<ComboOption[]>(
        () =>
            schema.relationships.map(entry => ({
                value: `${entry.table}.${entry.field}`,
                label: `${entry.tableLabel} › ${entry.fieldLabel}`,
                detail: `${entry.table}.${entry.field}`,
            })),
        [schema.relationships]
    )

    const current = block.table ? `${block.table}.${block.field}` : ''
    const currentLabel = schema.relationships.find(entry => entry.table === block.table && entry.field === block.field)

    const chooseRelationship = async (option: ComboOption) => {
        const [table, ...rest] = option.value.split('.')
        const field = rest.join('.')
        if (!table || !field) return
        const entry = schema.relationships.find(item => item.table === table && item.field === field)
        const changes: Partial<RelatedListBlock> = {
            table,
            field,
            ...(!block.title && entry ? { title: `${entry.tableLabel} ({{list.count}})` } : {}),
        }
        // A fresh list gets a few sensible columns rather than none.
        if (!block.columns.length || block.table !== table) {
            try {
                const target = await SchemaService.table(table)
                changes.columns = pickStarterFields(
                    target.fields.filter(item => item.name !== field),
                    5
                ).map(item => ({ field: item.name, header: item.label, width: item.name === 'short_description' ? 3 : 1.5 }))
            } catch {
                changes.columns = []
            }
        }
        onChange(changes)
    }

    const replaceColumn = (index: number, changes: Partial<ListColumn>) =>
        onChange({ columns: block.columns.map((column, at) => (at === index ? { ...column, ...changes } : column)) })

    const fields = related.data?.fields ?? []
    const descending = (block.orderBy ?? '').startsWith('-')
    const orderField = (block.orderBy ?? '').replace(/^-/, '')

    return (
        <div className="tp-stack">
            <Field
                label="Records that reference this one"
                hint={
                    relationshipOptions.length
                        ? 'Every table with a reference field pointing at this table, or at one it extends.'
                        : 'Nothing references this table. Type table.field to use one anyway.'
                }
            >
                <Combobox
                    value={current}
                    selectedLabel={currentLabel ? `${currentLabel.tableLabel} › ${currentLabel.fieldLabel}` : current}
                    options={relationshipOptions}
                    allowCustom
                    placeholder="Choose a related list"
                    aria-label="Related list"
                    onChange={option => void chooseRelationship(option)}
                />
            </Field>

            {block.table && (
                <>
                    <Field label="Title" hint="Drawn above the table. {{list.count}} is how many matched.">
                        <TokenField value={block.title ?? ''} onChange={title => onChange({ title: title || undefined })} />
                    </Field>

                    <Field
                        label="Filter"
                        hint={
                            <>
                                An encoded query, ANDed on — e.g. <code>active=true</code>. Build one in the{' '}
                                <a href={`/${block.table}_list.do`} target="_blank" rel="noreferrer">
                                    {block.table} list
                                </a>{' '}
                                and use “Copy query”.
                            </>
                        }
                    >
                        <Textarea
                            className="tp-mono"
                            rows={2}
                            value={block.query ?? ''}
                            onChange={event => onChange({ query: event.target.value || undefined })}
                            placeholder="active=true"
                            spellCheck={false}
                        />
                    </Field>

                    <div className="tp-grid tp-grid--3">
                        <Field label="Sort by">
                            <FieldPicker
                                fields={fields}
                                value={orderField}
                                placeholder="Unsorted"
                                aria-label="Sort by"
                                onChange={field => onChange({ orderBy: `${descending ? '-' : ''}${field.name}` })}
                            />
                        </Field>
                        <Field label="Direction">
                            <Select<'asc' | 'desc'>
                                value={descending ? 'desc' : 'asc'}
                                options={[
                                    { value: 'asc', label: 'Ascending' },
                                    { value: 'desc', label: 'Descending' },
                                ]}
                                disabled={!orderField}
                                onChange={direction =>
                                    onChange({ orderBy: `${direction === 'desc' ? '-' : ''}${orderField}` })
                                }
                                aria-label="Sort direction"
                            />
                        </Field>
                        <Field label="At most (rows)">
                            <NumberInput
                                min={1}
                                max={MAX_RELATED_ROWS}
                                value={block.limit}
                                onChange={limit => onChange({ limit })}
                                aria-label="Row limit"
                            />
                        </Field>
                    </div>

                    <h4 className="tp-subheading">Columns</h4>
                    {related.loading && (
                        <p className="tp-subtle tp-row">
                            <Spinner size={14} /> Reading {block.table}…
                        </p>
                    )}
                    <Notice kind="critical" lines={related.error ? [related.error] : []} />
                    <p className="tp-subtle">Widths are shares of the table, so columns fit any paper and margin.</p>

                    <div className="tp-colgrid" role="table" aria-label="Columns">
                        {block.columns.length > 0 && (
                            <div className="tp-colgrid__head" role="row">
                                <span role="columnheader">Field</span>
                                <span role="columnheader">Heading</span>
                                <span role="columnheader">Width</span>
                                <span role="columnheader">Align</span>
                                <span />
                            </div>
                        )}
                        {block.columns.map((column, index) => (
                            <div key={index} className="tp-colgrid__row" role="row">
                                <FieldPicker
                                    fields={fields}
                                    value={column.field}
                                    aria-label={`Column ${index + 1} field`}
                                    onChange={field =>
                                        replaceColumn(index, {
                                            field: field.name,
                                            header:
                                                !column.header ||
                                                column.header === fields.find(item => item.name === column.field)?.label
                                                    ? field.label
                                                    : column.header,
                                        })
                                    }
                                />
                                <Input
                                    value={column.header}
                                    aria-label={`Column ${index + 1} heading`}
                                    onChange={event => replaceColumn(index, { header: event.target.value })}
                                />
                                <NumberInput
                                    min={0.1}
                                    step={0.1}
                                    value={column.width}
                                    aria-label={`Column ${index + 1} width`}
                                    onChange={width => replaceColumn(index, { width: width ?? 1 })}
                                />
                                <Select<'left' | 'center' | 'right'>
                                    value={column.align ?? 'left'}
                                    options={[...ALIGNS]}
                                    aria-label={`Column ${index + 1} alignment`}
                                    onChange={align => replaceColumn(index, { align: align === 'left' ? undefined : align })}
                                />
                                <IconButton
                                    icon="trash"
                                    label={`Remove column ${index + 1}`}
                                    size="sm"
                                    tone="danger"
                                    onClick={() => onChange({ columns: block.columns.filter((_, at) => at !== index) })}
                                />
                            </div>
                        ))}
                    </div>
                    {block.columns.length < 12 && (
                        <div>
                            <Button
                                size="sm"
                                icon="plus"
                                onClick={() =>
                                    onChange({ columns: [...block.columns, { field: '', header: '', width: 1.5 }] })
                                }
                            >
                                Column
                            </Button>
                        </div>
                    )}

                    <div className="tp-grid tp-grid--3">
                        <ColorField
                            label="Header fill"
                            value={block.headerFill ?? ''}
                            onChange={headerFill => onChange({ headerFill: headerFill || undefined })}
                            allowEmpty
                        />
                        <ColorField
                            label="Zebra"
                            value={block.zebra ?? ''}
                            onChange={zebra => onChange({ zebra: zebra || undefined })}
                            allowEmpty
                        />
                        <Field label="Text size (pt)">
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

                    <Field label="When nothing matches">
                        <TokenField
                            value={block.emptyText ?? ''}
                            onChange={emptyText => onChange({ emptyText: emptyText || undefined })}
                            placeholder="Leave empty to print nothing"
                        />
                    </Field>
                    <Switch
                        checked={Boolean(block.emptyText)}
                        onChange={on => onChange({ emptyText: on ? block.emptyText || 'No records.' : undefined })}
                        label="Say so when the list is empty"
                    />
                </>
            )}
        </div>
    )
}
