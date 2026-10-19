import React, { useMemo } from 'react'
import { CHART_KINDS, type ChartBlock, type ChartKind, type ChartSource } from '../engine/template'
import { useAsync } from '../hooks/useAsync'
import { SchemaService, type TableSchema } from '../services/schema'
import { Combobox, type ComboOption } from '../ui/Combobox'
import { Button, ColorField, Field, IconButton, Notice, NumberInput, Segmented, Spinner, Switch, Textarea } from '../ui/controls'
import { FieldPicker } from './FieldPicker'
import { TokenField } from './TokenTarget'

type Props = {
    block: ChartBlock
    schema: TableSchema
    onChange: (changes: Partial<ChartBlock>) => void
}

const MAX_ITEMS = 60

/**
 * A chart: what kind, and where its figures come from — written here, a
 * label and a value each, or counted from records that reference this one.
 */
export function ChartFields({ block, schema, onChange }: Props) {
    const source = block.related
    const counting = Boolean(source)
    const related = useAsync(() => SchemaService.table(source?.table ?? ''), [source?.table], Boolean(source?.table))

    const relationshipOptions = useMemo<ComboOption[]>(
        () =>
            schema.relationships.map(entry => ({
                value: `${entry.table}.${entry.field}`,
                label: `${entry.tableLabel} › ${entry.fieldLabel}`,
                detail: `${entry.table}.${entry.field}`,
            })),
        [schema.relationships]
    )

    const setSource = (changes: Partial<ChartSource>) =>
        onChange({ related: { table: '', field: '', groupBy: '', ...source, ...changes } })

    const chooseRelationship = (option: ComboOption) => {
        const [table, ...rest] = option.value.split('.')
        const field = rest.join('.')
        if (!table || !field) return
        const entry = schema.relationships.find(item => item.table === table && item.field === field)
        onChange({
            related: { table, field, groupBy: table === source?.table ? (source?.groupBy ?? '') : 'state' },
            ...(!block.title && entry ? { title: `${entry.tableLabel} by state ({{list.count}})` } : {}),
        })
    }

    const replaceItem = (index: number, changes: Partial<ChartBlock['items'][number]>) =>
        onChange({ items: block.items.map((item, at) => (at === index ? { ...item, ...changes } : item)) })

    const currentLabel = source && schema.relationships.find(entry => entry.table === source.table && entry.field === source.field)
    const fields = related.data?.fields ?? []
    const groupLabel = fields.find(field => field.name === source?.groupBy)?.label

    return (
        <div className="tp-stack">
            <Segmented<ChartKind>
                label="Chart"
                size="sm"
                value={block.chart}
                onChange={chart => onChange({ chart })}
                options={CHART_KINDS.map(entry => ({ value: entry.kind, label: entry.label }))}
            />

            <Field label="Title" hint={counting ? 'Drawn above the chart. {{list.count}} is how many records matched.' : 'Drawn above the chart.'}>
                <TokenField value={block.title ?? ''} onChange={title => onChange({ title: title || undefined })} />
            </Field>

            <Segmented<'items' | 'related'>
                label="Figures"
                size="sm"
                value={counting ? 'related' : 'items'}
                onChange={from => onChange({ related: from === 'related' ? { table: '', field: '', groupBy: '' } : undefined })}
                options={[
                    { value: 'items', label: 'Written here' },
                    { value: 'related', label: 'Counted from related records' },
                ]}
            />

            {source ? (
                <>
                    <Field
                        label="Records that reference this one"
                        hint={
                            relationshipOptions.length
                                ? 'Each is counted once, under the value of the field below.'
                                : 'Nothing references this table. Type table.field to use one anyway.'
                        }
                    >
                        <Combobox
                            value={source.table ? `${source.table}.${source.field}` : ''}
                            selectedLabel={
                                currentLabel
                                    ? `${currentLabel.tableLabel} › ${currentLabel.fieldLabel}`
                                    : source.table
                                      ? `${source.table}.${source.field}`
                                      : ''
                            }
                            options={relationshipOptions}
                            allowCustom
                            placeholder="Choose related records"
                            aria-label="Related records"
                            onChange={chooseRelationship}
                        />
                    </Field>
                    {source.table && (
                        <>
                            <Field label="Count them by">
                                {related.loading ? (
                                    <p className="tp-subtle tp-row">
                                        <Spinner size={14} /> Reading {source.table}…
                                    </p>
                                ) : (
                                    <FieldPicker
                                        fields={fields}
                                        value={source.groupBy}
                                        placeholder={groupLabel ?? 'Choose a field'}
                                        aria-label="Count by field"
                                        onChange={field => setSource({ groupBy: field.name })}
                                    />
                                )}
                            </Field>
                            <Notice kind="critical" lines={related.error ? [related.error] : []} />
                            <Field label="Filter" hint={<>An encoded query, ANDed on — e.g. <code>active=true</code>.</>}>
                                <Textarea
                                    className="tp-mono"
                                    rows={2}
                                    value={source.query ?? ''}
                                    onChange={event => setSource({ query: event.target.value || undefined })}
                                    placeholder="active=true"
                                    spellCheck={false}
                                />
                            </Field>
                        </>
                    )}
                </>
            ) : (
                <>
                    <p className="tp-subtle">Each value is filled in for the record and read as a number; one that isn't a number is left out.</p>
                    <div className="tp-pairs">
                        {block.items.map((item, index) => (
                            <div key={index} className="tp-pairs__row">
                                <TokenField value={item.label} onChange={label => replaceItem(index, { label })} aria-label={`Figure ${index + 1} label`} />
                                <TokenField value={item.value} onChange={value => replaceItem(index, { value })} aria-label={`Figure ${index + 1} value`} />
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
                    {block.items.length < MAX_ITEMS && (
                        <div className="tp-row tp-row--wrap">
                            <div className="tp-grow" style={{ maxWidth: '20rem' }}>
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
                            <Button size="sm" icon="plus" onClick={() => onChange({ items: [...block.items, { label: '', value: '' }] })}>
                                Empty figure
                            </Button>
                        </div>
                    )}
                </>
            )}

            <div className="tp-grid tp-grid--2">
                <Field label="Height (pt)" hint="The plot; a pie's legend can make it taller.">
                    <NumberInput min={40} max={600} value={block.height} onChange={height => onChange({ height: height ?? 160 })} aria-label="Chart height" />
                </Field>
                {block.chart !== 'pie' && block.chart !== 'donut' && (
                    <ColorField
                        label="Colour"
                        value={block.color ?? ''}
                        onChange={color => onChange({ color: color || undefined })}
                        allowEmpty
                    />
                )}
            </div>
            <Switch
                checked={block.showValues ?? false}
                onChange={showValues => onChange({ showValues: showValues || undefined })}
                label={block.chart === 'line' ? 'Label the last and highest figures' : block.chart === 'pie' || block.chart === 'donut' ? 'Show figures and shares in the legend' : 'Label each bar with its figure'}
            />
            <Field label="When there is nothing to chart">
                <TokenField
                    value={block.emptyText ?? ''}
                    onChange={emptyText => onChange({ emptyText: emptyText || undefined })}
                    placeholder="Leave empty to print nothing"
                />
            </Field>
        </div>
    )
}
