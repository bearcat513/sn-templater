import type { RenderJob } from '../engine/render'
import type { PdfTemplate } from '../engine/template'
import { readTemplate } from '../engine/validate'
import { SchemaService, type SessionContext, type TableSchema } from '../services/schema'
import type { PresentationRecord } from '../services/presentations'
import { TemplateService, type TemplateRecord } from '../services/templates'
import { loadRecords } from './loader'

/** A deck ready to arrange or present: its template, its table, and its records' values. */
export type LoadedDeck = {
    record: TemplateRecord
    template: PdfTemplate
    schema: TableSchema
    job: RenderJob
    matched: number
}

export type DeckSource = {
    templateId: string
    title: string
    query: string
    orderBy: string
    limit: number
}

/**
 * Reads a deck template and the records it is shown for. What both the
 * presenter and the slide builder start from; a saved presentation is the
 * same thing plus the arrangement in its body.
 */
export async function loadDeck(
    source: DeckSource,
    session: SessionContext,
    onProgress?: (done: number, total: number) => void
): Promise<LoadedDeck> {
    const record = await TemplateService.get(source.templateId)
    const schema = await SchemaService.table(record.table)
    const read = readTemplate(record.body ?? '', record.kind, schema.fields)
    if (!read.ok) throw new Error(`“${record.name}” could not be read: ${read.error}`)
    const { job, matched } = await loadRecords({
        template: read.value,
        schema,
        session,
        title: source.title.trim() || record.name,
        selection: { kind: 'query', query: source.query, orderBy: source.orderBy, limit: source.limit },
        onProgress,
    })
    return { record, template: read.value, schema, job, matched }
}

/** A saved presentation's deck source. */
export const sourceOf = (presentation: PresentationRecord): DeckSource => ({
    templateId: presentation.template,
    title: presentation.title || presentation.name,
    query: presentation.query,
    orderBy: presentation.orderBy,
    limit: presentation.limit,
})

/** Whether this person may change or delete a saved presentation (the ACLs decide; this decides what to offer). */
export const canChangePresentation = (presentation: PresentationRecord | null, session: SessionContext): boolean =>
    !presentation || session.canEdit || presentation.createdBy === session.userName
