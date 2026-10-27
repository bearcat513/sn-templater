import { gs } from '@servicenow/glide'

/**
 * A template's page, as the scripts need it to place things on a slide: its
 * size in points and its margins. The values match the browser's
 * (src/client/engine/pdf.ts and template.ts).
 */

export type Margins = { top: number; right: number; bottom: number; left: number }

export type PageSetup = {
    size: string
    landscape?: boolean
    margins: Margins
    family?: string
    fontSize: number
    textColor: string
    mutedColor: string
    accentColor: string
    background?: string
}

export const PAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
    A4: { width: 595.28, height: 841.89 },
    Letter: { width: 612, height: 792 },
    Legal: { width: 612, height: 1008 },
    Slide16x9: { width: 960, height: 540 },
    Slide4x3: { width: 720, height: 540 },
}

export const DEFAULT_PAGE: PageSetup = {
    size: 'A4',
    margins: { top: 56, right: 48, bottom: 56, left: 48 },
    family: 'helvetica',
    fontSize: 10,
    textColor: '#18181b',
    mutedColor: '#71717a',
    accentColor: '#18181b',
}

/** A presentation built from nothing: the starter deck's slide (src/client/engine/template.ts, blankDeck). */
export const BLANK_DECK_PAGE: PageSetup = {
    size: 'Slide16x9',
    margins: { top: 48, right: 56, bottom: 44, left: 56 },
    fontSize: 16,
    textColor: '#1f2937',
    mutedColor: '#6b7280',
    accentColor: '#1d4ed8',
    background: '#ffffff',
}

/** A template's page setup with the defaults filled in, as the renderer resolves it. */
export function resolvePage(page: Partial<PageSetup> | undefined): PageSetup {
    const own = page || {}
    const margins: Partial<Margins> = own.margins || {}
    const resolved: PageSetup = {
        ...DEFAULT_PAGE,
        ...own,
        margins: {
            top: margins.top !== undefined ? margins.top : DEFAULT_PAGE.margins.top,
            right: margins.right !== undefined ? margins.right : DEFAULT_PAGE.margins.right,
            bottom: margins.bottom !== undefined ? margins.bottom : DEFAULT_PAGE.margins.bottom,
            left: margins.left !== undefined ? margins.left : DEFAULT_PAGE.margins.left,
        },
    }
    if (!PAGE_DIMENSIONS[resolved.size]) resolved.size = DEFAULT_PAGE.size
    return resolved
}

/** The sheet's size in points: a paper size on its side when landscape; a slide size as it is. */
export function dimensionsOf(page: PageSetup): { width: number; height: number } {
    const dimensions = PAGE_DIMENSIONS[page.size] || PAGE_DIMENSIONS.Slide16x9!
    return page.landscape && !/^Slide/.test(page.size)
        ? { width: dimensions.height, height: dimensions.width }
        : dimensions
}

/** An id for a slide or an element. A whole GUID: the builder accepts up to 40 characters, and a part of one is not sure to be unique. */
export const newId = (): string => String(gs.generateGUID())
