import { openTemplate } from './templates'
import type { LoadedChart } from '../engine/chart'
import { MAX_SECTION_RECORDS, type DeckSection } from '../engine/presentation'
import type { RenderJob } from '../engine/render'
import { blankDeck, type PdfTemplate } from '../engine/template'
import { SchemaService, type SessionContext, type TableSchema } from '../services/schema'
import type { PresentationRecord } from '../services/presentations'
import { TemplateService, type TemplateRecord } from '../services/templates'
import { paginate, sectionCoverOwner, sectionMarker, type Slide } from '../slides/paginate'
import { withCharts } from './charts'
import { contextValues, loadRecords } from './loader'

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
    const read = await openTemplate(record, schema.fields)
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

/**
 * Whether this person may change a saved presentation: its author, an
 * editor, or someone it was shared with. The ACLs decide; this decides what
 * to offer.
 */
export const canChangePresentation = (presentation: PresentationRecord | null, session: SessionContext): boolean =>
    !presentation ||
    session.canEdit ||
    presentation.createdBy === session.userName ||
    presentation.editors.includes(session.userId) ||
    presentation.editorGroups.some(group => session.groups.includes(group))

/** Whether this person may delete a saved presentation, or share it: only its author or an editor. */
export const ownsPresentation = (presentation: PresentationRecord | null, session: SessionContext): boolean =>
    !presentation || session.canEdit || presentation.createdBy === session.userName

/* -------------------------------- sections ------------------------------- */

/** A section as loaded: its deck, or why it could not be read. */
export type LoadedSection = {
    /** What it was loaded for: when the section changes, it is loaded again. */
    signature: string
    deck?: LoadedDeck
    error?: string
}

/** What a section's slides depend on. Its name does not count. */
export const sectionSignature = (section: DeckSection): string =>
    JSON.stringify([section.template, section.title ?? '', section.query, section.orderBy ?? '', section.limit])

/** A template placed in a deck, with its records read. A failure is a section with an error, not a rejection. */
export async function loadSection(section: DeckSection, session: SessionContext): Promise<LoadedSection> {
    const signature = sectionSignature(section)
    try {
        const deck = await loadDeck(
            {
                templateId: section.template,
                title: section.title ?? '',
                query: section.query,
                orderBy: section.orderBy ?? '',
                limit: Math.min(section.limit, MAX_SECTION_RECORDS),
            },
            session
        )
        return { signature, deck }
    } catch (failure) {
        return { signature, error: failure instanceof Error ? failure.message : String(failure) }
    }
}

export async function loadSections(
    sections: DeckSection[],
    session: SessionContext
): Promise<Record<string, LoadedSection>> {
    const loaded = await Promise.all(sections.map(section => loadSection(section, session)))
    return Object.fromEntries(sections.map((section, index) => [section.id, loaded[index]!]))
}

/**
 * The look of the whole presentation — its sheet, and the type and colours
 * of its custom slides: the deck template it is built on, or a plain deck
 * when it is built from nothing.
 */
const BLANK = blankDeck()
export const frameOf = (main: LoadedDeck | null): PdfTemplate => main?.template ?? BLANK

/**
 * What a presentation built from nothing has in place of a deck's records:
 * the batch's tokens, for its custom slides. `{{deck.count}}` counts every
 * record its sections show.
 */
export function blankJob(title: string, session: SessionContext, count: number): RenderJob {
    return {
        title,
        author: session.displayName,
        subject: title,
        records: [],
        coverValues: contextValues({ name: '', label: '' }, session, title, count),
    }
}

/** What the builder and the presenter draw a presentation from. */
export type Assembled = {
    /** The presentation's own template: the sheet, custom slides, the deck's own record slides. */
    frame: PdfTemplate
    /** The deck's job, charts on custom slides included. */
    job: RenderJob
    /** Every slide in natural order — the deck's own, then each section's header and slides — before arranging. */
    generated: Slide[]
}

/**
 * Puts a presentation's slides together: the deck's own (if it is built on
 * one), then each section in turn — its header, then its template's slides,
 * drawn by that template on the deck's sheet. The running order then puts
 * each where its author did.
 */
export function assemble(
    main: LoadedDeck | null,
    title: string,
    session: SessionContext,
    placed: DeckSection[],
    sections: Record<string, LoadedSection>,
    charts: Record<string, LoadedChart>
): Assembled {
    const frame = frameOf(main)
    const count = placed.reduce((total, section) => total + (sections[section.id]?.deck?.job.records.length ?? 0), 0)
    const job = withCharts(main?.job ?? blankJob(title, session, count), charts)
    const generated = main ? paginate(main.template, job) : []
    let ownerBase = main?.job.records.length ?? 0

    placed.forEach((section, index) => {
        // While a changed section reloads, the slides it had stay until the new ones arrive.
        const deck = sections[section.id]?.deck
        generated.push(sectionMarker(section, index, job, section.name || deck?.record.name || 'Template'))
        if (!deck) return
        // Drawn on the deck's sheet, whatever size the template was made for.
        const template: PdfTemplate = {
            ...deck.template,
            page: { ...deck.template.page, size: frame.page.size, landscape: frame.page.landscape },
        }
        const sectionJob = withCharts(deck.job, charts)
        generated.push(...paginate(template, sectionJob, { section, coverOwner: sectionCoverOwner(index), ownerBase }))
        ownerBase += deck.job.records.length
    })

    return { frame, job, generated }
}

/** Opens a record from its slide: every record slide knows its table and sys_id. */
export const recordLink = (slide: Slide): string | null => {
    const sysId = slide.owner >= 0 ? slide.values['raw.sys_id'] : ''
    const table = slide.values['table.name']
    return sysId && table ? `/${table}.do?sys_id=${encodeURIComponent(sysId)}` : null
}
