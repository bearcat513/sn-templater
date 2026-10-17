import type { ApiField } from '../engine/vocabulary'
import { andQuery, getJson, getList, orderClause, query, request } from './http'

export type ApiRecord = Record<string, ApiField>

/** A record as a picker shows it. */
export type RecordSummary = { sysId: string; label: string; detail: string }

const tableUrl = (table: string) => `/api/now/table/${encodeURIComponent(table)}`

const display = (field: ApiField): string =>
    field && typeof field === 'object' ? String(field.display_value ?? field.value ?? '') : String(field ?? '')

export const RecordService = {
    /** One record, with display and stored values for exactly these fields. */
    async get(table: string, sysId: string, fields: string[]): Promise<ApiRecord> {
        const { result } = await getJson<{ result: ApiRecord }>(
            `${tableUrl(table)}/${encodeURIComponent(sysId)}?${query({
                sysparm_fields: fields.join(','),
                sysparm_display_value: 'all',
                sysparm_exclude_reference_link: 'true',
            })}`
        )
        return result
    },

    /** Records matching an encoded query, in order, with the total that matched. */
    async list(
        table: string,
        options: { query?: string; orderBy?: string; limit: number; fields: string[]; displayValue?: 'all' | 'true' }
    ): Promise<{ records: ApiRecord[]; total: number }> {
        const { result, total } = await getList<ApiRecord>(
            `${tableUrl(table)}?${query({
                sysparm_query: andQuery(options.query, orderClause(options.orderBy)),
                sysparm_fields: options.fields.join(','),
                sysparm_display_value: options.displayValue ?? 'all',
                sysparm_exclude_reference_link: 'true',
                sysparm_limit: options.limit,
            })}`
        )
        return { records: result, total }
    },

    /** How many records an encoded query matches, without fetching them. */
    async count(table: string, encodedQuery: string): Promise<number> {
        const { total } = await getList(
            `${tableUrl(table)}?${query({ sysparm_query: encodedQuery, sysparm_fields: 'sys_id', sysparm_limit: 1 })}`
        )
        return total
    },

    /**
     * Records for a picker: matching on the display field (and `number`, when the
     * table has one), most recently updated first.
     */
    async search(
        table: string,
        term: string,
        options: { displayField: string; hasNumber: boolean; detailField?: string }
    ): Promise<RecordSummary[]> {
        const needle = term.trim().replace(/\^/g, '')
        const display = options.displayField || 'sys_id'
        const match = needle
            ? [
                  options.displayField ? `${options.displayField}LIKE${needle}` : '',
                  options.hasNumber && options.displayField !== 'number' ? `numberLIKE${needle}` : '',
                  /^[0-9a-f]{32}$/.test(needle) ? `sys_id=${needle}` : '',
              ]
                  .filter(Boolean)
                  .join('^OR')
            : ''
        const fields = [...new Set(['sys_id', display, options.hasNumber ? 'number' : '', options.detailField ?? ''])]
            .filter(Boolean)
            .join(',')

        const { result } = await getList<Record<string, string>>(
            `${tableUrl(table)}?${query({
                sysparm_query: andQuery(match, 'ORDERBYDESCsys_updated_on'),
                sysparm_fields: fields,
                sysparm_display_value: 'true',
                sysparm_exclude_reference_link: 'true',
                sysparm_limit: 25,
            })}`
        )

        return result.map(row => {
            const label = display !== 'sys_id' ? String(row[display] ?? '') : ''
            const number = options.hasNumber && display !== 'number' ? String(row.number ?? '') : ''
            const detail = options.detailField ? String(row[options.detailField] ?? '') : ''
            return {
                sysId: String(row.sys_id),
                label: [number, label].filter(Boolean).join(' · ') || String(row.sys_id),
                detail,
            }
        })
    },

    /** The label of one record, for a picker opened on a value. */
    async summary(table: string, sysId: string, displayField: string, hasNumber: boolean): Promise<RecordSummary> {
        const fields = [...new Set(['sys_id', displayField || 'sys_id', hasNumber ? 'number' : ''])].filter(Boolean)
        const record = await RecordService.get(table, sysId, fields)
        const label = displayField ? display(record[displayField]) : ''
        const number = hasNumber && displayField !== 'number' ? display(record.number) : ''
        return { sysId, label: [number, label].filter(Boolean).join(' · ') || sysId, detail: '' }
    },

    /** Attaches a file to a record, as the signed-in user. */
    async attach(table: string, sysId: string, fileName: string, bytes: Uint8Array, contentType: string): Promise<void> {
        await request(
            `/api/now/attachment/file?${query({ table_name: table, table_sys_id: sysId, file_name: fileName })}`,
            {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: new Blob([bytes as unknown as BlobPart], { type: contentType }),
            }
        )
    },
}

export { display as displayOf }
