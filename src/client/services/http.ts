import { API_BASE } from '../../server/shared/constants'
import { log } from '../debug/log'
import { isRecording, startRequest, updateRequest } from '../debug/store'

declare global {
    interface Window {
        g_ck: string
        CustomEvent: typeof CustomEvent & { fireTop?: (name: string, detail: unknown) => void }
    }
}

export class HttpError extends Error {
    constructor(
        message: string,
        readonly status: number,
        /** What the API sent with its message, when it sent more: `error.detail`. */
        readonly detail?: unknown
    ) {
        super(message)
    }
}

/**
 * A save refused because someone else saved the same record since it was
 * opened: who did, and when, so the person saving can decide what to do.
 */
export class ConflictError extends Error {
    constructor(
        readonly updatedBy: string,
        readonly updatedOn: string
    ) {
        super(`${updatedBy || 'Someone'} changed this at ${updatedOn || 'some point'} since you opened it.`)
    }
}

/* ------------------------------------------------------- session recovery */

/** What the page listens for when a session has ended and the person has to sign in again. */
export const SESSION_EXPIRED_EVENT = 'templater:session-expired'

/** Sent with the event: call it with true once signed in again, or false to give up. */
export type SessionExpiredDetail = { resume: (signedIn: boolean) => void }

/**
 * Reads a fresh session token from the page itself.
 *
 * After signing in again — in another tab — the browser has a new session,
 * but this page still holds the old session's token, and every request with
 * it is refused. The page's own HTML carries the current one.
 */
export async function refreshSessionToken(): Promise<boolean> {
    try {
        const response = await fetch(window.location.pathname + window.location.search, {
            credentials: 'same-origin',
            headers: { Accept: 'text/html' },
        })
        if (!response.ok) return false
        const html = await response.text()
        const found = /g_ck['"]?\s*[:=]\s*['"]([0-9a-zA-Z]{20,})['"]/.exec(html)?.[1]
        if (!found) return false
        window.g_ck = found
        return true
    } catch {
        return false
    }
}

let recovering: Promise<boolean> | null = null

/**
 * When a request is refused for want of a session: try the page's fresh token
 * first, and failing that, ask the person to sign in again and wait for them.
 * Nothing they were working on is thrown away while they do; the request is
 * then sent again. Concurrent refusals share one prompt.
 */
function recoverSession(): Promise<boolean> {
    recovering ??= (async () => {
        if (await refreshSessionToken()) return true
        return new Promise<boolean>(resolve => {
            const detail: SessionExpiredDetail = { resume: resolve }
            // With nothing listening, there is no one to ask: fail as before.
            if (window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail, cancelable: true })))
                resolve(false)
        })
    })().finally(() => {
        recovering = null
    })
    return recovering
}

/** Why a ServiceNow API said no, in the words it used, and anything it sent with them. */
async function errorOf(response: Response): Promise<{ message: string; detail?: unknown }> {
    try {
        const body = await response.json()
        const error = body?.error ?? body?.result?.error
        const detail = error && typeof error === 'object' ? error.detail : undefined
        const message = typeof error === 'string' ? error : error?.message || (typeof detail === 'string' ? detail : '')
        if (message) return { message: String(message), ...(detail !== undefined ? { detail } : {}) }
    } catch {
        // Not JSON — fall through to the status line.
    }
    if (response.status === 401) return { message: 'Your session has expired. Reload the page to sign in again.' }
    if (response.status === 403) return { message: 'You do not have access to that.' }
    if (response.status === 404) return { message: 'That could not be found.' }
    return { message: `The request failed (${response.status}).` }
}

/**
 * Every call to the instance goes through here: the session token on the way
 * out, the platform's own error message on the way back.
 */
export async function request(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-UserToken': window.g_ck,
        ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...((init.headers as Record<string, string> | undefined) ?? {}),
    }
    const method = (init.method ?? 'GET').toUpperCase()
    const traceId = isRecording() ? traceStart(method, url, headers, init.body) : 0

    let response: Response
    try {
        response = await fetch(url, { ...init, headers })
    } catch (failure) {
        if (traceId) traceFailure(traceId, method, url, failure)
        throw failure
    }
    if (traceId) traceResponse(traceId, method, url, response)
    if (response.status === 401 && !retried && (await recoverSession())) {
        log.info('http', `Signed in again; sending ${method} ${shortUrl(url)} again`)
        return request(url, init, true)
    }
    if (!response.ok) {
        const { message, detail } = await errorOf(response)
        throw new HttpError(message, response.status, detail)
    }
    return response
}

/* ------------------------------------------------- developer tools tracing */

/** The largest response body kept for the network log; past this it is cut. */
const MAX_TRACED_BODY = 256 * 1024

function traceStart(method: string, url: string, headers: Record<string, string>, body: RequestInit['body']): number {
    // The session token is a credential: the log says it was sent, not what it was.
    const shown = { ...headers, ...(headers['X-UserToken'] ? { 'X-UserToken': '‹redacted›' } : {}) }
    return startRequest({
        method,
        url,
        requestHeaders: shown,
        requestBody: typeof body === 'string' ? parseMaybeJson(body) : body ? `‹${body.constructor.name}›` : undefined,
    })
}

function traceResponse(id: number, method: string, url: string, response: Response) {
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => (responseHeaders[key] = value))
    const serverTiming = /dur=([\d.]+)/.exec(response.headers.get('Server-Timing') ?? '')
    updateRequest(id, {
        status: response.status,
        statusText: response.statusText,
        responseHeaders,
        serverDuration: serverTiming ? Number(serverTiming[1]) : undefined,
    })
    // Read a copy of the body, so the caller still gets to read the original.
    response
        .clone()
        .text()
        .then(text => {
            const body =
                text.length > MAX_TRACED_BODY
                    ? `${text.slice(0, MAX_TRACED_BODY)}\n… (cut at ${MAX_TRACED_BODY} of ${text.length} characters)`
                    : parseMaybeJson(text)
            updateRequest(id, { state: response.ok ? 'done' : 'failed', responseBody: body, size: text.length })
            const line = `${method} ${shortUrl(url)} → ${response.status}`
            if (response.ok) log.debug('http', line)
            else log.warn('http', line, body)
        })
        .catch(failure => updateRequest(id, { state: 'failed', error: String(failure) }))
}

function traceFailure(id: number, method: string, url: string, failure: unknown) {
    const aborted = failure instanceof DOMException && failure.name === 'AbortError'
    const message = failure instanceof Error ? failure.message : String(failure)
    updateRequest(id, { state: 'failed', error: aborted ? 'Cancelled' : message })
    if (!aborted) log.error('http', `${method} ${shortUrl(url)} failed: ${message}`)
}

function parseMaybeJson(text: string): unknown {
    if (!text) return text
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

/** A URL without its query string, for a one-line log message. */
const shortUrl = (url: string): string => url.split('?')[0] ?? url

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await request(url, init)
    return (await response.json()) as T
}

/** A Table API list: the rows, and how many matched in all. */
export async function getList<T>(url: string, init?: RequestInit): Promise<{ result: T[]; total: number }> {
    const response = await request(url, init)
    const body = (await response.json()) as { result?: T[] }
    const result = body.result ?? []
    const total = Number(response.headers.get('X-Total-Count') ?? result.length)
    return { result, total: Number.isFinite(total) ? total : result.length }
}

export const query = (params: Record<string, string | number | undefined>): string => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') search.set(key, String(value))
    }
    return search.toString()
}

/** `-sys_updated_on` → `ORDERBYDESCsys_updated_on`, for an encoded query. */
export function orderClause(orderBy: string | undefined): string {
    const field = (orderBy ?? '').trim()
    if (!field) return ''
    return field.startsWith('-') ? `ORDERBYDESC${field.slice(1)}` : `ORDERBY${field}`
}

/** ANDs encoded-query parts together, skipping the empty ones. */
export const andQuery = (...parts: (string | undefined)[]): string =>
    parts
        .map(part => (part ?? '').trim().replace(/^\^+|\^+$/g, ''))
        .filter(Boolean)
        .join('^')

/**
 * Saves a template or presentation only if nobody else has since it was
 * read — its update counter is still `expect` — through the app's own save
 * route, which compares and writes in one transaction. On someone else's
 * save it throws a `ConflictError` saying who and when, and writes nothing.
 * Resolves to the record's new update counter.
 */
export async function saveUnchanged(
    table: string,
    sysId: string,
    expect: number,
    fields: Record<string, string>
): Promise<number> {
    try {
        const body = await getJson<{ result: { sys_mod_count: number } }>(
            `${API_BASE}/save/${encodeURIComponent(table)}/${encodeURIComponent(sysId)}`,
            { method: 'POST', body: JSON.stringify({ expect, fields }) }
        )
        return Number(body.result?.sys_mod_count) || expect + 1
    } catch (failure) {
        if (failure instanceof HttpError && failure.status === 409) {
            const detail = (failure.detail ?? {}) as { updatedBy?: string; updatedOn?: string }
            throw new ConflictError(String(detail.updatedBy ?? ''), String(detail.updatedOn ?? ''))
        }
        throw failure
    }
}
