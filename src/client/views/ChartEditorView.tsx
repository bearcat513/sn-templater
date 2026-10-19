import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { forgetChart, measureChart, measuredNote } from '../data/charts'
import { contextValues } from '../data/loader'
import { useSession } from '../data/session'
import { describeError, log, useInspect } from '../debug/log'
import { chartPoints, type ChartDatum, type LoadedChart } from '../engine/chart'
import { pageDimensions } from '../engine/pdf'
import { newId, type CustomSlide } from '../engine/presentation'
import { renderPdfDocument, renderPdfSlides, type RenderJob } from '../engine/render'
import {
    CHART_KINDS,
    CHART_MEASURES,
    DATE_TYPES,
    DEFAULT_PAGE,
    TEMPLATE_KIND_LABELS,
    chartAxes,
    chartFieldsFor,
    chartShape,
    paletteChart,
    starterChart,
    starterTemplate,
    type ChartBlock,
    type ChartKind,
    type ChartMeasure,
    type ChartShape,
    type ChartTemplate,
    type PdfTemplate,
} from '../engine/template'
import { documentFileName } from '../engine/tokens'
import { readChartTemplate, serializeChartTemplate } from '../engine/validate'
import type { SchemaField } from '../engine/vocabulary'
import { ChartKindSelect, showValuesLabel } from '../designer/ChartFields'
import { FieldPicker } from '../designer/FieldPicker'
import { useAsync } from '../hooks/useAsync'
import { useDebounced } from '../hooks/useDebounced'
import { useElementSize } from '../hooks/useElementSize'
import { downloadBytes } from '../hooks/usePdf'
import { setPageTitle, type Navigate } from '../hooks/useRoute'
import { SchemaService, type TableSchema } from '../services/schema'
import { TemplateService, type TemplateRecord } from '../services/templates'
import type { Slide } from '../slides/paginate'
import { SlideView } from '../slides/SlideView'
import { Badge, Button, ColorField, Field, Input, Notice, NumberInput, Segmented, Select, Spinner, Switch, Textarea } from '../ui/controls'
import { ConfirmModal, useToast } from '../ui/overlays'
import { TablePicker } from './common'

type Meta = { name: string; description: string; active: boolean; table: string; tableLabel: string; query: string }

const metaOf = (record: TemplateRecord): Meta => ({
    name: record.name,
    description: record.description,
    active: record.active,
    table: record.table,
    tableLabel: record.tableLabel,
    query: record.query,
})

const snapshot = (meta: Meta, chart: ChartTemplate) => JSON.stringify([meta, chart])

/** The field types a sum or an average can be taken of. */
const NUMBER_TYPES = new Set(['integer', 'longint', 'decimal', 'float', 'numeric', 'currency', 'currency2', 'price'])

type Showing = 'document' | 'slide'

/** What shape of chart a counted point was counted for. */
const pointShape = (point: ChartDatum): ChartShape => (point.start !== undefined ? 'spans' : point.to !== undefined ? 'pairs' : 'single')

/**
 * The designer for a chart template: which records, grouped by what, measured
 * how, and drawn how — with the chart counted live beside it, as it will be
 * drawn in a document and on a slide.
 *
 * The preview is not a picture of the chart but the real renderers: a page
 * with the chart placed on it as a block, and a slide with it placed as an
 * element, drawn by the same code a deck and a presentation use — and
 * downloadable as the same PDF.
 */
export function ChartEditorView({
    record: opened,
    schema: openedSchema,
    navigate,
}: {
    record: TemplateRecord
    schema: TableSchema
    navigate: Navigate
}) {
    const session = useSession()
    const toast = useToast()
    const [record, setRecord] = useState(opened)
    const [schema, setSchema] = useState(openedSchema)
    const [meta, setMeta] = useState<Meta>(() => metaOf(opened))
    const [initial] = useState(() => readChartTemplate(opened.body ?? '', openedSchema.fields, opened.tableLabel))
    const [chart, setChart] = useState<ChartTemplate>(() =>
        initial.ok ? initial.value : starterChart(openedSchema.fields, opened.tableLabel)
    )
    const [parseNote, setParseNote] = useState(() =>
        initial.ok ? '' : `The stored chart could not be read (${initial.error}) — opened a new one instead.`
    )
    const [saved, setSaved] = useState(() => snapshot(metaOf(opened), chart))
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [showing, setShowing] = useState<Showing>('document')
    const [pending, setPending] = useState<(() => void) | null>(null)

    const canEdit = session.canEdit
    const dirty = snapshot(meta, chart) !== saved
    const set = (changes: Partial<ChartTemplate>) => setChart(current => ({ ...current, ...changes }))

    useInspect('chart.record', record)
    useInspect('chart.body', chart)

    useEffect(() => setPageTitle(opened.name), [opened.name])

    /* ------------------------------ counting ------------------------------ */

    // Only what changes the count is a reason to count again; the look is redrawn from the same groups.
    const shape = chartShape(chart.chart)
    const question = useDebounced(
        JSON.stringify([
            meta.table,
            meta.query,
            {
                // A chart of the same shape counts the same way, so a column turned into a bar is not counted again.
                chart: CHART_KINDS.find(entry => entry.shape === shape)!.kind,
                groupBy: chart.groupBy,
                measure: chart.measure,
                ...(chart.field ? { field: chart.field } : {}),
                ...(shape === 'pairs' && chart.thenBy ? { thenBy: chart.thenBy } : {}),
                ...(shape === 'spans' ? { start: chart.start, end: chart.end } : {}),
            },
        ]),
        400
    )
    const grouped = useAsync(
        () => {
            const [table, query, asked] = JSON.parse(question) as [string, string, ChartTemplate]
            return measureChart(table, query, asked)
        },
        [question],
        Boolean(chart.groupBy && meta.table)
    )

    const loaded = useMemo<LoadedChart>(
        () => ({
            sysId: record.sysId,
            name: meta.name,
            table: meta.table,
            spec: chart,
            // Counted for another shape a moment ago: nothing to draw until this one's arrive.
            points: grouped.data && grouped.data.points.every(point => pointShape(point) === shape) ? chartPoints(chart, grouped.data.points) : [],
            total: grouped.data?.total ?? 0,
            ...(grouped.data && measuredNote(chart, grouped.data) ? { note: measuredNote(chart, grouped.data) } : {}),
        }),
        [record.sysId, meta.name, meta.table, chart, grouped.data, shape]
    )

    /* ------------------------------ the preview ----------------------------- */

    const sample = useMemo(() => previewOf(showing, loaded, schema, session, meta.name), [showing, loaded, schema, session, meta.name])
    const stage = useRef<HTMLDivElement>(null)
    const { width } = useElementSize(stage)

    const downloadPdf = () => {
        const result =
            showing === 'slide'
                ? renderPdfSlides(sample.template, sample.job, [sample.slide])
                : renderPdfDocument(sample.template, sample.job)
        downloadBytes(result.bytes, documentFileName(meta.name || 'chart', 'chart'))
    }

    /* ------------------------------- saving ------------------------------- */

    const save = useCallback(async () => {
        if (!canEdit) return
        if (!meta.name.trim()) {
            setSaveError('A chart needs a name.')
            return
        }
        setSaving(true)
        setSaveError('')
        try {
            const body = serializeChartTemplate(chart)
            const next = await TemplateService.update(record.sysId, {
                name: meta.name.trim(),
                description: meta.description,
                active: meta.active,
                table: meta.table,
                query: meta.query,
                body,
            })
            forgetChart(record.sysId)
            const nextMeta = { ...meta, tableLabel: next.tableLabel || meta.tableLabel }
            setMeta(nextMeta)
            setRecord(next)
            setSaved(snapshot(nextMeta, chart))
            setPageTitle(next.name)
            log.info('editor', `Saved chart “${next.name}”`, { sysId: next.sysId })
            toast('Chart saved.')
        } catch (failure) {
            const { message, data } = describeError(failure)
            log.error('editor', `Save failed: ${message}`, data)
            setSaveError(failure instanceof Error ? failure.message : 'The chart could not be saved.')
        } finally {
            setSaving(false)
        }
    }, [canEdit, meta, chart, record.sysId, toast])

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                void save()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [save])

    useEffect(() => {
        if (!dirty) return
        const onUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', onUnload)
        return () => window.removeEventListener('beforeunload', onUnload)
    }, [dirty])

    const guarded = (go: () => void) => (dirty ? setPending(() => go) : go())

    const changeTable = async (table: string, label: string) => {
        try {
            const next = await SchemaService.table(table)
            setSchema(next)
            setMeta(current => ({ ...current, table: next.name, tableLabel: label || next.label, query: '' }))
            // The old table's field means nothing on the new one.
            if (!next.fields.some(field => field.name === chart.groupBy)) {
                const groupBy = starterChart(next.fields).groupBy
                set({
                    thenBy: undefined,
                    start: undefined,
                    end: undefined,
                    ...chartFieldsFor(chart.chart, 'column', { groupBy }, next.fields, next.displayField),
                    measure: 'count',
                    field: undefined,
                })
            }
        } catch (failure) {
            toast(failure instanceof Error ? failure.message : 'That table could not be read.', 'critical')
        }
    }

    const numberFields = useMemo(() => schema.fields.filter(field => NUMBER_TYPES.has(field.type)), [schema.fields])
    const dateFields = useMemo(() => schema.fields.filter(field => DATE_TYPES.has(field.type)), [schema.fields])
    const [firstAxis, secondAxis] = chartAxes(chart.chart)

    const changeKind = (kind: ChartKind) =>
        set({
            chart: kind,
            thenBy: undefined,
            start: undefined,
            end: undefined,
            ...chartFieldsFor(kind, chart.chart, chart, schema.fields, schema.displayField),
            ...(kind === 'line' || kind === 'area' ? { order: 'field' as const } : {}),
        })

    return (
        <div className="tp-editor">
            <header className="tp-editor__bar">
                <Button variant="ghost" icon="arrowLeft" onClick={() => guarded(() => navigate('templates'))}>
                    Templates
                </Button>
                <div className="tp-editor__identity">
                    <Input
                        className="tp-editor__name"
                        value={meta.name}
                        maxLength={100}
                        readOnly={!canEdit}
                        onChange={event => setMeta({ ...meta, name: event.target.value })}
                        aria-label="Chart name"
                    />
                    <Badge tone="positive">{TEMPLATE_KIND_LABELS.chart}</Badge>
                    <span className="tp-subtle tp-truncate">
                        {meta.tableLabel || meta.table} <code>{meta.table}</code>
                    </span>
                    {dirty && <Badge tone="warning">Unsaved</Badge>}
                </div>
                <div className="tp-row">
                    {canEdit && (
                        <Button variant="primary" icon="save" busy={saving} disabled={!dirty} onClick={() => void save()}>
                            Save
                        </Button>
                    )}
                </div>
            </header>

            <div className="tp-editor__notices">
                {!canEdit && <Notice kind="info" lines={['You can look at this chart, but only Templater editors can change it.']} />}
                <Notice kind="critical" lines={saveError ? [saveError] : []} onDismiss={saveError ? () => setSaveError('') : undefined} />
                <Notice kind="warning" lines={parseNote ? [parseNote] : []} onDismiss={parseNote ? () => setParseNote('') : undefined} />
            </div>

            <div className="tp-chart-designer">
                <div className="tp-chart-designer__editor tp-stack">
                    <section className="tp-card">
                        <div className="tp-card__body tp-stack">
                            <h2 className="tp-card__title">Which records</h2>
                            <Field label="Table">
                                <TablePicker value={meta.table} label={meta.tableLabel} onChange={(table, label) => void changeTable(table, label)} />
                            </Field>
                            <Field
                                label="Filter"
                                hint={
                                    <>
                                        An encoded query; empty counts every record you can read. Build one in the{' '}
                                        <a href={`/${meta.table}_list.do`} target="_blank" rel="noreferrer">
                                            {meta.tableLabel || meta.table} list
                                        </a>{' '}
                                        and use “Copy query”.
                                    </>
                                }
                            >
                                <Textarea
                                    className="tp-mono"
                                    rows={2}
                                    value={meta.query}
                                    readOnly={!canEdit}
                                    spellCheck={false}
                                    onChange={event => setMeta({ ...meta, query: event.target.value })}
                                    placeholder="active=true"
                                />
                            </Field>
                            {shape === 'spans' ? (
                                <>
                                    <Field label="One bar for each record, named by" hint="Its short description, its number — what people know it by.">
                                        <FieldPicker
                                            fields={schema.fields}
                                            value={chart.groupBy}
                                            onChange={field => set({ groupBy: field.name })}
                                            aria-label="Bar name"
                                        />
                                    </Field>
                                    <div className="tp-grid tp-grid--2">
                                        <Field label="Starts">
                                            <FieldPicker
                                                fields={dateFields as SchemaField[]}
                                                value={chart.start ?? ''}
                                                placeholder={dateFields.length ? 'A date field' : 'This table has no date fields'}
                                                onChange={field => set({ start: field.name })}
                                                aria-label="Start date"
                                            />
                                        </Field>
                                        <Field label="Ends" hint="Empty, or before the start, is a milestone.">
                                            <FieldPicker
                                                fields={dateFields as SchemaField[]}
                                                value={chart.end ?? ''}
                                                placeholder="A date field"
                                                onChange={field => set({ end: field.name })}
                                                aria-label="End date"
                                            />
                                        </Field>
                                    </div>
                                </>
                            ) : (
                                <div className={shape === 'pairs' ? 'tp-grid tp-grid--2' : undefined}>
                                    <Field
                                        label={shape === 'pairs' ? `${firstAxis} for each` : 'One bar, point or slice for each'}
                                        hint="A choice, a reference, a true/false field — anything with few values."
                                    >
                                        <FieldPicker
                                            fields={schema.fields}
                                            value={chart.groupBy}
                                            onChange={field => set({ groupBy: field.name })}
                                            aria-label="Group by"
                                        />
                                    </Field>
                                    {shape === 'pairs' && (
                                        <Field label={`${secondAxis} for each`}>
                                            <FieldPicker
                                                fields={schema.fields}
                                                value={chart.thenBy ?? ''}
                                                placeholder="Choose a field"
                                                onChange={field => set({ thenBy: field.name })}
                                                aria-label="Then by"
                                            />
                                        </Field>
                                    )}
                                </div>
                            )}
                            {shape !== 'spans' && (
                                <div className="tp-grid tp-grid--2">
                                    <Field label="Measure">
                                        <Select<ChartMeasure>
                                            value={chart.measure}
                                            options={CHART_MEASURES.map(entry => ({
                                                value: entry.measure,
                                                label: entry.label,
                                            }))}
                                            onChange={measure =>
                                                set({ measure, field: measure === 'count' ? undefined : (chart.field ?? numberFields[0]?.name) })
                                            }
                                            aria-label="Measure"
                                        />
                                    </Field>
                                    {chart.measure !== 'count' && (
                                        <Field label="Of">
                                            <FieldPicker
                                                fields={numberFields as SchemaField[]}
                                                value={chart.field ?? ''}
                                                placeholder={numberFields.length ? 'A number field' : 'This table has no number fields'}
                                                onChange={field => set({ field: field.name })}
                                                aria-label="Measured field"
                                            />
                                        </Field>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="tp-card">
                        <div className="tp-card__body tp-stack">
                            <h2 className="tp-card__title">How it looks</h2>
                            <ChartKindSelect value={chart.chart} onChange={changeKind} />
                            <Field label="Title" hint="Tokens work: {{now.date}}, {{deck.title}}, and {{list.count}} for the records counted.">
                                <Input value={chart.title ?? ''} onChange={event => set({ title: event.target.value || undefined })} />
                            </Field>
                            {shape !== 'spans' && (
                                <Segmented<ChartTemplate['order']>
                                    label="Order"
                                    size="sm"
                                    value={chart.order}
                                    onChange={order => set({ order })}
                                    options={[
                                        { value: 'value', label: 'Largest first' },
                                        { value: 'field', label: 'The field’s own order' },
                                    ]}
                                />
                            )}
                            <div className="tp-grid tp-grid--2">
                                <Field label="Height in a document (pt)" hint="On a slide, the box it is drawn in decides.">
                                    <NumberInput
                                        min={40}
                                        max={600}
                                        value={chart.height}
                                        onChange={height => set({ height: height ?? 200 })}
                                        aria-label="Chart height"
                                    />
                                </Field>
                                {!paletteChart(chart.chart) && (
                                    <ColorField label="Colour" value={chart.color ?? ''} onChange={color => set({ color: color || undefined })} allowEmpty />
                                )}
                            </div>
                            <Switch
                                checked={chart.showValues ?? false}
                                onChange={showValues => set({ showValues: showValues || undefined })}
                                label={showValuesLabel(chart.chart)}
                            />
                            <Field label="When there is nothing to chart">
                                <Input
                                    value={chart.emptyText ?? ''}
                                    onChange={event => set({ emptyText: event.target.value || undefined })}
                                    placeholder="Leave empty to print nothing"
                                />
                            </Field>
                        </div>
                    </section>

                    <section className="tp-card">
                        <div className="tp-card__body tp-stack">
                            <h2 className="tp-card__title">About this chart</h2>
                            <Field label="Description">
                                <Textarea
                                    rows={2}
                                    value={meta.description}
                                    readOnly={!canEdit}
                                    onChange={event => setMeta({ ...meta, description: event.target.value })}
                                />
                            </Field>
                            <Switch
                                checked={meta.active}
                                disabled={!canEdit}
                                onChange={active => setMeta({ ...meta, active })}
                                label="Active — offered when adding a chart to a template or a slide"
                            />
                        </div>
                    </section>
                </div>

                <section className="tp-chart-designer__preview tp-preview" aria-label="Preview">
                    <header className="tp-preview__header">
                        <div className="tp-row tp-row--between">
                            <h3 className="tp-preview__title">Preview</h3>
                            <Segmented<Showing>
                                label="Shown"
                                size="sm"
                                value={showing}
                                onChange={setShowing}
                                options={[
                                    { value: 'document', label: 'In a document', icon: 'file' },
                                    { value: 'slide', label: 'On a slide', icon: 'slides' },
                                ]}
                            />
                        </div>
                        <p className="tp-subtle tp-row">
                            {grouped.loading ? (
                                <>
                                    <Spinner size={12} /> Counting…
                                </>
                            ) : grouped.data ? (
                                `${grouped.data.total.toLocaleString()} record${grouped.data.total === 1 ? '' : 's'}, ${grouped.data.points.length} ${
                                    shape === 'spans' ? 'with dates' : shape === 'pairs' ? 'pairs' : 'groups'
                                }, ${shape === 'spans' ? 'read' : 'counted'} now as you.`
                            ) : (
                                'Choose a field to group by.'
                            )}
                        </p>
                    </header>
                    <Notice kind="critical" lines={grouped.error ? [grouped.error] : []} />
                    <div ref={stage} className="tp-preview__stage">
                        <div className="tp-preview__slides">
                            {width > 0 && <SlideView template={sample.template} slide={sample.slide} width={Math.max(160, width - 24)} />}
                        </div>
                    </div>
                    <div className="tp-row tp-row--between">
                        <span className="tp-subtle">Place it with a Chart block in any template, or Insert › Chart on a custom slide.</span>
                        <Button size="sm" variant="secondary" icon="download" onClick={downloadPdf}>
                            Download PDF
                        </Button>
                    </div>
                </section>
            </div>

            <ConfirmModal
                open={pending !== null}
                title="Leave without saving?"
                message="Your changes to this chart have not been saved."
                confirmLabel="Discard changes"
                danger
                onConfirm={() => {
                    const go = pending
                    setPending(null)
                    setSaved(snapshot(meta, chart))
                    go?.()
                }}
                onCancel={() => setPending(null)}
            />
        </div>
    )
}

/**
 * The chart where it will be used: as a block on a page of a document, or as
 * an element filling most of a slide — with the deck starter's look, which is
 * the look a new deck has.
 */
function previewOf(
    showing: Showing,
    chart: LoadedChart,
    schema: TableSchema,
    session: ReturnType<typeof useSession>,
    title: string
): { template: PdfTemplate; job: RenderJob; slide: Slide } {
    const charts = { [chart.sysId]: chart }
    const values = contextValues(schema, session, title || 'Chart', 0)
    const job: RenderJob = { title: title || 'Chart', author: session.displayName, subject: title, records: [], coverValues: values, charts }
    const base = { key: 'preview', owner: -1, values, related: {}, charts, label: title || 'Chart', part: 1, parts: 1 }

    if (showing === 'document') {
        const block: ChartBlock = { type: 'chart', chart: chart.spec.chart, items: [], template: chart.sysId, height: chart.spec.height }
        // On the cover, which is drawn once with no record: a chart template belongs to no record.
        const template: PdfTemplate = {
            page: { ...DEFAULT_PAGE },
            cover: [block],
            blocks: [],
            footer: { text: '', showPageNumbers: false },
        }
        return { template, job, slide: { ...base, blocks: [block] } }
    }

    const deck = starterTemplate('deck')
    const { margins } = deck.page
    const sheet = pageDimensions(deck.page.size, deck.page.landscape)
    const custom: CustomSlide = {
        id: newId(),
        elements: [
            {
                type: 'chart',
                id: newId(),
                x: margins.left,
                y: margins.top,
                w: sheet.width - margins.left - margins.right,
                h: sheet.height - margins.top - margins.bottom,
                template: chart.sysId,
                name: chart.name,
            },
        ],
    }
    const template: PdfTemplate = { ...deck, cover: undefined, blocks: [], footer: { text: '', showPageNumbers: false } }
    return { template, job, slide: { ...base, owner: -2, blocks: [], custom } }
}
