import type { ChartMeasure } from '../engine/template'
import { andQuery, getJson, HttpError, query } from './http'
import { RecordService, type ApiRecord } from './records'

/** One group: what it is called — and its second label, grouped by two fields — the measure of it, and how many records are in it. */
export type Group = { label: string; to?: string; value: number; count: number }

export type Grouped = {
    /** In the grouping field's own order. */
    groups: Group[]
    /** Records counted, across every group. */
    total: number
    /** Set when the rows were counted here and there were more than were read. */
    read?: number
}

export type GroupRequest = {
    table: string
    query?: string
    groupBy: string
    /** A second field, for a chart of pairs: each group is one value of both. */
    thenBy?: string
    measure: ChartMeasure
    /** The number field for any measure but a count. */
    field?: string
}

/** Rows read, at most, when the Aggregate API is not open to this person and the counting is done here. */
export const MAX_COUNTED_ROWS = 2000

const EMPTY = '(empty)'

type StatsEntry = {
    stats?: Record<string, string | Record<string, string>>
    groupby_fields?: { field?: string; value?: string; display_value?: string }[]
}

/**
 * Records grouped by a field and measured, as the signed-in user.
 *
 * The Aggregate API counts on the instance, so a chart of a hundred thousand
 * incidents is one small request, and its ACLs are the Table API's. Where an
 * instance keeps that API from someone, the rows are read through the Table
 * API instead — at most `MAX_COUNTED_ROWS` of them — and grouped here, and
 * the result says how many were read so the chart can say so too.
 */
export const AggregateService = {
    async group(request: GroupRequest): Promise<Grouped> {
        try {
            return await viaStats(request)
        } catch (failure) {
            if (failure instanceof HttpError && (failure.status === 403 || failure.status === 400))
                return viaRows(request)
            throw failure
        }
    },

    /**
     * Records as spans of time, for a Gantt chart: what each is called and its
     * stored start and end, earliest first. A span is drawn per record, so
     * these are read rather than counted, at most `limit` of them.
     */
    async spans(request: SpanRequest): Promise<Spans> {
        const { table, query: encoded, label, start, end, limit } = request
        const { records, total } = await RecordService.list(table, {
            query: encoded,
            orderBy: start,
            limit,
            fields: [...new Set(['sys_id', label, start, end ?? ''].filter(Boolean))],
        })
        const spans = records.map(row => ({
            label: both(row, label).display.trim() || EMPTY,
            start: both(row, start).value,
            end: end ? both(row, end).value : '',
        }))
        return { spans, total, ...(total > records.length ? { read: records.length } : {}) }
    },
}

export type SpanRequest = { table: string; query?: string; label: string; start: string; end?: string; limit: number }

/** Each record's name and stored dates, as text: the chart reads them as dates. */
export type Spans = { spans: { label: string; start: string; end: string }[]; total: number; read?: number }

async function viaStats({ table, query: encoded, groupBy, thenBy, measure, field }: GroupRequest): Promise<Grouped> {
    const measured = measure !== 'count' && field ? field : ''
    const { result } = await getJson<{ result: StatsEntry[] | StatsEntry }>(
        `/api/now/stats/${encodeURIComponent(table)}?${query({
            sysparm_query: andQuery(encoded),
            sysparm_group_by: thenBy ? `${groupBy},${thenBy}` : groupBy,
            sysparm_order_by: groupBy,
            sysparm_count: 'true',
            sysparm_display_value: 'all',
            ...(measured ? { [`sysparm_${measure}_fields`]: measured } : {}),
        })}`
    )
    // Grouped, the API answers with a list; a table with no rows at all can answer with one object.
    const entries = Array.isArray(result) ? result : []
    let total = 0
    const groups = entries.map((entry): Group => {
        const stats = entry.stats ?? {}
        const count = Number(stats.count) || 0
        total += count
        const named = (name: string, at: number) => {
            const by = entry.groupby_fields?.find(group => group.field === name) ?? entry.groupby_fields?.[at]
            return String(by?.display_value ?? by?.value ?? '').trim() || EMPTY
        }
        const figure = measured ? Number((stats[measure] as Record<string, string> | undefined)?.[measured]) : count
        return {
            label: named(groupBy, 0),
            ...(thenBy ? { to: named(thenBy, 1) } : {}),
            value: Number.isFinite(figure) ? figure : 0,
            count,
        }
    })
    return { groups: merge(groups, measure), total }
}

/** The display value and stored value of one field of a row. */
const both = (row: ApiRecord, name: string): { value: string; display: string } => {
    const cell = row[name]
    if (cell && typeof cell === 'object')
        return { value: String(cell.value ?? ''), display: String(cell.display_value ?? cell.value ?? '') }
    return { value: String(cell ?? ''), display: String(cell ?? '') }
}

async function viaRows({ table, query: encoded, groupBy, thenBy, measure, field }: GroupRequest): Promise<Grouped> {
    const measured = measure !== 'count' && field ? field : ''
    const { records, total } = await RecordService.list(table, {
        query: encoded,
        orderBy: groupBy,
        limit: MAX_COUNTED_ROWS,
        fields: [...new Set(['sys_id', groupBy, thenBy ?? '', measured].filter(Boolean))],
    })
    // Grouped by display value, in the order the rows came — the grouping field's own.
    const buckets = new Map<string, { label: string; to?: string; figures: number[] }>()
    for (const row of records) {
        const label = both(row, groupBy).display.trim() || EMPTY
        const to = thenBy ? both(row, thenBy).display.trim() || EMPTY : undefined
        const figure = measured ? Number(both(row, measured).value) : 1
        const key = JSON.stringify([label, to])
        const bucket = buckets.get(key) ?? { label, ...(to !== undefined ? { to } : {}), figures: [] }
        bucket.figures.push(figure)
        buckets.set(key, bucket)
    }
    const groups = [...buckets.values()].map(({ figures, ...names }): Group => {
        const numbers = figures.filter(Number.isFinite)
        return { ...names, value: summarise(measure, numbers, figures.length), count: figures.length }
    })
    return { groups, total, ...(total > records.length ? { read: records.length } : {}) }
}

function summarise(measure: ChartMeasure, numbers: number[], count: number): number {
    if (measure === 'count') return count
    if (!numbers.length) return 0
    if (measure === 'sum') return numbers.reduce((sum, value) => sum + value, 0)
    if (measure === 'avg') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    return measure === 'min' ? Math.min(...numbers) : Math.max(...numbers)
}

/**
 * Groups that print the same, merged: two references to records with the same
 * name, or an empty value stored two ways, are one bar to the reader.
 */
function merge(groups: Group[], measure: ChartMeasure): Group[] {
    const seen = new Map<string, Group>()
    for (const group of groups) {
        const key = JSON.stringify([group.label, group.to])
        const earlier = seen.get(key)
        if (!earlier) {
            seen.set(key, { ...group })
            continue
        }
        const count = earlier.count + group.count
        earlier.value =
            measure === 'avg'
                ? count
                    ? (earlier.value * earlier.count + group.value * group.count) / count
                    : 0
                : measure === 'min'
                  ? Math.min(earlier.value, group.value)
                  : measure === 'max'
                    ? Math.max(earlier.value, group.value)
                    : earlier.value + group.value
        earlier.count = count
    }
    return [...seen.values()]
}
