import React, { useMemo } from 'react'
import { useChartTemplates } from '../data/charts'
import {
    CHART_KINDS,
    DATE_TYPES,
    chartAxes,
    chartFieldsFor,
    chartShape,
    paletteChart,
    type ChartBlock,
    type ChartItem,
    type ChartKind,
    type ChartSource,
} from '../engine/template'
import { useAsync } from '../hooks/useAsync'
import { SchemaService, type TableSchema } from '../services/schema'
import { Combobox, type ComboOption } from '../ui/Combobox'
import { Button, ColorField, Field, IconButton, Notice, NumberInput, Segmented, Select, Spinner, Switch, Textarea } from '../ui/controls'
import { Icon } from '../ui/icons'
import { FieldPicker } from './FieldPicker'
import { TokenField } from './TokenTarget'

type Props = {
    block: ChartBlock
    schema: TableSchema
    onChange: (changes: Partial<ChartBlock>) => void
}

const MAX_ITEMS = 60

type From = 'items' | 'related' | 'template'

/** What "show values" does on a chart of this kind. */
export function showValuesLabel(kind: ChartKind): string {
    switch (kind) {
        case 'line':
        case 'area':
            return 'Label the last and highest figures'
        case 'pie':
        case 'donut':
            return 'Show figures and shares in the legend'
        case 'funnel':
            return 'Show each figure and its share of the first'
        case 'stacked':
            return 'Label each column with its total'
        case 'heatmap':
            return 'Print each figure in its cell'
        case 'sankey':
            return 'Show each node’s figure beside its name'
        case 'gantt':
            return 'Show how long each bar is'
        default:
            return 'Label each bar with its figure'
    }
}

/** The chart kinds, to choose one from. */
export function ChartKindSelect({ value, onChange }: { value: ChartKind; onChange: (kind: ChartKind) => void }) {
    return (
        <Field label="Chart">
            <Select<ChartKind>
                value={value}
                options={CHART_KINDS.map(entry => ({ value: entry.kind, label: entry.label }))}
                onChange={onChange}
                aria-label="Chart kind"
            />
        </Field>
    )
}

/**
 * A chart: what kind, and where its figures come from — written here, a
 * label and a value each, counted from records that reference this one, or
 * a chart template's, which brings its own records and look with it.
 */
export function ChartFields({ block, schema, onChange }: Props) {
    const from: From = block.template !== undefined ? 'template' : block.related ? 'related' : 'items'
    if (from === 'template') return <ChartTemplateFields block={block} onChange={onChange} />

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

    const replaceItem = (index: number, changes: Partial<ChartItem>) =>
        onChange({ items: block.items.map((item, at) => (at === index ? { ...item, ...changes } : item)) })

    const currentLabel = source && schema.relationships.find(entry => entry.table === source.table && entry.field === source.field)
    const fields = related.data?.fields ?? []
    const dateFields = fields.filter(field => DATE_TYPES.has(field.type))
    const groupLabel = fields.find(field => field.name === source?.groupBy)?.label
    const shape = chartShape(block.chart)
    const [firstAxis, secondAxis] = chartAxes(block.chart)

    // Counting related records, the fields that suit the new kind come along with it.
    const changeKind = (chart: ChartKind) =>
        onChange({
            chart,
            ...(source && related.data
                ? {
                      related: {
                          table: source.table,
                          field: source.field,
                          ...(source.query ? { query: source.query } : {}),
                          ...chartFieldsFor(chart, block.chart, source, related.data.fields, related.data.displayField),
                      },
                  }
                : {}),
        })

    return (
        <div className="tp-stack">
            <ChartKindSelect value={block.chart} onChange={changeKind} />

            <Field label="Title" hint={counting ? 'Drawn above the chart. {{list.count}} is how many records matched.' : 'Drawn above the chart.'}>
                <TokenField value={block.title ?? ''} onChange={title => onChange({ title: title || undefined })} />
            </Field>

            <FiguresChoice value={from} onChange={onChange} />

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
                            {related.loading ? (
                                <p className="tp-subtle tp-row">
                                    <Spinner size={14} /> Reading {source.table}…
                                </p>
                            ) : shape === 'spans' ? (
                                <>
                                    <Field label="One bar for each, named by">
                                        <FieldPicker
                                            fields={fields}
                                            value={source.groupBy}
                                            placeholder={groupLabel ?? 'Choose a field'}
                                            aria-label="Bar name"
                                            onChange={field => setSource({ groupBy: field.name })}
                                        />
                                    </Field>
                                    <div className="tp-grid tp-grid--2">
                                        <Field label="Starts">
                                            <FieldPicker
                                                fields={dateFields}
                                                value={source.start ?? ''}
                                                placeholder={dateFields.length ? 'A date field' : 'No date fields'}
                                                aria-label="Start date"
                                                onChange={field => setSource({ start: field.name })}
                                            />
                                        </Field>
                                        <Field label="Ends" hint="Empty is a milestone.">
                                            <FieldPicker
                                                fields={dateFields}
                                                value={source.end ?? ''}
                                                placeholder="A date field"
                                                aria-label="End date"
                                                onChange={field => setSource({ end: field.name })}
                                            />
                                        </Field>
                                    </div>
                                </>
                            ) : (
                                <div className={shape === 'pairs' ? 'tp-grid tp-grid--2' : undefined}>
                                    <Field label={shape === 'pairs' ? `${firstAxis}: count them by` : 'Count them by'}>
                                        <FieldPicker
                                            fields={fields}
                                            value={source.groupBy}
                                            placeholder={groupLabel ?? 'Choose a field'}
                                            aria-label="Count by field"
                                            onChange={field => setSource({ groupBy: field.name })}
                                        />
                                    </Field>
                                    {shape === 'pairs' && (
                                        <Field label={`${secondAxis}: then by`}>
                                            <FieldPicker
                                                fields={fields}
                                                value={source.thenBy ?? ''}
                                                placeholder="Choose a field"
                                                aria-label="Then by field"
                                                onChange={field => setSource({ thenBy: field.name })}
                                            />
                                        </Field>
                                    )}
                                </div>
                            )}
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
                    <p className="tp-subtle">
                        {shape === 'spans' ? (
                            <>
                                Each bar's dates are filled in for the record and read as dates — <code>{'{{raw.start_date}}'}</code> reads the
                                same whatever someone's date format. A bar without a start is left out.
                            </>
                        ) : (
                            "Each value is filled in for the record and read as a number; one that isn't a number is left out."
                        )}
                    </p>
                    <div className="tp-pairs">
                        {shape !== 'single' && block.items.length > 0 && (
                            <div className="tp-pairs__row tp-pairs__row--three tp-pairs__head" aria-hidden>
                                <span>{shape === 'spans' ? 'Bar' : firstAxis}</span>
                                <span>{shape === 'spans' ? 'Starts' : secondAxis}</span>
                                <span>{shape === 'spans' ? 'Ends' : 'Figure'}</span>
                                <span />
                            </div>
                        )}
                        {block.items.map((item, index) => (
                            <div key={index} className={shape === 'single' ? 'tp-pairs__row' : 'tp-pairs__row tp-pairs__row--three'}>
                                <TokenField value={item.label} onChange={label => replaceItem(index, { label })} aria-label={`Figure ${index + 1} label`} />
                                {shape === 'pairs' && (
                                    <TokenField value={item.to ?? ''} onChange={to => replaceItem(index, { to })} aria-label={`Figure ${index + 1} ${secondAxis.toLowerCase()}`} />
                                )}
                                {shape === 'spans' ? (
                                    <>
                                        <TokenField value={item.start ?? ''} onChange={start => replaceItem(index, { start })} aria-label={`Bar ${index + 1} start`} />
                                        <TokenField value={item.end ?? ''} onChange={end => replaceItem(index, { end })} aria-label={`Bar ${index + 1} end`} />
                                    </>
                                ) : (
                                    <TokenField value={item.value} onChange={value => replaceItem(index, { value })} aria-label={`Figure ${index + 1} value`} />
                                )}
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
                            {shape !== 'spans' && (
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
                            )}
                            <Button size="sm" icon="plus" onClick={() => onChange({ items: [...block.items, { label: '', value: '' }] })}>
                                {shape === 'spans' ? 'Add a bar' : 'Empty figure'}
                            </Button>
                        </div>
                    )}
                </>
            )}

            <div className="tp-grid tp-grid--2">
                <Field label="Height (pt)" hint="The plot; a legend or many rows can make it taller.">
                    <NumberInput min={40} max={600} value={block.height} onChange={height => onChange({ height: height ?? 160 })} aria-label="Chart height" />
                </Field>
                {!paletteChart(block.chart) && (
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
                label={showValuesLabel(block.chart)}
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

/** Where a chart's figures come from. Choosing again starts that source afresh. */
function FiguresChoice({ value, onChange }: { value: From; onChange: (changes: Partial<ChartBlock>) => void }) {
    return (
        <Segmented<From>
            label="Figures"
            size="sm"
            value={value}
            onChange={next =>
                onChange({
                    related: next === 'related' ? { table: '', field: '', groupBy: '' } : undefined,
                    template: next === 'template' ? '' : undefined,
                })
            }
            options={[
                { value: 'items', label: 'Written here' },
                { value: 'related', label: 'Counted from related records' },
                { value: 'template', label: 'A chart template' },
            ]}
        />
    )
}

/**
 * A chart template placed as a block: which one, and how tall. Everything
 * else — its records, its grouping, its look — is the template's, and is
 * changed there, for every document and deck that shows it.
 */
function ChartTemplateFields({ block, onChange }: { block: ChartBlock; onChange: (changes: Partial<ChartBlock>) => void }) {
    const templates = useChartTemplates()
    const options = (templates.data ?? []).filter(chart => chart.active || chart.sysId === block.template)
    const chosen = options.find(chart => chart.sysId === block.template)

    return (
        <div className="tp-stack">
            <FiguresChoice value="template" onChange={onChange} />
            <Field
                label="Chart template"
                hint={
                    templates.loading
                        ? 'Loading the chart templates…'
                        : options.length
                          ? 'It counts its own table with its own filter — the same on every record.'
                          : 'There are no chart templates yet. Make one from the Templates page with New chart.'
                }
            >
                <Select<string>
                    value={block.template ?? ''}
                    options={[
                        ...(chosen ? [] : [{ value: block.template ?? '', label: block.template ? 'A chart template that is not available' : 'Choose a chart' }]),
                        ...options.map(chart => ({ value: chart.sysId, label: `${chart.name} · ${chart.tableLabel || chart.table}` })),
                    ]}
                    onChange={template => template && onChange({ template })}
                    aria-label="Chart template"
                />
            </Field>
            <Notice kind="critical" lines={templates.error ? [templates.error] : []} />
            <Field label="Title" hint="Leave empty to use the chart’s own title. {{list.count}} is how many records it counted.">
                <TokenField value={block.title ?? ''} onChange={title => onChange({ title: title || undefined })} />
            </Field>
            <Field label="Height (pt)" hint="The plot; a pie's legend can make it taller.">
                <NumberInput min={40} max={600} value={block.height} onChange={height => onChange({ height: height ?? 160 })} aria-label="Chart height" />
            </Field>
            {block.template && (
                <div>
                    <a
                        className="tp-btn tp-btn--ghost tp-btn--sm"
                        href={`${window.location.pathname}?view=edit&id=${encodeURIComponent(block.template)}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <Icon name="external" size={14} />
                        <span>Edit the chart template</span>
                    </a>
                </div>
            )}
        </div>
    )
}
