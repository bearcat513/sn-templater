import type { RecordSource, RelatedRows, RenderJob } from '../engine/render'
import {
    DEFAULT_RELATED_LIMIT,
    MAX_RELATED_ROWS,
    chartTemplateIds,
    relatedBlocks,
    relatedKey,
    type PdfTemplate,
    type RelatedListBlock,
} from '../engine/template'
import { recordFieldPaths, recordValues, rowValues, specimenValues, type SchemaField } from '../engine/vocabulary'
import { recordUrl } from '../engine/links'
import { andQuery } from '../services/http'
import { log } from '../debug/log'
import { loadCharts } from './charts'
import { RecordService, type ApiRecord } from '../services/records'
import type { SessionContext, TableSchema } from '../services/schema'

/** Which records to draw: one or more by sys_id, or whatever a query matches. */
export type RecordSelection =
    | { kind: 'ids'; sysIds: string[] }
    | { kind: 'query'; query: string; orderBy?: string; limit: number }

export type LoadOptions = {
    template: PdfTemplate
    schema: TableSchema
    session: SessionContext
    /** The batch's title: `{{deck.title}}`. */
    title: string
    selection: RecordSelection
    signal?: AbortSignal
    onProgress?: (done: number, total: number) => void
}

export type LoadResult = {
    job: RenderJob
    /** How many records matched, which may be more than were loaded. */
    matched: number
}

/** The hardest stop on one render: past this a deck is a report, and a browser tab is not a print server. */
export const MAX_RECORDS = 500

/** How many related-list requests may be in flight at once. */
const CONCURRENCY = 4

/** The instance the page is served from: what `{{url.instance}}` is, and what paths in links are relative to. */
export const instanceUrl = (): string => (typeof window === 'undefined' ? '' : window.location.origin)

/** Tokens that belong to the batch and the session rather than to a record. */
export function contextValues(
    schema: Pick<TableSchema, 'name' | 'label'>,
    session: SessionContext,
    title: string,
    count: number,
    index?: number
): Record<string, string> {
    return {
        'table.label': schema.label,
        'table.name': schema.name,
        'now.date': session.date,
        'now.datetime': session.dateTime,
        'user.name': session.displayName,
        'user.email': session.email,
        'deck.title': title,
        'deck.count': String(count),
        'deck.index': index === undefined ? '' : String(index + 1),
        'url.instance': instanceUrl(),
    }
}

/** A record's own links: set per record, so the cover — which has no record — reports them as unknown. */
const recordLinks = (table: string, sysId: string): Record<string, string> =>
    sysId ? { 'url.record': recordUrl(instanceUrl(), table, sysId) } : {}

/** Runs `work` over `items` with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>, signal?: AbortSignal) {
    let next = 0
    const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
            await work(items[next++]!)
        }
    })
    await Promise.all(lanes)
}

/** A field's stored value, whichever shape the Table API sent it in. */
const storedValue = (field: ApiRecord[string]): string =>
    field && typeof field === 'object' ? String(field.value ?? '') : String(field ?? '')

/**
 * The rows for one related list under one parent record.
 *
 * The link field comes back with every row and each row is checked against
 * the parent. The Table API drops a query term naming a field the table
 * does not have, so a list linked by a missing field would otherwise match
 * every row on the table — a PDF of someone else's records. A column the
 * table lacks is harmless (it prints blank); a link the table lacks is not.
 */
async function loadRelated(block: RelatedListBlock, parentId: string): Promise<RelatedRows> {
    const fields = [...new Set(['sys_id', block.field, ...block.columns.map(column => column.field)])]
    try {
        const { records, total } = await RecordService.list(block.table, {
            query: andQuery(`${block.field}=${parentId}`, block.query),
            orderBy: block.orderBy,
            limit: Math.min(block.limit ?? DEFAULT_RELATED_LIMIT, MAX_RELATED_ROWS),
            fields,
            displayValue: 'all',
        })
        if (records.length && !(block.field in records[0]!)) {
            return { rows: [], total: 0, error: `${block.table} has no readable field “${block.field}” to link it to this record` }
        }
        const linked = records.filter(record => storedValue(record[block.field]) === parentId)
        // Anything left over did not belong to this record; the count would be wrong too.
        if (linked.length !== records.length) {
            return { rows: [], total: 0, error: `${block.table}.${block.field} did not filter by this record` }
        }
        return { rows: linked.map(rowValues), total }
    } catch (failure) {
        return { rows: [], total: 0, error: failure instanceof Error ? failure.message : 'could not be read' }
    }
}

/** What a record is called in the editor and the presenter. */
function labelOf(record: ApiRecord, schema: TableSchema): string {
    const pick = (field: string) => {
        const value = record[field]
        return value && typeof value === 'object' ? String(value.display_value ?? '') : String(value ?? '')
    }
    return pick('number') || (schema.displayField ? pick(schema.displayField) : '') || pick('sys_id')
}

/**
 * Fetches everything a template needs to draw a set of records, and nothing
 * else: the fields its tokens name, and the rows its related lists name.
 *
 * Every request runs as the signed-in user, so the records, the fields and the
 * related rows are exactly the ones their ACLs allow.
 */
export async function loadRecords(options: LoadOptions): Promise<LoadResult> {
    const { template, schema, session, title, selection, signal } = options
    const paths = recordFieldPaths(template)
    const fields = [...new Set([...paths, 'sys_id', 'number', schema.displayField].filter(Boolean))]
    const done = log.time('loader', `Loaded “${title}” from ${schema.name}`)
    log.debug('loader', `Reading ${schema.name}`, { selection, fields })

    /* 1 — the records. */

    let records: ApiRecord[]
    let matched: number
    if (selection.kind === 'ids' && selection.sysIds.length === 1) {
        records = [await RecordService.get(schema.name, selection.sysIds[0]!, fields)]
        matched = 1
    } else {
        const encoded = selection.kind === 'ids' ? `sys_idIN${selection.sysIds.join(',')}` : selection.query
        const limit = selection.kind === 'ids' ? selection.sysIds.length : selection.limit
        const result = await RecordService.list(schema.name, {
            query: encoded,
            orderBy: selection.kind === 'query' ? selection.orderBy : undefined,
            limit: Math.max(1, Math.min(limit, MAX_RECORDS)),
            fields,
        })
        records = result.records
        matched = result.total
        // Picked by hand, the records come back in the order they were picked.
        if (selection.kind === 'ids') {
            const order = new Map(selection.sysIds.map((id, index) => [id, index]))
            const idOf = (record: ApiRecord) => {
                const field = record.sys_id
                return field && typeof field === 'object' ? String(field.value ?? '') : String(field ?? '')
            }
            records.sort((a, b) => (order.get(idOf(a)) ?? 0) - (order.get(idOf(b)) ?? 0))
        }
    }

    const count = records.length
    const sources: RecordSource[] = records.map((record, index) => ({
        label: labelOf(record, schema),
        values: {
            ...recordValues(record, paths),
            ...contextValues(schema, session, title, count, index),
            ...recordLinks(schema.name, storedValue(record.sys_id)),
        },
        related: {},
    }))

    /* 2 — the related lists, one request per list per record. */

    const blocks = uniqueBlocks(relatedBlocks(template))
    const jobs: { source: RecordSource; block: RelatedListBlock; parentId: string }[] = []
    sources.forEach(source => {
        const parentId = source.values['raw.sys_id'] ?? ''
        if (parentId) for (const block of blocks) jobs.push({ source, block, parentId })
    })

    let finished = 0
    options.onProgress?.(0, jobs.length)
    // The chart templates count their own tables, once for every record, alongside the related lists.
    const charts = loadCharts(chartTemplateIds(template))
    await pool(
        jobs,
        CONCURRENCY,
        async ({ source, block, parentId }) => {
            const rows = await loadRelated(block, parentId)
            if (rows.error) log.warn('loader', `Related list ${block.table}.${block.field} on ${source.label}: ${rows.error}`, block)
            source.related[relatedKey(block)] = rows
            options.onProgress?.(++finished, jobs.length)
        },
        signal
    )
    done({ records: count, matched, relatedRequests: jobs.length, relatedLists: blocks.length })

    return {
        matched,
        job: {
            title,
            author: session.displayName,
            subject: `${schema.label} — ${title}`,
            records: sources,
            coverValues: contextValues(schema, session, title, count),
            charts: await charts,
        },
    }
}

/** Blocks asking for the same rows are fetched once. */
function uniqueBlocks(blocks: RelatedListBlock[]): RelatedListBlock[] {
    const seen = new Map<string, RelatedListBlock>()
    for (const block of blocks) if (!seen.has(relatedKey(block))) seen.set(relatedKey(block), block)
    return [...seen.values()]
}

/**
 * A record that is not there: every field reads as its own label, and every
 * related list has three rows of its own column headings. What the editor
 * draws before a real record is chosen, so a template is never designed blind.
 */
export function specimenJob(
    template: PdfTemplate,
    schema: TableSchema,
    session: SessionContext,
    title: string
): RenderJob {
    const paths = recordFieldPaths(template)
    const related: Record<string, RelatedRows> = {}
    for (const block of relatedBlocks(template)) {
        // Each column's stored value a date, a little later than the column before: a Gantt chart has bars to draw.
        const day = 86_400_000
        const rows = [1, 2, 3].map(n =>
            Object.fromEntries(
                block.columns.flatMap((column, index) => [
                    [column.field, `‹${column.header || column.field}› ${n}`],
                    [`raw.${column.field}`, new Date(Date.UTC(2026, 0, 5) + (n * 9 + index * 12) * day).toISOString().slice(0, 10)],
                ])
            )
        )
        related[relatedKey(block)] = { rows, total: 3 }
    }
    return {
        title,
        author: session.displayName,
        subject: `${schema.label} — ${title}`,
        records: [
            {
                label: 'Specimen',
                values: {
                    ...specimenValues(paths, schema.fields as SchemaField[]),
                    'raw.sys_id': '‹sys_id›',
                    ...contextValues(schema, session, title, 1, 0),
                    'url.record': `${instanceUrl()}/${schema.name}.do`,
                },
                related,
            },
        ],
        coverValues: contextValues(schema, session, title, 1),
    }
}
