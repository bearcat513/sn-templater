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
    const response = await fetch(url, {
        ...init,
        headers: {
            Accept: 'application/json',
            'X-UserToken': window.g_ck,
            ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
            ...(init.headers ?? {}),
        },
    })
    if (!response.ok) throw new HttpError(await errorMessage(response), response.status)
    return response
}

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
