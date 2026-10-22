import { TEMPLATE_KINDS as KINDS, type TemplateKind } from '../engine/template'
import { assertUnchanged, getJson, getList, query, request } from './http'
import { PRESENTATION_TABLE } from './presentations'

export const TEMPLATE_TABLE = 'x_1040823_template_template'
export const VERSION_TABLE = 'x_1040823_template_version'
const BASE = `/api/now/table/${TEMPLATE_TABLE}`

/** A template record as the app works with it. */
export type TemplateRecord = {
    sysId: string
    name: string
    kind: TemplateKind
    table: string
    tableLabel: string
    description: string
    active: boolean
    /** Default encoded query for decks and batch exports. */
    query: string
    orderBy: string
    limit: number
    updatedOn: string
    /** When it was last changed, as stored: for sorting. */
    updatedAt: string
    updatedBy: string
    /** How many times the body has been published. */
    version: number
    /** Whether there are saved changes that are not yet published. */
    hasDraft: boolean
    /** The platform's update counter, which tells whether someone else has saved since it was read. */
    modCount: number
    /** The published body. Only present when the template was read on its own. */
    body?: string
    /** The unpublished changes, when there are any. Only present when the template was read on its own. */
    draftBody?: string
}

export type TemplateInput = Omit<
    TemplateRecord,
    'sysId' | 'tableLabel' | 'updatedOn' | 'updatedAt' | 'updatedBy' | 'version' | 'hasDraft' | 'modCount' | 'draftBody'
> & {
    body: string
    /** Saved as unpublished changes; empty clears them. */
    draftBody?: string
    /** Kept with the version a publish makes. */
    publishNote?: string
}

/** One published version of a template, without its body. */
export type TemplateVersion = {
    sysId: string
    version: number
    note: string
    publishedBy: string
    publishedOn: string
}

/** Somewhere a chart template is placed. */
export type ChartUsage = { kind: 'template' | 'presentation'; sysId: string; name: string }

type Field = { value: string; display_value: string }
type ApiTemplate = Record<string, Field>

const LIST_FIELDS =
    'sys_id,name,kind,table,description,active,query,order_by,record_limit,sys_updated_on,sys_updated_by,version,has_draft,sys_mod_count'

const toRecord = (row: ApiTemplate): TemplateRecord => ({
    sysId: row.sys_id?.value ?? '',
    name: row.name?.value ?? '',
    kind: KINDS.includes(row.kind?.value as TemplateKind) ? (row.kind!.value as TemplateKind) : 'document',
    table: row.table?.value ?? '',
    tableLabel: row.table?.display_value || row.table?.value || '',
    description: row.description?.value ?? '',
    active: row.active?.value !== 'false',
    query: row.query?.value ?? '',
    orderBy: row.order_by?.value ?? '',
    limit: Number(row.record_limit?.value) || 50,
    updatedOn: row.sys_updated_on?.display_value ?? '',
    updatedAt: row.sys_updated_on?.value ?? '',
    updatedBy: row.sys_updated_by?.display_value ?? '',
    version: Number(row.version?.value) || 0,
    hasDraft: row.has_draft?.value === 'true',
    modCount: Number(row.sys_mod_count?.value) || 0,
    ...(row.body ? { body: row.body.value ?? '' } : {}),
    ...(row.draft_body?.value ? { draftBody: row.draft_body.value } : {}),
})

const toApi = (input: Partial<TemplateInput>): Record<string, string> => {
    const out: Record<string, string> = {}
    if (input.name !== undefined) out.name = input.name
    if (input.kind !== undefined) out.kind = input.kind
    if (input.table !== undefined) out.table = input.table
    if (input.description !== undefined) out.description = input.description
    if (input.active !== undefined) out.active = String(input.active)
    if (input.query !== undefined) out.query = input.query
    if (input.orderBy !== undefined) out.order_by = input.orderBy
    if (input.limit !== undefined) out.record_limit = String(input.limit)
    if (input.body !== undefined) out.body = input.body
    if (input.draftBody !== undefined) out.draft_body = input.draftBody
    if (input.publishNote !== undefined) out.publish_note = input.publishNote
    return out
}

const one = (sysId: string) =>
    `${BASE}/${encodeURIComponent(sysId)}?${query({
        sysparm_fields: `${LIST_FIELDS},body,draft_body`,
        sysparm_display_value: 'all',
        sysparm_exclude_reference_link: 'true',
    })}`

export const TemplateService = {
    async list(
        options: { tables?: string[]; kind?: TemplateKind; activeOnly?: boolean } = {}
    ): Promise<TemplateRecord[]> {
        const conditions = [
            options.activeOnly ? 'active=true' : '',
            options.kind ? `kind=${options.kind}` : '',
            options.tables?.length ? `tableIN${options.tables.join(',')}` : '',
        ].filter(Boolean)
        const { result } = await getList<ApiTemplate>(
            `${BASE}?${query({
                sysparm_query: [...conditions, 'ORDERBYname'].join('^'),
                sysparm_fields: LIST_FIELDS,
                sysparm_display_value: 'all',
                sysparm_exclude_reference_link: 'true',
                sysparm_limit: 500,
            })}`
        )
        return result.map(toRecord)
    },

    async get(sysId: string): Promise<TemplateRecord> {
        const { result } = await getJson<{ result: ApiTemplate }>(one(sysId))
        return toRecord(result)
    },

    async create(input: TemplateInput): Promise<TemplateRecord> {
        const { result } = await getJson<{ result: ApiTemplate }>(
            `${BASE}?${query({
                sysparm_display_value: 'all',
                sysparm_exclude_reference_link: 'true',
                sysparm_fields: `${LIST_FIELDS},body,draft_body`,
            })}`,
            { method: 'POST', body: JSON.stringify(toApi(input)) }
        )
        return toRecord(result)
    },

    /**
     * Saves changes. With `expect`, the update counter the record was read
     * at, a save on top of someone else's is refused with a `ConflictError`.
     */
    async update(
        sysId: string,
        input: Partial<TemplateInput>,
        options: { expect?: number } = {}
    ): Promise<TemplateRecord> {
        if (options.expect !== undefined) await assertUnchanged(TEMPLATE_TABLE, sysId, options.expect)
        const { result } = await getJson<{ result: ApiTemplate }>(one(sysId), {
            method: 'PATCH',
            body: JSON.stringify(toApi(input)),
        })
        return toRecord(result)
    },

    async remove(sysId: string): Promise<void> {
        await request(`${BASE}/${encodeURIComponent(sysId)}`, { method: 'DELETE' })
    },

    /** A template's published versions, newest first. */
    async versions(sysId: string): Promise<TemplateVersion[]> {
        const { result } = await getList<Record<string, Field>>(
            `/api/now/table/${VERSION_TABLE}?${query({
                sysparm_query: `template=${sysId}^ORDERBYDESCversion`,
                sysparm_fields: 'sys_id,version,note,sys_created_by,sys_created_on',
                sysparm_display_value: 'all',
                sysparm_limit: 200,
            })}`
        )
        return result.map(row => ({
            sysId: row.sys_id?.value ?? '',
            version: Number(row.version?.value) || 0,
            note: row.note?.value ?? '',
            publishedBy: row.sys_created_by?.display_value ?? '',
            publishedOn: row.sys_created_on?.display_value ?? '',
        }))
    },

    /** The body of one version. */
    async versionBody(sysId: string): Promise<string> {
        const { result } = await getJson<{ result: Record<string, string> }>(
            `/api/now/table/${VERSION_TABLE}/${encodeURIComponent(sysId)}?${query({ sysparm_fields: 'body' })}`
        )
        return result.body ?? ''
    },

    /**
     * Where a chart template is placed: the templates (published or in a
     * draft) and the presentations whose bodies name it.
     */
    async chartUsages(sysId: string): Promise<ChartUsage[]> {
        const [templates, presentations] = await Promise.all([
            getList<Record<string, string>>(
                `${BASE}?${query({
                    sysparm_query: `bodyLIKE${sysId}^ORdraft_bodyLIKE${sysId}^sys_id!=${sysId}^ORDERBYname`,
                    sysparm_fields: 'sys_id,name',
                    sysparm_limit: 100,
                })}`
            ),
            getList<Record<string, string>>(
                `/api/now/table/${PRESENTATION_TABLE}?${query({
                    sysparm_query: `bodyLIKE${sysId}^ORDERBYname`,
                    sysparm_fields: 'sys_id,name',
                    sysparm_limit: 100,
                })}`
            ),
        ])
        return [
            ...templates.result.map(row => ({
                kind: 'template' as const,
                sysId: row.sys_id ?? '',
                name: row.name ?? '',
            })),
            ...presentations.result.map(row => ({
                kind: 'presentation' as const,
                sysId: row.sys_id ?? '',
                name: row.name ?? '',
            })),
        ]
    },
}
