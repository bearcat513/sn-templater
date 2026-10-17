import type { RelatedRows, RenderJob } from '../engine/render'
import type { PdfBlock, PdfTemplate } from '../engine/template'

/** One slide: a run of blocks between page breaks, and the record it belongs to. */
export type Slide = {
    /** -1 for the cover, otherwise the record's index in the job. */
    owner: number
    blocks: PdfBlock[]
    values: Record<string, string>
    related: Record<string, RelatedRows>
    /** What the presenter calls it. */
    label: string
    /** 1-based position within its own record, and how many slides that record has. */
    part: number
    parts: number
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
        runs.forEach((blocks, index) =>
            slides.push({
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
