import { getJson, getList, query, request, saveUnchanged } from './http'

import { PRESENTATION_TABLE, PRESENTATION_VERSION_TABLE } from '../../server/shared/constants'

export { PRESENTATION_TABLE }
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
    /** The platform's update counter, which tells whether someone else has saved since it was read. */
    modCount: number
    /** How many times it has been published. 0 is never: its first save publishes it. */
    version: number
    /** Whether there are changes saved in the builder and not yet published. */
    hasDraft: boolean
    /** Who else may change it: users and groups, by sys_id. */
    editors: string[]
    editorGroups: string[]
    /** Only present when the presentation was read on its own. */
    body?: string
    /** The unpublished changes, with the deck settings under `meta`. Only when read on its own and there are some. */
    draftBody?: string
}

/** One published version of a presentation, without its body. */
export type PresentationVersion = {
    sysId: string
    version: number
    note: string
    publishedBy: string
    publishedOn: string
}

export type PresentationInput = Pick<
    PresentationRecord,
    'name' | 'template' | 'title' | 'query' | 'orderBy' | 'limit'
> & {
    body: string
    /** Saved as unpublished changes; empty clears them. */
    draftBody?: string
    /** Kept with the version a publish makes. */
    publishNote?: string
    editors?: string[]
    editorGroups?: string[]
}

type Field = { value: string; display_value: string }
type ApiPresentation = Record<string, Field>

const LIST_FIELDS =
    'sys_id,name,template,title,query,order_by,record_limit,sys_updated_on,sys_created_by,sys_updated_by,sys_mod_count,version,has_draft,editors,editor_groups'

const VERSION_BASE = `/api/now/table/${PRESENTATION_VERSION_TABLE}`

/** A list field's sys_ids. */
const ids = (field: Field | undefined): string[] => (field?.value ?? '').split(',').filter(Boolean)

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
    modCount: Number(row.sys_mod_count?.value) || 0,
    version: Number(row.version?.value) || 0,
    hasDraft: row.has_draft?.value === 'true',
    editors: ids(row.editors),
    editorGroups: ids(row.editor_groups),
    ...(row.body ? { body: row.body.value ?? '' } : {}),
    ...(row.draft_body?.value ? { draftBody: row.draft_body.value } : {}),
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
    if (input.draftBody !== undefined) out.draft_body = input.draftBody
    if (input.publishNote !== undefined) out.publish_note = input.publishNote
    if (input.editors !== undefined) out.editors = input.editors.join(',')
    if (input.editorGroups !== undefined) out.editor_groups = input.editorGroups.join(',')
    return out
}

const read = (sysId: string, params: Record<string, string>) =>
    `${BASE}/${encodeURIComponent(sysId)}?${query({
        sysparm_fields: `${LIST_FIELDS},body,draft_body`,
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

    /** Saves changes; with `expect`, refuses to save over someone else's (see `assertUnchanged`). */
    async update(
        sysId: string,
        input: Partial<PresentationInput>,
        options: { expect?: number } = {}
    ): Promise<PresentationRecord> {
        if (options.expect !== undefined) {
            // Compared and written on the instance in one go; then read back as the Table API returns it.
            await saveUnchanged(PRESENTATION_TABLE, sysId, options.expect, toApi(input))
            return PresentationService.get(sysId)
        }
        const { result } = await getJson<{ result: ApiPresentation }>(read(sysId, {}), {
            method: 'PATCH',
            body: JSON.stringify(toApi(input)),
        })
        return toRecord(result)
    },

    async remove(sysId: string): Promise<void> {
        await request(`${BASE}/${encodeURIComponent(sysId)}`, { method: 'DELETE' })
    },

    /** A presentation's published versions, newest first. */
    async versions(sysId: string): Promise<PresentationVersion[]> {
        const { result } = await getList<Record<string, Field>>(
            `${VERSION_BASE}?${query({
                sysparm_query: `presentation=${sysId}^ORDERBYDESCversion`,
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

    /** One version's body and the deck settings it was published with. */
    async version(sysId: string): Promise<{ body: string; meta: Partial<Record<string, string>> }> {
        const { result } = await getJson<{ result: Record<string, string> }>(
            `${VERSION_BASE}/${encodeURIComponent(sysId)}?${query({
                sysparm_fields: 'body,title,query,order_by,record_limit,template',
            })}`
        )
        const { body = '', ...meta } = result
        return { body, meta }
    },
}
