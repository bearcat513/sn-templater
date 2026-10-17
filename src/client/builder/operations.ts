import {
    cloneElement,
    cloneSlide,
    customKey,
    isCustomKey,
    newId,
    orderOf,
    type CustomSlide,
    type ImageElement,
    type LineElement,
    type PresentationBody,
    type ShapeElement,
    type ShapeKind,
    type SlideElement,
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

export function newShape(sheet: Sheet, shape: ShapeKind): ShapeElement {
    const side = Math.round(Math.min(sheet.width, sheet.height) * 0.3)
    return {
        type: 'shape',
        shape,
        id: newId(),
        ...centred(sheet, shape === 'ellipse' || shape === 'triangle' ? side : Math.round(side * 1.6), side),
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
