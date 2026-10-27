/**
 * The shape of a template, chart and presentation body, checked the same way
 * in the browser and on the instance.
 *
 * The browser reads bodies with src/client/engine/validate.ts, which *drops*
 * what it cannot draw rather than refusing the whole body: a template from a
 * newer version loses a block, not the page. That is right for reading. For
 * *writing* — a script's `updateTemplate`, a body pasted on the form, a Flow
 * action — it is not: a typo in a block type should be refused where it was
 * made, not discovered as a missing block in someone's PDF. So this module
 * answers a different question: "would the reader keep all of this?"
 *
 * - **errors** are what the reader cannot use at all (not JSON, no blocks, a
 *   block type it does not know, a repeat inside a repeat, a condition test
 *   that does not exist). A server write with errors is refused.
 * - **warnings** are what it would quietly change (a value out of range, an
 *   unknown key). They are reported, never refused.
 *
 * The vocabulary lists here are the single source: validate.ts and
 * presentation.ts use them, and src/client/engine/__tests__/schema.test.ts
 * checks that every body the reader writes passes this check.
 *
 * Pure ES2022 with no imports beyond ./constants, so the platform's module
 * runtime can load it as well as the browser.
 */
import {
    MAX_BLOCKS,
    MAX_BODY_LENGTH,
    MAX_CUSTOM_SLIDES,
    MAX_ELEMENTS,
    MAX_REPEAT_BLOCKS,
    MAX_SECTIONS,
} from './constants.ts'

/* -------------------------------------------------------------- vocabulary */

/** The version of the template body this code writes. Bodies without one are version 1. */
export const TEMPLATE_BODY_VERSION = 2
/** The version of the presentation body this code writes. */
export const PRESENTATION_BODY_VERSION = 2

export const TEMPLATE_KINDS = ['document', 'deck', 'chart'] as const

export const BLOCK_TYPES = [
    'heading',
    'text',
    'spacer',
    'divider',
    'image',
    'columns',
    'fields',
    'relatedList',
    'stats',
    'signatures',
    'reference',
    'code',
    'chart',
    'link',
    'callout',
    'list',
    'table',
    'repeat',
    'pageBreak',
] as const

export const CONDITION_TESTS = ['empty', 'notEmpty', 'equals', 'notEquals', 'contains', 'greater', 'less'] as const

export const CHART_KINDS = [
    'column',
    'bar',
    'line',
    'area',
    'pie',
    'donut',
    'funnel',
    'stacked',
    'heatmap',
    'sankey',
    'gantt',
] as const

export const CHART_MEASURES = ['count', 'sum', 'avg', 'min', 'max'] as const

export const ELEMENT_TYPES = ['shape', 'line', 'image', 'table', 'chart'] as const

export const SLIDE_LAYOUTS = ['blank', 'title', 'titleContent', 'section', 'twoContent', 'titleOnly'] as const

export const SHAPE_KINDS = [
    'rect',
    'roundRect',
    'ellipse',
    'triangle',
    'rightTriangle',
    'diamond',
    'pentagon',
    'hexagon',
    'parallelogram',
    'trapezoid',
    'chevron',
    'arrow',
    'star',
] as const

export const TRANSITIONS = ['none', 'fade', 'push', 'wipe', 'zoom'] as const
export const BUILD_EFFECTS = ['appear', 'fade', 'fly', 'zoom'] as const
export const FONT_FAMILIES = ['helvetica', 'times', 'courier'] as const

/* ------------------------------------------------------------------ result */

export type BodyCheck = {
    ok: boolean
    /** What the reader cannot use. A write with any is refused. */
    errors: string[]
    /** What the reader would change or leave out. */
    warnings: string[]
    /** The body, parsed and migrated to the current version, when it could be. */
    value?: Record<string, unknown>
}

type Report = { errors: string[]; warnings: string[] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const includes = (list: readonly string[], value: unknown): boolean => typeof value === 'string' && list.includes(value)

/** At most this many messages of each kind: past that, more of the same helps nobody. */
const MAX_MESSAGES = 25

function note(list: string[], message: string) {
    if (list.length < MAX_MESSAGES) list.push(message)
    else if (list.length === MAX_MESSAGES) list.push('…and more.')
}

/** Parses a body given as text or as an object. */
function parse(raw: unknown, what: string, report: Report): Record<string, unknown> | null {
    let source = raw
    if (typeof raw === 'string') {
        if (raw.length > MAX_BODY_LENGTH) {
            note(report.errors, `${what} must be ${MAX_BODY_LENGTH} characters or fewer.`)
            return null
        }
        try {
            source = JSON.parse(raw)
        } catch {
            note(report.errors, `${what} must be valid JSON.`)
            return null
        }
    }
    if (!isRecord(source)) {
        note(report.errors, `${what} must be a JSON object.`)
        return null
    }
    return source
}

/* -------------------------------------------------------------- migrations */

/**
 * Brings an older body up to TEMPLATE_BODY_VERSION, a step at a time. Each
 * step reads the version before it and writes the next; a body newer than
 * this code is left as it is, and reported.
 *
 * - **1 → 2:** conditions can be groups (`{ all: [...] }`, `{ any: [...] }`),
 *   the cover, letterhead and watermark can carry conditions, and a repeat can
 *   filter its rows (`where`). Nothing a version 1 body says changes meaning,
 *   so the step only stamps the version.
 */
export function migrateTemplateBody(body: Record<string, unknown>): Record<string, unknown> {
    let version = typeof body.version === 'number' && body.version >= 1 ? Math.floor(body.version) : 1
    let migrated = body
    if (version < 2) {
        migrated = { ...migrated, version: 2 }
        version = 2
    }
    return migrated
}

/**
 * The same for a presentation body.
 *
 * - **1 → 2:** a custom slide can carry `alt` text for screen readers, and
 *   the body can name the version of the deck it was published from. Only
 *   the version changes.
 */
export function migratePresentationBody(body: Record<string, unknown>): Record<string, unknown> {
    const version = typeof body.version === 'number' && body.version >= 1 ? Math.floor(body.version) : 1
    return version < 2 ? { ...body, version: 2 } : body
}

/* -------------------------------------------------------------- conditions */

/** A condition: one comparison, or a group of them. */
function checkCondition(raw: unknown, where: string, report: Report, depth = 0) {
    if (raw === undefined || raw === null) return
    if (!isRecord(raw)) {
        note(report.errors, `${where}: a condition must be an object.`)
        return
    }
    const group = Array.isArray(raw.all) ? raw.all : Array.isArray(raw.any) ? raw.any : null
    if (group) {
        if (depth >= 2) note(report.errors, `${where}: conditions can be grouped at most two deep.`)
        if (!group.length) note(report.warnings, `${where}: an empty condition group always holds.`)
        group.forEach((entry, index) => checkCondition(entry, `${where} › ${index + 1}`, report, depth + 1))
        return
    }
    if (raw.test !== undefined && !includes(CONDITION_TESTS, raw.test)) {
        note(report.errors, `${where}: "${String(raw.test)}" is not a condition test (${CONDITION_TESTS.join(', ')}).`)
    }
    if (typeof raw.value !== 'string' || !raw.value.trim()) {
        note(report.warnings, `${where}: a condition with no value is ignored.`)
    }
}

/* ------------------------------------------------------------------ blocks */

function checkBlocks(raw: unknown, where: string, report: Report, nested: boolean, max: number): number {
    if (raw === undefined) return 0
    if (!Array.isArray(raw)) {
        note(report.errors, `${where} must be a list of blocks.`)
        return 0
    }
    if (raw.length > max) note(report.warnings, `${where}: only the first ${max} blocks are kept.`)
    let kept = 0
    raw.slice(0, max).forEach((block, index) => {
        if (checkBlock(block, `${where} › block ${index + 1}`, report, nested)) kept++
    })
    return kept
}

function checkBlock(raw: unknown, where: string, report: Report, nested: boolean): boolean {
    if (!isRecord(raw)) {
        note(report.errors, `${where} must be an object.`)
        return false
    }
    const type = raw.type
    if (!includes(BLOCK_TYPES, type)) {
        note(report.errors, `${where}: "${String(type)}" is not a block type.`)
        return false
    }
    const label = `${where} (${String(type)})`
    checkCondition(raw.when, label, report)

    switch (type) {
        case 'repeat':
            if (nested) {
                note(report.errors, `${label}: a repeat cannot hold another repeat.`)
                return false
            }
            if (!raw.table || !raw.field)
                note(report.warnings, `${label}: a repeat needs a table and the field that links it.`)
            checkCondition(raw.where, `${label} › rows`, report)
            checkBlocks(raw.blocks, `${label} › blocks`, report, true, MAX_REPEAT_BLOCKS)
            break
        case 'relatedList':
            if (!Array.isArray(raw.columns)) note(report.warnings, `${label}: a related list has no columns.`)
            break
        case 'chart':
            if (raw.chart !== undefined && !includes(CHART_KINDS, raw.chart)) {
                note(report.errors, `${label}: "${String(raw.chart)}" is not a chart kind.`)
            }
            if (raw.template !== undefined && !/^[0-9a-f]{32}$/.test(String(raw.template))) {
                note(report.warnings, `${label}: the chart template is not a sys_id and is ignored.`)
            }
            break
        case 'image':
            checkPicture(raw.source, label, report)
            break
    }
    return true
}

function checkPicture(source: unknown, where: string, report: Report) {
    if (typeof source !== 'string' || !source) return
    if (
        !/^data:image\/(png|jpe?g);base64,/i.test(source) &&
        !/^attachment:templater-[0-9a-f]{16,64}\.(png|jpg)$/.test(source)
    ) {
        note(
            report.warnings,
            `${where}: a picture must be a PNG or JPEG data: URL or a Templater attachment; it is left out.`
        )
    }
}

/* -------------------------------------------------------------- the bodies */

/**
 * Checks a document or deck template body. An empty body is fine: the
 * designer starts it from the table's fields.
 */
export function checkTemplateBody(raw: unknown): BodyCheck {
    const report: Report = { errors: [], warnings: [] }
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
        return { ok: true, ...report }
    }
    const parsed = parse(raw, 'A template body', report)
    if (!parsed) return { ok: false, ...report }

    if (typeof parsed.version === 'number' && parsed.version > TEMPLATE_BODY_VERSION) {
        note(
            report.warnings,
            `The body is version ${parsed.version}; this version of Templater reads up to ${TEMPLATE_BODY_VERSION}, and may leave out what it does not know.`
        )
    }
    const body = migrateTemplateBody(parsed)

    if (!isRecord(body.page)) note(report.warnings, 'The body has no `page`; the defaults are used.')
    if (checkBlocks(body.blocks, 'blocks', report, false, MAX_BLOCKS) === 0 && !report.errors.length) {
        note(report.errors, 'A template needs at least one block.')
    }
    checkBlocks(body.cover, 'cover', report, false, MAX_BLOCKS)
    if (isRecord(body.header)) {
        checkPicture(body.header.logo, 'letterhead', report)
        checkCondition(body.header.when, 'letterhead', report)
    }
    if (isRecord(body.watermark)) checkCondition(body.watermark.when, 'watermark', report)
    checkCondition(body.coverWhen, 'cover', report)

    return { ok: report.errors.length === 0, ...report, value: body }
}

/** Checks a chart template's body. */
export function checkChartBody(raw: unknown): BodyCheck {
    const report: Report = { errors: [], warnings: [] }
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
        return { ok: true, ...report }
    }
    const body = parse(raw, 'A chart body', report)
    if (!body) return { ok: false, ...report }
    if (body.chart !== undefined && !includes(CHART_KINDS, body.chart)) {
        note(report.errors, `"${String(body.chart)}" is not a chart kind (${CHART_KINDS.join(', ')}).`)
    }
    if (body.measure !== undefined && !includes(CHART_MEASURES, body.measure)) {
        note(report.errors, `"${String(body.measure)}" is not a measure (${CHART_MEASURES.join(', ')}).`)
    }
    if (!body.groupBy) note(report.warnings, 'The chart has no field to group by, so it draws nothing yet.')
    return { ok: report.errors.length === 0, ...report, value: body }
}

/** Checks a template body of any kind. */
export const checkBody = (kind: string, raw: unknown): BodyCheck =>
    kind === 'chart' ? checkChartBody(raw) : checkTemplateBody(raw)

/** Checks a presentation body: its custom slides, sections and running order. */
export function checkPresentationBody(raw: unknown): BodyCheck {
    const report: Report = { errors: [], warnings: [] }
    if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
        return { ok: true, ...report }
    }
    const parsed = parse(raw, 'A presentation body', report)
    if (!parsed) return { ok: false, ...report }
    const body = migratePresentationBody(parsed)

    const slides = body.slides
    if (slides !== undefined && !Array.isArray(slides)) note(report.errors, '`slides` must be a list.')
    if (Array.isArray(slides)) {
        if (slides.length > MAX_CUSTOM_SLIDES)
            note(report.warnings, `Only the first ${MAX_CUSTOM_SLIDES} custom slides are kept.`)
        slides.slice(0, MAX_CUSTOM_SLIDES).forEach((slide, index) => {
            const where = `slide ${index + 1}`
            if (!isRecord(slide) || typeof slide.id !== 'string' || !slide.id) {
                note(report.errors, `${where} needs an id.`)
                return
            }
            const elements = Array.isArray(slide.elements) ? slide.elements : []
            if (elements.length > MAX_ELEMENTS)
                note(report.warnings, `${where}: only the first ${MAX_ELEMENTS} elements are kept.`)
            elements.slice(0, MAX_ELEMENTS).forEach((element, at) => {
                const label = `${where} › element ${at + 1}`
                if (!isRecord(element) || !includes(ELEMENT_TYPES, element.type)) {
                    note(
                        report.errors,
                        `${label}: "${String(isRecord(element) ? element.type : element)}" is not an element type.`
                    )
                    return
                }
                if (element.type === 'shape' && element.shape !== undefined && !includes(SHAPE_KINDS, element.shape)) {
                    note(report.errors, `${label}: "${String(element.shape)}" is not a shape.`)
                }
                if (element.type === 'image') checkPicture(element.source, label, report)
                if (isRecord(element.build) && !includes(BUILD_EFFECTS, element.build.effect)) {
                    note(
                        report.warnings,
                        `${label}: "${String(element.build.effect)}" is not a build effect; it appears instead.`
                    )
                }
            })
        })
    }

    if (body.order !== undefined && !Array.isArray(body.order)) note(report.errors, '`order` must be a list.')
    if (Array.isArray(body.sections) && body.sections.length > MAX_SECTIONS) {
        note(report.warnings, `Only the first ${MAX_SECTIONS} sections are kept.`)
    }
    if (body.transition !== undefined && !includes(TRANSITIONS, body.transition)) {
        note(report.errors, `"${String(body.transition)}" is not a transition (${TRANSITIONS.join(', ')}).`)
    }
    return { ok: report.errors.length === 0, ...report, value: body }
}
