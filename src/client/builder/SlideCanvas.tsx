import React, { useLayoutEffect, useRef, useState } from 'react'
import {
    DEFAULT_LINE_HEIGHT,
    TEXT_INSET_X,
    TEXT_INSET_Y,
    bulletIndent,
    lineEnds,
    textFrame,
} from '../engine/freeform'
import type { CustomSlide, LineElement, ShapeElement, SlideElement } from '../engine/presentation'
import type { PdfTemplate } from '../engine/template'
import { FONT_STACKS } from '../slides/Freeform'
import type { Slide } from '../slides/paginate'
import { SlideView } from '../slides/SlideView'
import { cx } from '../ui/controls'
import { boundsOf, lineFromEnds, snap, type Box, type Guide } from './operations'

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** The smallest a shape may be resized to, in points. */
const MIN_SIZE = 4

/** How close, in screen pixels, an edge has to come to another to snap to it. */
const SNAP_PIXELS = 6

type Drag =
    | { kind: 'move'; start: [number, number]; boxes: Map<string, Box>; moved: boolean; clicked: string | null }
    | { kind: 'resize'; handle: Handle; start: [number, number]; box: Box; id: string; lock: boolean }
    | { kind: 'end'; which: 'start' | 'end'; line: LineElement }
    | { kind: 'marquee'; start: [number, number]; additive: string[] }

type Props = {
    template: PdfTemplate
    slide: Slide & { custom: CustomSlide }
    sheet: { width: number; height: number }
    /** Shown width in CSS pixels. */
    width: number
    selection: string[]
    onSelect: (ids: string[]) => void
    editing: string | null
    onEditing: (id: string | null) => void
    onChange: (change: (slide: CustomSlide) => CustomSlide, merge?: string) => void
    onDropImage?: (file: File, at: [number, number]) => void
}

let dragCount = 0

/**
 * A custom slide, editable: the slide itself drawn by SlideView — so what is
 * edited is exactly what is presented — under a layer that takes the mouse.
 *
 * Click to select (Shift adds), drag to move, the handles to resize (Shift
 * keeps proportions; a picture keeps them unless Shift is held), the ends of
 * a line to move them, drag on the empty slide to select by area. Edges and
 * centres snap to the slide and to each other; Alt moves freely. Double-click
 * a shape to type in it.
 */
export function SlideCanvas({
    template,
    slide,
    sheet,
    width,
    selection,
    onSelect,
    editing,
    onEditing,
    onChange,
    onDropImage,
}: Props) {
    const scale = width / sheet.width
    const height = sheet.height * scale
    const root = useRef<HTMLDivElement>(null)
    const drag = useRef<Drag | null>(null)
    const merge = useRef('')
    const [guides, setGuides] = useState<Guide[]>([])
    const [marquee, setMarquee] = useState<Box | null>(null)
    const elements = slide.custom.elements
    const selected = elements.filter(element => selection.includes(element.id))

    const toSheet = (event: { clientX: number; clientY: number }): [number, number] => {
        const rect = root.current!.getBoundingClientRect()
        return [(event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale]
    }

    const begin = (event: React.PointerEvent, next: Drag) => {
        event.preventDefault()
        event.stopPropagation()
        root.current?.focus({ preventScroll: true })
        root.current?.setPointerCapture(event.pointerId)
        drag.current = next
        merge.current = `drag:${++dragCount}`
    }

    /* -------------------------------- starting ------------------------------ */

    const onElementDown = (event: React.PointerEvent, element: SlideElement) => {
        if (event.button !== 0) return
        if (editing === element.id) {
            event.stopPropagation()
            return
        }
        const additive = event.shiftKey || event.metaKey || event.ctrlKey
        let ids = selection
        if (additive) {
            ids = selection.includes(element.id) ? selection.filter(id => id !== element.id) : [...selection, element.id]
            onSelect(ids)
            if (!ids.includes(element.id)) {
                event.stopPropagation()
                return
            }
        } else if (!selection.includes(element.id)) {
            ids = [element.id]
            onSelect(ids)
        }
        if (editing) onEditing(null)
        const boxes = new Map<string, Box>()
        for (const each of elements) if (ids.includes(each.id)) boxes.set(each.id, { x: each.x, y: each.y, w: each.w, h: each.h })
        begin(event, {
            kind: 'move',
            start: toSheet(event),
            boxes,
            moved: false,
            // A plain click on one of several selected elements selects just it, once it is clear it was not a drag.
            clicked: !additive && ids.length > 1 ? element.id : null,
        })
    }

    const onHandleDown = (event: React.PointerEvent, element: SlideElement, handle: Handle) => {
        if (event.button !== 0) return
        begin(event, {
            kind: 'resize',
            handle,
            start: toSheet(event),
            box: { x: element.x, y: element.y, w: element.w, h: element.h },
            id: element.id,
            lock: element.type === 'image',
        })
    }

    const onEndDown = (event: React.PointerEvent, line: LineElement, which: 'start' | 'end') => {
        if (event.button !== 0) return
        begin(event, { kind: 'end', which, line })
    }

    const onBackgroundDown = (event: React.PointerEvent) => {
        if (event.button !== 0) return
        if (editing) onEditing(null)
        const additive = event.shiftKey || event.metaKey || event.ctrlKey
        if (!additive) onSelect([])
        begin(event, { kind: 'marquee', start: toSheet(event), additive: additive ? selection : [] })
    }

    /* --------------------------------- moving ------------------------------- */

    const onPointerMove = (event: React.PointerEvent) => {
        const current = drag.current
        if (!current) return
        const point = toSheet(event)

        if (current.kind === 'move') {
            let dx = point[0] - current.start[0]
            let dy = point[1] - current.start[1]
            if (!current.moved && Math.hypot(dx, dy) * scale < 3) return
            current.moved = true
            if (event.shiftKey) {
                if (Math.abs(dx) > Math.abs(dy)) dy = 0
                else dx = 0
            }
            const moving = boundsOf([...current.boxes.values()])!
            let shown: Guide[] = []
            if (!event.altKey) {
                const others = elements.filter(element => !current.boxes.has(element.id))
                const snapped = snap({ ...moving, x: moving.x + dx, y: moving.y + dy }, others, sheet, SNAP_PIXELS / scale)
                if (!(event.shiftKey && dx === 0)) dx += snapped.dx
                if (!(event.shiftKey && dy === 0)) dy += snapped.dy
                shown = snapped.guides
            }
            setGuides(shown)
            const boxes = current.boxes
            onChange(
                live => ({
                    ...live,
                    elements: live.elements.map(element => {
                        const box = boxes.get(element.id)
                        return box ? { ...element, x: Math.round(box.x + dx), y: Math.round(box.y + dy) } : element
                    }),
                }),
                merge.current
            )
            return
        }

        if (current.kind === 'resize') {
            const box = resized(current.box, current.handle, point, current.lock !== event.shiftKey)
            onChange(
                live => ({
                    ...live,
                    elements: live.elements.map(element => (element.id === current.id ? { ...element, ...box } : element)),
                }),
                merge.current
            )
            return
        }

        if (current.kind === 'end') {
            const ends = lineEnds(current.line)
            // `from` is the left end; which one the person grabbed is the end they meant.
            const fixed = current.which === 'start' ? ends.to : ends.from
            let moved: [number, number] = [Math.round(point[0]), Math.round(point[1])]
            if (event.shiftKey) moved = snapAngle(fixed, moved)
            const start = current.which === 'start' ? moved : fixed
            const end = current.which === 'start' ? fixed : moved
            const id = current.line.id
            onChange(
                live => ({
                    ...live,
                    elements: live.elements.map(element =>
                        element.id === id && element.type === 'line'
                            ? { ...element, ...lineFromEnds(current.line, start, end) }
                            : element
                    ),
                }),
                merge.current
            )
            return
        }

        if (current.kind === 'marquee') {
            const box = {
                x: Math.min(current.start[0], point[0]),
                y: Math.min(current.start[1], point[1]),
                w: Math.abs(point[0] - current.start[0]),
                h: Math.abs(point[1] - current.start[1]),
            }
            setMarquee(box)
            const inside = elements
                .filter(element => intersects(box, element))
                .map(element => element.id)
            onSelect([...new Set([...current.additive, ...inside])])
        }
    }

    const onPointerUp = (event: React.PointerEvent) => {
        const current = drag.current
        drag.current = null
        root.current?.releasePointerCapture?.(event.pointerId)
        setGuides([])
        setMarquee(null)
        if (current?.kind === 'move' && !current.moved && current.clicked) onSelect([current.clicked])
    }

    /* -------------------------------- drawing ------------------------------- */

    const editingShape = elements.find(
        (element): element is ShapeElement => element.id === editing && element.type === 'shape'
    )

    return (
        <div
            ref={root}
            className="tp-canvas"
            style={{ width, height }}
            tabIndex={-1}
            onPointerDown={onBackgroundDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={event => {
                // Hit-tested here: the pointer was captured by the canvas, so the click lands on it, not the shape.
                const [x, y] = toSheet(event)
                const hit = [...elements]
                    .reverse()
                    .find(element => x >= element.x && x <= element.x + element.w && y >= element.y && y <= element.y + element.h)
                if (hit?.type !== 'shape') return
                onSelect([hit.id])
                onEditing(hit.id)
            }}
            onDragOver={event => {
                if (onDropImage && event.dataTransfer.types.includes('Files')) event.preventDefault()
            }}
            onDrop={event => {
                const file = event.dataTransfer.files[0]
                if (!onDropImage || !file) return
                event.preventDefault()
                onDropImage(file, toSheet(event))
            }}
        >
            <SlideView
                template={template}
                slide={slide}
                width={width}
                className="tp-canvas__sheet"
                editing={{ placeholders: true, hideTextOf: editing ?? undefined }}
            />

            <div className="tp-canvas__layer">
                {elements.map(element =>
                    element.type === 'line' ? (
                        <LineHit key={element.id} line={element} scale={scale} onPointerDown={event => onElementDown(event, element)} />
                    ) : (
                        <div
                            key={element.id}
                            className={cx('tp-canvas__hit', selection.includes(element.id) && 'is-selected')}
                            style={{
                                left: element.x * scale,
                                top: element.y * scale,
                                width: element.w * scale,
                                height: element.h * scale,
                            }}
                            onPointerDown={event => onElementDown(event, element)}
                        />
                    )
                )}

                {selected.map(element =>
                    element.type === 'line' ? (
                        <LineHandles
                            key={element.id}
                            line={element}
                            scale={scale}
                            onDown={(event, which) => onEndDown(event, element, which)}
                        />
                    ) : (
                        <div
                            key={element.id}
                            className={cx('tp-canvas__selection', editing === element.id && 'is-editing')}
                            style={{
                                left: element.x * scale,
                                top: element.y * scale,
                                width: element.w * scale,
                                height: element.h * scale,
                            }}
                        >
                            {selected.length === 1 &&
                                editing !== element.id &&
                                HANDLES.map(handle => (
                                    <span
                                        key={handle}
                                        className={`tp-canvas__handle tp-canvas__handle--${handle}`}
                                        onPointerDown={event => onHandleDown(event, element, handle)}
                                    />
                                ))}
                        </div>
                    )
                )}

                {guides.map(guide => (
                    <div
                        key={`${guide.axis}${guide.at}`}
                        className={`tp-canvas__guide tp-canvas__guide--${guide.axis}`}
                        style={guide.axis === 'x' ? { left: guide.at * scale } : { top: guide.at * scale }}
                    />
                ))}

                {marquee && (
                    <div
                        className="tp-canvas__marquee"
                        style={{
                            left: marquee.x * scale,
                            top: marquee.y * scale,
                            width: marquee.w * scale,
                            height: marquee.h * scale,
                        }}
                    />
                )}

                {editingShape && (
                    <TextEditor
                        key={editingShape.id}
                        element={editingShape}
                        family={editingShape.family ?? template.page.family}
                        scale={scale}
                        onChange={text =>
                            onChange(
                                live => ({
                                    ...live,
                                    elements: live.elements.map(element =>
                                        element.id === editingShape.id ? { ...element, text } : element
                                    ),
                                }),
                                `text:${editingShape.id}`
                            )
                        }
                        onDone={() => onEditing(null)}
                    />
                )}
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ helpers */

function resized(box: Box, handle: Handle, point: [number, number], keepAspect: boolean): Box {
    let left = box.x
    let top = box.y
    let right = box.x + box.w
    let bottom = box.y + box.h
    if (handle.includes('w')) left = Math.min(point[0], right - MIN_SIZE)
    if (handle.includes('e')) right = Math.max(point[0], left + MIN_SIZE)
    if (handle.includes('n')) top = Math.min(point[1], bottom - MIN_SIZE)
    if (handle.includes('s')) bottom = Math.max(point[1], top + MIN_SIZE)

    if (keepAspect && handle.length === 2 && box.h > 0) {
        const ratio = box.w / box.h
        let w = right - left
        let h = bottom - top
        if (w / h > ratio) w = h * ratio
        else h = w / ratio
        if (handle.includes('w')) left = right - w
        else right = left + w
        if (handle.includes('n')) top = bottom - h
        else bottom = top + h
    }
    return {
        x: Math.round(left),
        y: Math.round(top),
        w: Math.max(MIN_SIZE, Math.round(right - left)),
        h: Math.max(MIN_SIZE, Math.round(bottom - top)),
    }
}

/** The end of a line turned to the nearest 45°. */
function snapAngle(fixed: [number, number], moved: [number, number]): [number, number] {
    const dx = moved[0] - fixed[0]
    const dy = moved[1] - fixed[1]
    const length = Math.hypot(dx, dy)
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    return [Math.round(fixed[0] + Math.cos(angle) * length), Math.round(fixed[1] + Math.sin(angle) * length)]
}

const intersects = (area: Box, element: Box): boolean =>
    area.w > 0 &&
    area.h > 0 &&
    element.x < area.x + area.w &&
    element.x + Math.max(element.w, 1) > area.x &&
    element.y < area.y + area.h &&
    element.y + Math.max(element.h, 1) > area.y

/** A line is picked up by a band along it, not by its box — a diagonal's box is mostly empty. */
function LineHit({
    line,
    scale,
    onPointerDown,
}: {
    line: LineElement
    scale: number
    onPointerDown: (event: React.PointerEvent) => void
}) {
    const pad = 8
    const { from, to } = lineEnds(line)
    return (
        <svg
            className="tp-canvas__line-hit"
            style={{
                left: line.x * scale - pad,
                top: line.y * scale - pad,
                width: line.w * scale + pad * 2,
                height: line.h * scale + pad * 2,
            }}
        >
            <line
                x1={(from[0] - line.x) * scale + pad}
                y1={(from[1] - line.y) * scale + pad}
                x2={(to[0] - line.x) * scale + pad}
                y2={(to[1] - line.y) * scale + pad}
                strokeWidth={Math.max(12, line.strokeWidth * scale + 8)}
                onPointerDown={onPointerDown}
            />
        </svg>
    )
}

function LineHandles({
    line,
    scale,
    onDown,
}: {
    line: LineElement
    scale: number
    onDown: (event: React.PointerEvent, which: 'start' | 'end') => void
}) {
    const { from, to } = lineEnds(line)
    return (
        <>
            {(
                [
                    ['start', from],
                    ['end', to],
                ] as const
            ).map(([which, point]) => (
                <span
                    key={which}
                    className="tp-canvas__handle tp-canvas__handle--end"
                    style={{ left: point[0] * scale, top: point[1] * scale }}
                    onPointerDown={event => onDown(event, which)}
                />
            ))}
        </>
    )
}

/**
 * Typing into a shape: a text area laid exactly over where the text is
 * drawn, in the same face and size, growing with what is typed and sitting
 * top, middle or bottom in the shape as the text will.
 */
function TextEditor({
    element,
    family,
    scale,
    onChange,
    onDone,
}: {
    element: ShapeElement
    family: keyof typeof FONT_STACKS
    scale: number
    onChange: (text: string) => void
    onDone: () => void
}) {
    const area = useRef<HTMLTextAreaElement>(null)
    const frame = textFrame(element)
    const [height, setHeight] = useState(0)

    useLayoutEffect(() => {
        const input = area.current
        if (!input) return
        input.style.height = '0px'
        setHeight(input.scrollHeight)
        input.style.height = ''
    }, [element.text, element.size, element.lineHeight, frame.w, scale])

    useLayoutEffect(() => {
        const input = area.current
        if (!input) return
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
    }, [])

    const frameHeight = frame.h * scale
    const shown = Math.max(height, 0)
    const top =
        element.valign === 'middle'
            ? (frameHeight - shown) / 2
            : element.valign === 'bottom'
              ? frameHeight - shown
              : 0

    return (
        <textarea
            ref={area}
            className="tp-canvas__text"
            value={element.text}
            placeholder={element.placeholder}
            spellCheck
            onChange={event => onChange(event.target.value)}
            onBlur={onDone}
            onPointerDown={event => event.stopPropagation()}
            onKeyDown={event => {
                event.stopPropagation()
                if (event.key === 'Escape') {
                    event.preventDefault()
                    onDone()
                }
            }}
            style={{
                left: frame.x * scale,
                top: frame.y * scale + top,
                width: frame.w * scale,
                height: shown || undefined,
                padding: `${TEXT_INSET_Y * scale}px ${TEXT_INSET_X * scale}px`,
                paddingLeft: (TEXT_INSET_X + (element.bullets ? bulletIndent(element.size) : 0)) * scale,
                fontFamily: FONT_STACKS[family],
                fontSize: element.size * scale,
                lineHeight: element.lineHeight ?? DEFAULT_LINE_HEIGHT,
                color: element.color,
                fontWeight: element.bold ? 700 : 400,
                fontStyle: element.italic ? 'italic' : 'normal',
                textDecoration: element.underline ? 'underline' : undefined,
                textAlign: element.align,
            }}
        />
    )
}
