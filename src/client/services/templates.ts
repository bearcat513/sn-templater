import type { TemplateKind } from '../engine/template'
import { getJson, getList, query, request } from './http'

export const TEMPLATE_TABLE = 'x_1040823_template_template'
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
    updatedBy: string
    /** Only present when the template was read on its own. */
    body?: string
}

export type TemplateInput = Omit<TemplateRecord, 'sysId' | 'tableLabel' | 'updatedOn' | 'updatedBy'> & {
    body: string
}

type Field = { value: string; display_value: string }
type ApiTemplate = Record<string, Field>

const LIST_FIELDS = 'sys_id,name,kind,table,description,active,query,order_by,record_limit,sys_updated_on,sys_updated_by'

const toRecord = (row: ApiTemplate): TemplateRecord => ({
    sysId: row.sys_id?.value ?? '',
    name: row.name?.value ?? '',
    kind: row.kind?.value === 'deck' ? 'deck' : 'document',
    table: row.table?.value ?? '',
    tableLabel: row.table?.display_value || row.table?.value || '',
    description: row.description?.value ?? '',
    active: row.active?.value !== 'false',
    query: row.query?.value ?? '',
    orderBy: row.order_by?.value ?? '',
    limit: Number(row.record_limit?.value) || 50,
    updatedOn: row.sys_updated_on?.display_value ?? '',
    updatedBy: row.sys_updated_by?.display_value ?? '',
    ...(row.body ? { body: row.body.value ?? '' } : {}),
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
    return out
}

export const TemplateService = {
    async list(options: { tables?: string[]; kind?: TemplateKind; activeOnly?: boolean } = {}): Promise<TemplateRecord[]> {
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
        const { result } = await getJson<{ result: ApiTemplate }>(
            `${BASE}/${encodeURIComponent(sysId)}?${query({
                sysparm_fields: `${LIST_FIELDS},body`,
                sysparm_display_value: 'all',
                sysparm_exclude_reference_link: 'true',
            })}`
        )
        return toRecord(result)
    },

    async create(input: TemplateInput): Promise<TemplateRecord> {
        const { result } = await getJson<{ result: ApiTemplate }>(
            `${BASE}?${query({ sysparm_display_value: 'all', sysparm_fields: `${LIST_FIELDS},body` })}`,
            { method: 'POST', body: JSON.stringify(toApi(input)) }
        )
        return toRecord(result)
    },

    async update(sysId: string, input: Partial<TemplateInput>): Promise<TemplateRecord> {
        const { result } = await getJson<{ result: ApiTemplate }>(
            `${BASE}/${encodeURIComponent(sysId)}?${query({
                sysparm_display_value: 'all',
                sysparm_fields: `${LIST_FIELDS},body`,
            })}`,
            { method: 'PATCH', body: JSON.stringify(toApi(input)) }
        )
        return toRecord(result)
    },

    async remove(sysId: string): Promise<void> {
        await request(`${BASE}/${encodeURIComponent(sysId)}`, { method: 'DELETE' })
    },
}
