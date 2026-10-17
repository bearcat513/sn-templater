import type { RenderJob, SlideSource } from '../engine/render'
import {
    arrangeKeys,
    customKey,
    slideName,
    type CustomSlide,
    type PresentationBody,
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
export function paginate(template: PdfTemplate, job: RenderJob): Slide[] {
    const slides: Slide[] = []

    if (template.cover?.length) {
        const runs = split(template.cover)
        runs.forEach((blocks, index) =>
            slides.push({
                key: `cover:${index + 1}`,
                owner: -1,
                blocks,
                values: job.coverValues,
                related: {},
                label: 'Cover',
                part: index + 1,
                parts: runs.length,
            })
        )
    }

    job.records.forEach((record, owner) => {
        const runs = split(template.blocks)
        const identity = record.values['raw.sys_id'] || String(owner)
        runs.forEach((blocks, index) =>
            slides.push({
                key: `record:${identity}:${index + 1}`,
                owner,
                blocks,
                values: record.values,
                related: record.related,
                label: record.label,
                part: index + 1,
                parts: runs.length,
            })
        )
    })

    return slides
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
    const count = placed.filter(entry => !entry.hidden).length
    let number = 0
    return placed.map(({ item, hidden }) => {
        if (!hidden) number++
        return {
            ...item,
            hidden: hidden || undefined,
            values: {
                ...item.values,
                'slide.number': hidden ? '' : String(number),
                'slide.count': String(count),
            },
        }
    })
}

/** The slides that are shown. */
export const shown = (slides: Slide[]): Slide[] => slides.filter(slide => !slide.hidden)
