import { COMMENT_TABLE, LIVE_TABLE, PAGE } from '../../server/shared/constants'
import { getJson, getList, query, request } from './http'

type Field = { value: string; display_value: string }

/** A comment on one slide of a presentation. */
export type SlideComment = {
    sysId: string
    /** The slide's key in the running order: `custom:<id>`, `record:<sys_id>:1`. */
    slide: string
    text: string
    resolved: boolean
    /** Who wrote it — user name and display name — and when. */
    author: string
    authorName: string
    createdOn: string
}

const toComment = (row: Record<string, Field>): SlideComment => ({
    sysId: row.sys_id?.value ?? '',
    slide: row.slide?.value ?? '',
    text: row.text?.value ?? '',
    resolved: row.resolved?.value === 'true',
    author: row.sys_created_by?.value ?? '',
    authorName: row.sys_created_by?.display_value ?? '',
    createdOn: row.sys_created_on?.display_value ?? '',
})

const COMMENTS = `/api/now/table/${COMMENT_TABLE}`
const COMMENT_FIELDS = 'sys_id,slide,text,resolved,sys_created_by,sys_created_on'

export const CommentService = {
    /** Every comment on a presentation, oldest first. */
    async list(presentation: string): Promise<SlideComment[]> {
        const { result } = await getList<Record<string, Field>>(
            `${COMMENTS}?${query({
                sysparm_query: `presentation=${presentation}^ORDERBYsys_created_on`,
                sysparm_fields: COMMENT_FIELDS,
                sysparm_display_value: 'all',
                sysparm_limit: 1000,
            })}`
        )
        return result.map(toComment)
    },

    async add(presentation: string, slide: string, text: string): Promise<SlideComment> {
        const { result } = await getJson<{ result: Record<string, Field> }>(
            `${COMMENTS}?${query({ sysparm_fields: COMMENT_FIELDS, sysparm_display_value: 'all' })}`,
            { method: 'POST', body: JSON.stringify({ presentation, slide, text: text.slice(0, 4000) }) }
        )
        return toComment(result)
    },

    async resolve(sysId: string, resolved: boolean): Promise<void> {
        await request(`${COMMENTS}/${encodeURIComponent(sysId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ resolved: String(resolved) }),
        })
    },

    async remove(sysId: string): Promise<void> {
        await request(`${COMMENTS}/${encodeURIComponent(sysId)}`, { method: 'DELETE' })
    },
}

/* -------------------------------------------------------------- live */

/** Where someone presenting with followers is: the slide on their screen and its build step. */
export type LiveState = {
    slide: string
    step: number
    ended: boolean
    presenterName: string
    /** When they last moved, in milliseconds. */
    movedAt: number
}

const LIVE = `/api/now/table/${LIVE_TABLE}`

/** A session nobody has moved for this long is taken to be over. */
export const LIVE_TIMEOUT_MS = 30 * 60_000

/** The Table API's `sys_updated_on` (UTC, `yyyy-MM-dd HH:mm:ss`) as milliseconds. */
const utc = (value: string): number => Date.parse(`${value.replace(' ', 'T')}Z`) || 0

export const LiveService = {
    /** Starts presenting with followers. Returns the session's sys_id, which the follow link names. */
    async start(presentation: string, presenter: string, slide: string): Promise<string> {
        const { result } = await getJson<{ result: Record<string, string> }>(
            `${LIVE}?${query({ sysparm_fields: 'sys_id' })}`,
            { method: 'POST', body: JSON.stringify({ presentation, presenter, slide, step: '0' }) }
        )
        return result.sys_id ?? ''
    },

    async move(sysId: string, slide: string, step: number): Promise<void> {
        await request(`${LIVE}/${encodeURIComponent(sysId)}?${query({ sysparm_fields: 'sys_id' })}`, {
            method: 'PATCH',
            body: JSON.stringify({ slide, step: String(step) }),
        })
    },

    async end(sysId: string): Promise<void> {
        await request(`${LIVE}/${encodeURIComponent(sysId)}?${query({ sysparm_fields: 'sys_id' })}`, {
            method: 'PATCH',
            body: JSON.stringify({ ended: 'true' }),
        })
    },

    async read(sysId: string): Promise<LiveState> {
        const { result } = await getJson<{ result: Record<string, Field> }>(
            `${LIVE}/${encodeURIComponent(sysId)}?${query({
                sysparm_fields: 'slide,step,ended,presenter,sys_updated_on',
                sysparm_display_value: 'all',
            })}`
        )
        const movedAt = utc(result.sys_updated_on?.value ?? '')
        return {
            slide: result.slide?.value ?? '',
            step: Number(result.step?.value) || 0,
            ended: result.ended?.value === 'true' || (movedAt > 0 && Date.now() - movedAt > LIVE_TIMEOUT_MS),
            presenterName: result.presenter?.display_value ?? '',
            movedAt,
        }
    },
}

/** The link that follows a live session: the presentation, kept in step with its presenter. */
export const followUrl = (presentation: string, live: string): string =>
    `${window.location.origin}/${PAGE}?${query({ view: 'present', presentation, follow: live })}`
