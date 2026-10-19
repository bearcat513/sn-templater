import { useEffect, useMemo, useState } from 'react'
import { useAsync } from '../hooks/useAsync'
import { MAX_SPANS, chartPoints, spanPoints, type ChartDatum, type LoadedChart } from '../engine/chart'
import type { RenderJob } from '../engine/render'
import { chartShape, starterChart, type ChartTemplate } from '../engine/template'
import { readChartTemplate } from '../engine/validate'
import { log } from '../debug/log'
import { AggregateService } from '../services/aggregate'
import { TemplateService } from '../services/templates'

/**
 * Chart templates, read and counted.
 *
 * A chart template counts its own table, whatever record or slide it is shown
 * with, so one count serves every place it appears. Counts are kept for a
 * short while — long enough that the builder, its thumbnails and the
 * presenter opened from it share one, short enough that a deck opened again
 * later is counted again.
 */

const KEEP_FOR_MS = 60_000

const kept = new Map<string, { at: number; chart: Promise<LoadedChart> }>()

/** What a chart template counts: its table, its filter, and how it groups and measures. */
export type ChartSource = { sysId: string; name: string; table: string; query: string; spec: ChartTemplate }

/** What a chart template's records come to, before they are put in order: its groups, its pairs or its spans. */
export type Measured = { points: ChartDatum[]; total: number; read?: number }

/**
 * A chart template's records, as its kind wants them: grouped by one field
 * and measured, grouped by two into pairs, or — for a Gantt chart — read a
 * record at a time, as spans between two dates.
 */
export async function measureChart(table: string, query: string, spec: ChartTemplate): Promise<Measured> {
    const shape = chartShape(spec.chart)
    if (!spec.groupBy) throw new Error(shape === 'spans' ? 'it has no field to name each bar by' : 'it has no field to group by')
    if (shape === 'spans') {
        if (!spec.start) throw new Error('it has no start date')
        const read = await AggregateService.spans({ table, query, label: spec.groupBy, start: spec.start, end: spec.end, limit: MAX_SPANS })
        return { points: spanPoints(read.spans), total: read.total, ...(read.read ? { read: read.read } : {}) }
    }
    if (shape === 'pairs' && !spec.thenBy) throw new Error('it has no second field to pair the first with')
    const grouped = await AggregateService.group({
        table,
        query,
        groupBy: spec.groupBy,
        ...(shape === 'pairs' ? { thenBy: spec.thenBy } : {}),
        measure: spec.measure,
        field: spec.field,
    })
    return {
        points: grouped.groups.map(group => ({ label: group.label, value: group.value, ...(group.to !== undefined ? { to: group.to } : {}) })),
        total: grouped.total,
        ...(grouped.read ? { read: grouped.read } : {}),
    }
}

/** The sentence under a chart that shows less than every record. */
export const measuredNote = (spec: ChartTemplate, measured: Measured): string | undefined =>
    measured.read
        ? chartShape(spec.chart) === 'spans'
            ? `Drawn from the first ${measured.read.toLocaleString()} of ${measured.total.toLocaleString()} records, earliest first.`
            : `Counted from the first ${measured.read.toLocaleString()} of ${measured.total.toLocaleString()} records.`
        : undefined

/**
 * Counts a chart: its records grouped and measured on the instance, put in
 * the order and folded as its look wants. A failure is a chart with an error
 * rather than a rejection, so one broken chart does not stop a deck.
 */
export async function countChart(source: ChartSource): Promise<LoadedChart> {
    const { spec } = source
    const base = { sysId: source.sysId, name: source.name, table: source.table, spec }
    try {
        const measured = await measureChart(source.table, source.query, spec)
        const note = measuredNote(spec, measured)
        return { ...base, points: chartPoints(spec, measured.points), total: measured.total, ...(note ? { note } : {}) }
    } catch (failure) {
        return { ...base, points: [], total: 0, error: failure instanceof Error ? failure.message : 'it could not be counted' }
    }
}

async function readAndCount(sysId: string): Promise<LoadedChart> {
    try {
        const record = await TemplateService.get(sysId)
        if (record.kind !== 'chart') {
            return { sysId, name: record.name, table: record.table, spec: starterChart(), points: [], total: 0, error: 'it is not a chart template' }
        }
        const read = readChartTemplate(record.body ?? '', [], record.tableLabel)
        if (!read.ok) return { sysId, name: record.name, table: record.table, spec: starterChart(), points: [], total: 0, error: read.error }
        return await countChart({ sysId, name: record.name, table: record.table, query: record.query, spec: read.value })
    } catch (failure) {
        const message = failure instanceof Error ? failure.message : 'it could not be read'
        return { sysId, name: '', table: '', spec: starterChart(), points: [], total: 0, error: message }
    }
}

/** One chart template, counted — or the count already kept for it. */
export function loadChart(sysId: string): Promise<LoadedChart> {
    const entry = kept.get(sysId)
    if (entry && Date.now() - entry.at < KEEP_FOR_MS) return entry.chart
    const chart = readAndCount(sysId).then(loaded => {
        if (loaded.error) log.warn('charts', `Chart ${loaded.name || sysId}: ${loaded.error}`)
        return loaded
    })
    kept.set(sysId, { at: Date.now(), chart })
    return chart
}

/** Several chart templates, counted at once, by sys_id. */
export async function loadCharts(sysIds: string[]): Promise<Record<string, LoadedChart>> {
    const charts = await Promise.all([...new Set(sysIds)].map(loadChart))
    return Object.fromEntries(charts.map(chart => [chart.sysId, chart]))
}

/** The chart templates there are, to choose one to place. */
export const useChartTemplates = () => useAsync(() => TemplateService.list({ kind: 'chart' }), [])

/** A chart template was saved: the next place it is shown counts it again. */
export const forgetChart = (sysId: string): void => void kept.delete(sysId)

/** A job with these charts on it as well as its own. */
export const withCharts = (job: RenderJob, charts: Record<string, LoadedChart>): RenderJob =>
    Object.keys(charts).length ? { ...job, charts: { ...job.charts, ...charts } } : job

/**
 * The chart templates a view shows, counted, as they arrive. Ones already on
 * hand are not asked for again, so adding a chart to a slide counts only it.
 */
export function useCharts(sysIds: string[]): Record<string, LoadedChart> {
    const [charts, setCharts] = useState<Record<string, LoadedChart>>({})
    const wanted = useMemo(() => [...new Set(sysIds)].sort().join(','), [sysIds])

    useEffect(() => {
        const missing = wanted ? wanted.split(',').filter(id => !charts[id]) : []
        if (!missing.length) return
        let live = true
        void loadCharts(missing).then(loaded => live && setCharts(current => ({ ...current, ...loaded })))
        return () => {
            live = false
        }
        // `charts` is read, not watched: what has arrived is not a reason to ask again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wanted])

    return charts
}
