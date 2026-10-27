import type { SchemaField } from '../engine/vocabulary'
import { API_BASE } from '../../server/shared/constants'
import { getJson, query } from './http'

const API = API_BASE

/** A reference field on another table that can point at a record of this one. */
export type Relationship = {
    table: string
    tableLabel: string
    field: string
    fieldLabel: string
}

export type TableSchema = {
    name: string
    label: string
    /** The field a record is known by — `number` on a task, `name` on a user. */
    displayField: string
    /** The table and every table it extends, the table itself first. */
    ancestors: string[]
    fields: SchemaField[]
    relationships: Relationship[]
}

export type TableSummary = { name: string; label: string }

export type SessionContext = {
    userId: string
    userName: string
    displayName: string
    email: string
    /** Today, in the user's own date format. */
    date: string
    dateTime: string
    /**
     * The user's ServiceNow time zone (an IANA name, such as Europe/London)
     * and language, so dates and numbers drawn in the browser match the
     * instance rather than the laptop. Empty when the instance did not say.
     */
    timeZone: string
    language: string
    /** The user's date and time formats, as Java patterns: `yyyy-MM-dd`, `HH:mm:ss`. */
    dateFormat: string
    timeFormat: string
    /** The sys_ids of the groups the user is in. */
    groups: string[]
    canEdit: boolean
    /** The x_1040823_template.debug property: show the developer tools. */
    debug: boolean
}

/*
 * A table's schema changes about as often as a release, so one fetch per page
 * load is enough. The promise is cached rather than the result, so two views
 * asking at once share one request.
 */
const schemas = new Map<string, Promise<TableSchema>>()

export const SchemaService = {
    table(name: string): Promise<TableSchema> {
        let cached = schemas.get(name)
        if (!cached) {
            cached = getJson<{ result: TableSchema }>(`${API}/schema/${encodeURIComponent(name)}`).then(
                body => body.result
            )
            // A failure is not cached: the next caller gets to try again.
            cached.catch(() => schemas.delete(name))
            schemas.set(name, cached)
        }
        return cached
    },

    async tables(term: string): Promise<TableSummary[]> {
        const body = await getJson<{ result: { tables: TableSummary[] } }>(`${API}/tables?${query({ q: term })}`)
        return body.result.tables
    },

    async context(): Promise<SessionContext> {
        const body = await getJson<{ result: Partial<SessionContext> }>(`${API}/me`)
        // An instance on an older version of the app sends less: the browser's own settings stand in.
        return {
            timeZone: '',
            language: '',
            dateFormat: '',
            timeFormat: '',
            groups: [],
            ...body.result,
        } as SessionContext
    },
}
