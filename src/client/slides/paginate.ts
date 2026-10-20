import type { RenderJob, SlideSource } from '../engine/render'
import {
    DEFAULT_TRANSITION,
    arrangeKeys,
    customKey,
    sectionKey,
    slideName,
    type CustomSlide,
    type DeckSection,
    type PresentationBody,
    type Transition,
} from '../engine/presentation'
import type { PdfBlock, PdfTemplate } from '../engine/template'

/** One slide: a run of blocks between page breaks and the record it belongs to, or a custom slide. */
export type Slide = SlideSource & {
    /**
     * What the slide is, stably across loads: `cover:1`, `record:<sys_id>:2`,
     * `custom:<id>`. A presentation's running order is written in these.
     */
    key: string
    /** What the presenter calls it. */
    label: string
    /** 1-based position within its own record, and how many slides that record has. */
    part: number
    parts: number
    /** Left out of the show and the PDF, but kept in the presentation. */
    hidden?: boolean
    /** For the speaker, in the presenter only. */
    notes?: string
    /** How the presenter brings it in. Absent is the presenter's own fade. */
    transition?: Transition
    /**
     * A section's header: where a template placed in the deck sits in the
     * order. The builder shows it in the slide sorter; it is never presented.
     */
    marker?: DeckSection
}

/** Blocks split at every page break: one run per page. */
function split(blocks: PdfBlock[]): PdfBlock[][] {
    const runs: PdfBlock[][] = [[]]
    for (const block of blocks) {
        if (block.type === 'pageBreak') runs.push([])
        else runs[runs.length - 1]!.push(block)
    }
    return runs.filter((run, index) => run.length || index === 0)
}

/**
 * The slides a deck is made of, in order — the cover first, then each record.
 *
 * A record is one slide unless its template has page breaks, in which case it
 * is one slide per run of blocks between them: the same rule the PDF follows.
 */
export function paginate(template: PdfTemplate, job: RenderJob, within?: Within): Slide[] {
    const slides: Slide[] = []
    const prefix = within ? `${sectionKey(within.section.id)}:` : ''
    const own = within ? { template } : {}

    if (template.cover?.length) {
        const runs = split(template.cover)
        runs.forEach((blocks, index) =>
            slides.push({
                ...own,
                key: `${prefix}cover:${index + 1}`,
                owner: within ? within.coverOwner : -1,
                blocks,
                values: job.coverValues,
                related: {},
                charts: job.charts,
                label: 'Cover',
                part: index + 1,
                parts: runs.length,
            })
        )
    }

    job.records.forEach((record, index) => {
        const owner = (within?.ownerBase ?? 0) + index
        const runs = split(template.blocks)
        const identity = record.values['raw.sys_id'] || String(index)
        runs.forEach((blocks, index) =>
            slides.push({
                ...own,
                key: `${prefix}record:${identity}:${index + 1}`,
                owner,
                blocks,
                values: record.values,
                related: record.related,
                charts: job.charts,
                label: record.label,
                part: index + 1,
                parts: runs.length,
            })
        )
    })

    return slides
}

/**
 * Where a section's slides go among the deck's: under its key, drawn by its
 * own template, and numbered apart from every other section's — the PDF
 * counts a footer's "Page 1 of 2" by owner.
 */
export type Within = {
    section: DeckSection
    /** Its title slide's owner: below every custom slide's. */
    coverOwner: number
    /** Its first record's owner: after every record before it in the deck. */
    ownerBase: number
}

/** A section's owners: its title slide's and its header's, clear of the deck's (-1) and the custom slides' (-2 and down). */
export const sectionCoverOwner = (index: number): number => -1000 - index
const sectionMarkerOwner = (index: number): number => -2000 - index

/** A section's header in the sorter: no blocks, never shown. */
export function sectionMarker(section: DeckSection, index: number, job: RenderJob, label: string): Slide {
    return {
        key: sectionKey(section.id),
        owner: sectionMarkerOwner(index),
        blocks: [],
        values: job.coverValues,
        related: {},
        label,
        part: 1,
        parts: 1,
        marker: section,
    }
}

/** A custom slide as a slide: the deck's values, no record, no blocks. */
export function customSlide(slide: CustomSlide, job: RenderJob, index: number): Slide {
    return {
        key: customKey(slide.id),
        owner: -2 - index,
        blocks: [],
        custom: slide,
        values: job.coverValues,
        related: {},
        charts: job.charts,
        label: slideName(slide),
        part: 1,
        parts: 1,
    }
}

/**
 * A presentation's slides, in its own running order — hidden ones included
 * and flagged, for the builder — with `{{slide.number}}` and
 * `{{slide.count}}` counted over the slides that will actually be shown.
 *
 * Takes the deck already paginated, so a caller that re-arranges on every
 * edit keeps the same record slides — and can tell which thumbnails changed.
 */
export function arrange(generated: Slide[], job: RenderJob, body: PresentationBody): Slide[] {
    const custom = body.slides.map((slide, index) => customSlide(slide, job, index))
    const placed = arrangeKeys(generated, custom, body.order)
    const count = placed.filter(entry => !entry.hidden && !entry.item.marker).length
    let number = 0
    return placed.map(({ item, hidden }) => {
        if (item.marker) return { ...item, hidden: hidden || undefined }
        if (!hidden) number++
        const options = body.options?.[item.key]
        return {
            ...item,
            hidden: hidden || undefined,
            notes: options?.notes,
            transition: options?.transition ?? body.transition ?? DEFAULT_TRANSITION,
            values: {
                ...item.values,
                'slide.number': hidden ? '' : String(number),
                'slide.count': String(count),
            },
        }
    })
}

/** The slides that are shown: not hidden, and not a section's header. */
export const shown = (slides: Slide[]): Slide[] => slides.filter(slide => !slide.hidden && !slide.marker)
