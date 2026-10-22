import { getJson, getList, query, request } from './http'

/** An attachment as Templater needs it: which one, and what it is called. */
export type AttachmentInfo = { sysId: string; fileName: string; contentType: string }

type ApiAttachment = { sys_id?: string; file_name?: string; content_type?: string }

const toInfo = (row: ApiAttachment): AttachmentInfo => ({
    sysId: row.sys_id ?? '',
    fileName: row.file_name ?? '',
    contentType: row.content_type ?? '',
})

/** The Attachment API, with the viewer's own session: what they can read of a record, they can read of its files. */
export const AttachmentService = {
    /** A record's attachments whose names start with `prefix`. */
    async list(table: string, sysId: string, prefix = ''): Promise<AttachmentInfo[]> {
        const { result } = await getList<ApiAttachment>(
            `/api/now/attachment?${query({
                sysparm_query: [
                    `table_name=${table}`,
                    `table_sys_id=${sysId}`,
                    prefix ? `file_nameSTARTSWITH${prefix}` : '',
                ]
                    .filter(Boolean)
                    .join('^'),
                sysparm_fields: 'sys_id,file_name,content_type',
                sysparm_limit: 500,
            })}`
        )
        return result.map(toInfo)
    },

    /** One attachment's bytes. */
    async file(sysId: string): Promise<Uint8Array> {
        const response = await request(`/api/now/attachment/${encodeURIComponent(sysId)}/file`, {
            headers: { Accept: '*/*' },
        })
        return new Uint8Array(await response.arrayBuffer())
    },

    /** Attaches a file to a record, returning the new attachment. */
    async upload(
        table: string,
        sysId: string,
        fileName: string,
        bytes: Uint8Array,
        contentType: string
    ): Promise<AttachmentInfo> {
        const { result } = await getJson<{ result: ApiAttachment }>(
            `/api/now/attachment/file?${query({ table_name: table, table_sys_id: sysId, file_name: fileName })}`,
            {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: new Blob([bytes as unknown as BlobPart], { type: contentType }),
            }
        )
        return toInfo(result)
    },
}

/** The address of an attachment's file on this instance, for a link. */
export const attachmentUrl = (sysId: string): string =>
    `${window.location.origin}/sys_attachment.do?sys_id=${encodeURIComponent(sysId)}`
