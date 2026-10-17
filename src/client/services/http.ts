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
        readonly status: number
    ) {
        super(message)
    }
}

/** Why a ServiceNow API said no, in the words it used. */
async function errorMessage(response: Response): Promise<string> {
    try {
        const body = await response.json()
        const error = body?.error
        const message = typeof error === 'string' ? error : error?.message || error?.detail
        if (message) return String(message)
    } catch {
        // Not JSON — fall through to the status line.
    }
    if (response.status === 401) return 'Your session has expired. Reload the page to sign in again.'
    if (response.status === 403) return 'You do not have access to that.'
    if (response.status === 404) return 'That could not be found.'
    return `The request failed (${response.status}).`
}

/**
 * Every call to the instance goes through here: the session token on the way
 * out, the platform's own error message on the way back.
 */
export async function request(url: string, init: RequestInit = {}): Promise<Response> {
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
    if (!response.ok) throw new HttpError(await errorMessage(response), response.status)
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
