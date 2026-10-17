import type { SchemaField } from '../engine/vocabulary'
import { getJson, query } from './http'

const API = '/api/x_1040823_template/templater'

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
    canEdit: boolean
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
        const body = await getJson<{ result: SessionContext }>(`${API}/me`)
        return body.result
    },
}
