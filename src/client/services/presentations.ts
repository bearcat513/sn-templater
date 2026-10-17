import { getJson, getList, query, request } from './http'

export const PRESENTATION_TABLE = 'x_1040823_template_presentation'
const BASE = `/api/now/table/${PRESENTATION_TABLE}`

/** A saved presentation as the app works with it. */
export type PresentationRecord = {
    sysId: string
    name: string
    /** The deck template's sys_id; empty once that template has been deleted. */
    template: string
    templateName: string
    title: string
    query: string
    orderBy: string
    limit: number
    updatedOn: string
    /** User names, as the platform records them — `createdBy` is who may change it. */
    createdBy: string
    updatedBy: string
    /** Only present when the presentation was read on its own. */
    body?: string
}

export type PresentationInput = Pick<PresentationRecord, 'name' | 'template' | 'title' | 'query' | 'orderBy' | 'limit'> & {
    body: string
}

type Field = { value: string; display_value: string }
type ApiPresentation = Record<string, Field>

const LIST_FIELDS = 'sys_id,name,template,title,query,order_by,record_limit,sys_updated_on,sys_created_by,sys_updated_by'

const toRecord = (row: ApiPresentation): PresentationRecord => ({
    sysId: row.sys_id?.value ?? '',
    name: row.name?.value ?? '',
    template: row.template?.value ?? '',
    templateName: row.template?.display_value ?? '',
    title: row.title?.value ?? '',
    query: row.query?.value ?? '',
    orderBy: row.order_by?.value ?? '',
    limit: Number(row.record_limit?.value) || 20,
    updatedOn: row.sys_updated_on?.display_value ?? '',
    createdBy: row.sys_created_by?.value ?? '',
    updatedBy: row.sys_updated_by?.display_value ?? '',
    ...(row.body ? { body: row.body.value ?? '' } : {}),
})

const toApi = (input: Partial<PresentationInput>): Record<string, string> => {
    const out: Record<string, string> = {}
    if (input.name !== undefined) out.name = input.name
    if (input.template !== undefined) out.template = input.template
    if (input.title !== undefined) out.title = input.title
    if (input.query !== undefined) out.query = input.query
    if (input.orderBy !== undefined) out.order_by = input.orderBy
    if (input.limit !== undefined) out.record_limit = String(input.limit)
    if (input.body !== undefined) out.body = input.body
    return out
}

const read = (sysId: string, params: Record<string, string>) =>
    `${BASE}/${encodeURIComponent(sysId)}?${query({
        sysparm_fields: `${LIST_FIELDS},body`,
        sysparm_display_value: 'all',
        sysparm_exclude_reference_link: 'true',
        ...params,
    })}`

export const PresentationService = {
    async list(): Promise<PresentationRecord[]> {
        const { result } = await getList<ApiPresentation>(
            `${BASE}?${query({
                sysparm_query: 'ORDERBYDESCsys_updated_on',
                sysparm_fields: LIST_FIELDS,
                sysparm_display_value: 'all',
                sysparm_exclude_reference_link: 'true',
                sysparm_limit: 200,
            })}`
        )
        return result.map(toRecord)
    },

    async get(sysId: string): Promise<PresentationRecord> {
        const { result } = await getJson<{ result: ApiPresentation }>(read(sysId, {}))
        return toRecord(result)
    },

    async create(input: PresentationInput): Promise<PresentationRecord> {
        const { result } = await getJson<{ result: ApiPresentation }>(
            `${BASE}?${query({
                sysparm_display_value: 'all',
                sysparm_exclude_reference_link: 'true',
                sysparm_fields: `${LIST_FIELDS},body`,
            })}`,
            { method: 'POST', body: JSON.stringify(toApi(input)) }
        )
        return toRecord(result)
    },

    async update(sysId: string, input: Partial<PresentationInput>): Promise<PresentationRecord> {
        const { result } = await getJson<{ result: ApiPresentation }>(read(sysId, {}), {
            method: 'PATCH',
            body: JSON.stringify(toApi(input)),
        })
        return toRecord(result)
    },

    async remove(sysId: string): Promise<void> {
        await request(`${BASE}/${encodeURIComponent(sysId)}`, { method: 'DELETE' })
    },
}
