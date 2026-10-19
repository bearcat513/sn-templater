import {
    cloneElement,
    cloneSlide,
    customKey,
    isCustomKey,
    newId,
    orderOf,
    type ChartElement,
    type CustomSlide,
    type ImageElement,
    type LineElement,
    type PresentationBody,
    type ShapeElement,
    type ShapeKind,
    type SlideElement,
    type TableElement,
} from '../engine/presentation'
import type { PdfPageSetup } from '../engine/template'
import type { Slide } from '../slides/paginate'

/*
 * Everything the slide builder does to a presentation, as pure functions of
 * the body: the builder holds one body in its undo history and replaces it
 * with what these return. The running order is always written out whole —
 * from the slides as they are arranged now — so a new record slide the
 * arrangement placed is pinned where the author saw it.
 */

/* --------------------------------- slides -------------------------------- */

export function insertSlide(body: PresentationBody, slides: Slide[], at: number, slide: CustomSlide): PresentationBody {
    const order = orderOf(slides)
    order.splice(Math.max(0, Math.min(at, order.length)), 0, { key: customKey(slide.id) })
    return { ...body, slides: [...body.slides, slide], order }
}

export function moveSlide(body: PresentationBody, slides: Slide[], from: number, to: number): PresentationBody {
    const order = orderOf(slides)
    if (from < 0 || from >= order.length) return body
    const [moved] = order.splice(from, 1)
    order.splice(Math.max(0, Math.min(to, order.length)), 0, moved!)
    return { ...body, order }
}

export function setHidden(body: PresentationBody, slides: Slide[], key: string, hidden: boolean): PresentationBody {
    return { ...body, order: orderOf(slides.map(slide => (slide.key === key ? { ...slide, hidden } : slide))) }
}

export function deleteSlide(body: PresentationBody, slides: Slide[], key: string): PresentationBody {
    if (!isCustomKey(key)) return body
    const id = key.slice('custom:'.length)
    return {
        ...body,
        slides: body.slides.filter(slide => slide.id !== id),
        order: orderOf(slides.filter(slide => slide.key !== key)),
    }
}

/** A custom slide copied in after itself. A record slide is the template's to draw, so it has no copy. */
export function duplicateSlide(body: PresentationBody, slides: Slide[], key: string): { body: PresentationBody; key: string } {
    const at = slides.findIndex(slide => slide.key === key)
    const original = slides[at]?.custom
    if (!original) return { body, key }
    const copy = cloneSlide(original)
    return { body: insertSlide(body, slides, at + 1, copy), key: customKey(copy.id) }
}

export function updateSlide(
    body: PresentationBody,
    id: string,
    change: (slide: CustomSlide) => CustomSlide
): PresentationBody {
    return { ...body, slides: body.slides.map(slide => (slide.id === id ? change(slide) : slide)) }
}

/* -------------------------------- elements ------------------------------- */

export type Box = { x: number; y: number; w: number; h: number }

export const patchElements = (
    slide: CustomSlide,
    ids: string[],
    patch: Partial<SlideElement> | ((element: SlideElement) => Partial<SlideElement>)
): CustomSlide => ({
    ...slide,
    elements: slide.elements.map(element =>
        ids.includes(element.id)
            ? ({ ...element, ...(typeof patch === 'function' ? patch(element) : patch) } as SlideElement)
            : element
    ),
})

export const removeElements = (slide: CustomSlide, ids: string[]): CustomSlide => ({
    ...slide,
    elements: slide.elements.filter(element => !ids.includes(element.id)),
})

export const addElements = (slide: CustomSlide, elements: SlideElement[]): CustomSlide => ({
    ...slide,
    elements: [...slide.elements, ...elements],
})

/** Copies of elements, a little down and to the right of the originals, so they can be seen. */
export const offsetCopies = (elements: SlideElement[], by = 12): SlideElement[] =>
    elements.map(element => ({ ...cloneElement(element), x: element.x + by, y: element.y + by }))

export type Arrange = 'front' | 'forward' | 'backward' | 'back'

/** Changes the stacking of the selected elements, keeping their order among themselves. */
export function arrange(slide: CustomSlide, ids: string[], how: Arrange): CustomSlide {
    const list = [...slide.elements]
    const picked = list.filter(element => ids.includes(element.id))
    const rest = list.filter(element => !ids.includes(element.id))
    if (how === 'front') return { ...slide, elements: [...rest, ...picked] }
    if (how === 'back') return { ...slide, elements: [...picked, ...rest] }

    // One step: each selected element swaps with its neighbour, working from the end it moves towards.
    const step = how === 'forward' ? 1 : -1
    const indices = list.map((element, index) => (ids.includes(element.id) ? index : -1)).filter(index => index >= 0)
    if (step > 0) indices.reverse()
    for (const index of indices) {
        const target = index + step
        if (target < 0 || target >= list.length || ids.includes(list[target]!.id)) continue
        ;[list[index], list[target]] = [list[target]!, list[index]!]
    }
    return { ...slide, elements: list }
}

export const boundsOf = (boxes: Box[]): Box | null => {
    if (!boxes.length) return null
    const left = Math.min(...boxes.map(box => box.x))
    const top = Math.min(...boxes.map(box => box.y))
    const right = Math.max(...boxes.map(box => box.x + box.w))
    const bottom = Math.max(...boxes.map(box => box.y + box.h))
    return { x: left, y: top, w: right - left, h: bottom - top }
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/**
 * Lines elements up — with each other when there are several, with the
 * slide when there is one, as PowerPoint does.
 */
export function align(slide: CustomSlide, ids: string[], how: Alignment, sheet: { width: number; height: number }): CustomSlide {
    const picked = slide.elements.filter(element => ids.includes(element.id))
    const frame = picked.length > 1 ? boundsOf(picked)! : { x: 0, y: 0, w: sheet.width, h: sheet.height }
    return patchElements(slide, ids, element => {
        switch (how) {
            case 'left':
                return { x: frame.x }
            case 'center':
                return { x: frame.x + (frame.w - element.w) / 2 }
            case 'right':
                return { x: frame.x + frame.w - element.w }
            case 'top':
                return { y: frame.y }
            case 'middle':
                return { y: frame.y + (frame.h - element.h) / 2 }
            case 'bottom':
                return { y: frame.y + frame.h - element.h }
        }
    })
}

/** Spaces three or more elements evenly between the outermost two. */
export function distribute(slide: CustomSlide, ids: string[], axis: 'x' | 'y'): CustomSlide {
    const picked = slide.elements.filter(element => ids.includes(element.id))
    if (picked.length < 3) return slide
    const size = axis === 'x' ? 'w' : 'h'
    const sorted = [...picked].sort((a, b) => a[axis] - b[axis])
    const first = sorted[0]!
    const last = sorted[sorted.length - 1]!
    const span = last[axis] + last[size] - first[axis]
    const used = sorted.reduce((sum, element) => sum + element[size], 0)
    const gap = (span - used) / (sorted.length - 1)
    const placed = new Map<string, number>()
    let cursor = first[axis]
    for (const element of sorted) {
        placed.set(element.id, cursor)
        cursor += element[size] + gap
    }
    return patchElements(slide, ids, element => ({ [axis]: placed.get(element.id) ?? element[axis] }))
}

/* ------------------------------- new elements ---------------------------- */

type Sheet = { width: number; height: number; page: PdfPageSetup }

const centred = (sheet: Sheet, w: number, h: number): Box => ({
    x: Math.round((sheet.width - w) / 2),
    y: Math.round((sheet.height - h) / 2),
    w,
    h,
})

export function newTextBox(sheet: Sheet): ShapeElement {
    return {
        type: 'shape',
        shape: 'rect',
        id: newId(),
        ...centred(sheet, Math.round(sheet.width * 0.4), Math.round(sheet.page.fontSize * 3)),
        text: '',
        placeholder: 'Click to add text',
        size: Math.max(14, sheet.page.fontSize + 2),
        color: sheet.page.textColor,
        align: 'left',
        valign: 'top',
    }
}

/** Shapes that look wrong stretched: they start as wide as they are tall. */
const SQUARE_SHAPES: ShapeKind[] = ['ellipse', 'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon', 'star']

export function newShape(sheet: Sheet, shape: ShapeKind): ShapeElement {
    const side = Math.round(Math.min(sheet.width, sheet.height) * 0.3)
    return {
        type: 'shape',
        shape,
        id: newId(),
        ...centred(sheet, SQUARE_SHAPES.includes(shape) ? side : Math.round(side * 1.6), side),
        fill: sheet.page.accentColor,
        text: '',
        size: Math.max(14, sheet.page.fontSize + 2),
        color: '#ffffff',
        align: 'center',
        valign: 'middle',
    }
}

export function newLine(sheet: Sheet, arrow: boolean): LineElement {
    const w = Math.round(sheet.width * 0.3)
    return {
        type: 'line',
        id: newId(),
        x: Math.round((sheet.width - w) / 2),
        y: Math.round(sheet.height / 2),
        w,
        h: 0,
        stroke: sheet.page.textColor,
        strokeWidth: 2,
        ...(arrow ? { arrowEnd: true } : {}),
    }
}

/** A box of code: a dark panel, a fixed-width face, every space kept. */
export function newCodeBox(sheet: Sheet): ShapeElement {
    return {
        type: 'shape',
        shape: 'roundRect',
        id: newId(),
        ...centred(sheet, Math.round(sheet.width * 0.6), Math.round(sheet.height * 0.4)),
        fill: '#0f172a',
        text: '',
        placeholder: 'Paste or type code',
        size: 14,
        color: '#e2e8f0',
        family: 'courier',
        align: 'left',
        valign: 'top',
        lineHeight: 1.35,
        code: true,
    }
}

/** A table of `rows` by `columns`, its first row a header in the deck's accent. */
export function newTable(sheet: Sheet, rows: number, columns: number): TableElement {
    const size = Math.max(12, sheet.page.fontSize)
    const w = Math.round(Math.min(sheet.width * 0.8, columns * 160))
    const h = Math.round(Math.min(sheet.height * 0.7, rows * size * 2.4))
    return {
        type: 'table',
        id: newId(),
        ...centred(sheet, w, h),
        rows: Array.from({ length: rows }, (_, row) =>
            Array.from({ length: columns }, (_, column) => (row === 0 ? `Heading ${column + 1}` : ''))
        ),
        header: true,
        size,
        color: sheet.page.textColor,
        align: 'left',
        headerFill: sheet.page.accentColor,
        headerColor: '#ffffff',
        banded: '#f3f4f6',
        fill: '#ffffff',
        border: '#d1d5db',
    }
}

/* --------------------------------- tables -------------------------------- */

/** A table with one cell's text changed. */
export const setCell = (table: TableElement, row: number, column: number, text: string): Partial<TableElement> => ({
    rows: table.rows.map((cells, at) => (at === row ? cells.map((cell, index) => (index === column ? text : cell)) : cells)),
})

/** A row added after `at` (or at the end), keeping each row's height: the table grows to hold it. */
export function insertRow(table: TableElement, at = table.rows.length - 1): Partial<TableElement> {
    const width = table.rows[0]?.length ?? 1
    const rows = [...table.rows]
    rows.splice(at + 1, 0, Array.from({ length: width }, () => ''))
    return { rows, h: Math.round((table.h / table.rows.length) * rows.length) }
}

export function removeRow(table: TableElement, at: number): Partial<TableElement> {
    if (table.rows.length <= 1) return {}
    const rows = table.rows.filter((_, index) => index !== at)
    return { rows, h: Math.max(8, Math.round((table.h / table.rows.length) * rows.length)) }
}

/** A column added after `at` (or at the end), taking an equal share; the table keeps its width. */
export function insertColumn(table: TableElement, at = (table.rows[0]?.length ?? 1) - 1): Partial<TableElement> {
    const width = table.rows[0]?.length ?? 1
    const shares = table.columns ?? Array.from({ length: width }, () => 1)
    const average = shares.reduce((sum, share) => sum + share, 0) / shares.length
    const columns = [...shares]
    columns.splice(at + 1, 0, average)
    return {
        rows: table.rows.map(cells => {
            const next = [...cells]
            next.splice(at + 1, 0, '')
            return next
        }),
        columns: table.columns ? columns : undefined,
    }
}

export function removeColumn(table: TableElement, at: number): Partial<TableElement> {
    const width = table.rows[0]?.length ?? 1
    if (width <= 1) return {}
    return {
        rows: table.rows.map(cells => cells.filter((_, index) => index !== at)),
        columns: table.columns?.filter((_, index) => index !== at),
    }
}

/* -------------------------------- formatting ----------------------------- */

/** What the format painter copies: how an element looks, and nothing about where it is or what it says. */
export type CopiedStyle = { type: SlideElement['type']; style: Record<string, unknown> }

const SHAPE_STYLE = ['fill', 'stroke', 'strokeWidth', 'size', 'color', 'bold', 'italic', 'underline', 'align', 'valign', 'family', 'bullets', 'lineHeight', 'code', 'opacity'] as const
const LINE_STYLE = ['stroke', 'strokeWidth', 'dashed', 'arrowStart', 'arrowEnd', 'opacity'] as const
const IMAGE_STYLE = ['stroke', 'strokeWidth', 'opacity'] as const
const TABLE_STYLE = ['size', 'color', 'family', 'align', 'header', 'headerFill', 'headerColor', 'banded', 'fill', 'border', 'opacity'] as const
const CHART_STYLE = ['hideTitle', 'opacity'] as const

const STYLE_KEYS: Record<SlideElement['type'], readonly string[]> = {
    shape: SHAPE_STYLE,
    line: LINE_STYLE,
    image: IMAGE_STYLE,
    table: TABLE_STYLE,
    chart: CHART_STYLE,
}

export function styleOf(element: SlideElement): CopiedStyle {
    const style: Record<string, unknown> = {}
    for (const key of STYLE_KEYS[element.type]) style[key] = (element as Record<string, unknown>)[key]
    return { type: element.type, style }
}

/**
 * The copied look, as a patch for another element. Only what makes sense on
 * the target is carried over — a line's dashes do not reach a picture, but
 * any outline reaches anything that has one, and text styles reach a table.
 */
export function styleFor(element: SlideElement, copied: CopiedStyle): Partial<SlideElement> {
    const allowed = new Set(STYLE_KEYS[element.type])
    const patch: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(copied.style)) if (allowed.has(key)) patch[key] = value
    return patch as Partial<SlideElement>
}

/* --------------------------------- builds -------------------------------- */

/** The next place in a slide's build sequence. */
export const nextBuildOrder = (slide: CustomSlide): number =>
    Math.max(0, ...slide.elements.map(element => element.build?.order ?? 0)) + 1

/** One element's build moved earlier or later, swapping places with its neighbour in the sequence. */
export function moveBuild(slide: CustomSlide, sequence: string[], id: string, by: -1 | 1): CustomSlide {
    const at = sequence.indexOf(id)
    const other = sequence[at + by]
    if (at === -1 || !other) return slide
    // Renumbered first, so two steps that shared an order come apart cleanly.
    const order = new Map(sequence.map((each, index) => [each, index + 1]))
    order.set(id, at + by + 1)
    order.set(other, at + 1)
    return patchElements(slide, sequence, element => ({ build: { ...element.build!, order: order.get(element.id)! } }))
}

/** A chart template, placed in the middle of the slide over most of its content area. */
export function newChart(sheet: Sheet, template: { sysId: string; name: string }): ChartElement {
    const { margins } = sheet.page
    const w = Math.round((sheet.width - margins.left - margins.right) * 0.7)
    const h = Math.round((sheet.height - margins.top - margins.bottom) * 0.7)
    return { type: 'chart', id: newId(), ...centred(sheet, w, h), template: template.sysId, name: template.name }
}

/** A picture at its own proportions, as large as fits in the middle half of the slide. */
export function newImage(sheet: Sheet, source: string, natural: { width: number; height: number }): ImageElement {
    const scale = Math.min((sheet.width * 0.5) / natural.width, (sheet.height * 0.6) / natural.height, 1)
    const w = Math.max(8, Math.round(natural.width * scale))
    const h = Math.max(8, Math.round(natural.height * scale))
    return { type: 'image', id: newId(), ...centred(sheet, w, h), source }
}

/* ---------------------------------- lines -------------------------------- */

/**
 * A line's box from its two ends, in drawing order. The box always runs left
 * to right, so when the ends cross over, the arrowheads swap with them.
 */
export function lineFromEnds(
    line: LineElement,
    start: [number, number],
    end: [number, number]
): Pick<LineElement, 'x' | 'y' | 'w' | 'h' | 'flip' | 'arrowStart' | 'arrowEnd'> {
    const swapped = start[0] > end[0]
    const [a, b] = swapped ? [end, start] : [start, end]
    return {
        x: a[0],
        y: Math.min(a[1], b[1]),
        w: b[0] - a[0],
        h: Math.abs(b[1] - a[1]),
        flip: a[1] > b[1] ? true : undefined,
        arrowStart: (swapped ? line.arrowEnd : line.arrowStart) || undefined,
        arrowEnd: (swapped ? line.arrowStart : line.arrowEnd) || undefined,
    }
}

/* -------------------------------- snapping ------------------------------- */

export type Guide = { axis: 'x' | 'y'; at: number }

/**
 * Moves a box the least distance that lines one of its edges or its centre up
 * with an edge or centre of the slide or of another element, within
 * `threshold` points — and says which lines it snapped to, so they can be drawn.
 */
export function snap(
    box: Box,
    others: Box[],
    sheet: { width: number; height: number },
    threshold: number
): { dx: number; dy: number; guides: Guide[] } {
    const xs = [0, sheet.width / 2, sheet.width, ...others.flatMap(other => [other.x, other.x + other.w / 2, other.x + other.w])]
    const ys = [0, sheet.height / 2, sheet.height, ...others.flatMap(other => [other.y, other.y + other.h / 2, other.y + other.h])]
    const best = (edges: number[], targets: number[]) => {
        let found: { delta: number; at: number } | null = null
        for (const edge of edges)
            for (const target of targets) {
                const delta = target - edge
                if (Math.abs(delta) <= threshold && (!found || Math.abs(delta) < Math.abs(found.delta))) found = { delta, at: target }
            }
        return found
    }
    const x = best([box.x, box.x + box.w / 2, box.x + box.w], xs)
    const y = best([box.y, box.y + box.h / 2, box.y + box.h], ys)
    const guides: Guide[] = []
    if (x) guides.push({ axis: 'x', at: x.at })
    if (y) guides.push({ axis: 'y', at: y.at })
    return { dx: x?.delta ?? 0, dy: y?.delta ?? 0, guides }
}
