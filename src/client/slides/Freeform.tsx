import React from 'react'
import {
    DEFAULT_LINE_HEIGHT,
    TEXT_INSET_X,
    TEXT_INSET_Y,
    arrowHead,
    arrowInset,
    bulletIndent,
    cornerRadius,
    lineEnds,
    textFrame,
} from '../engine/freeform'
import type { FontFamily } from '../engine/pdfFonts'
import type { CustomSlide, LineElement, ShapeElement, SlideElement } from '../engine/presentation'

/**
 * A custom slide's elements, drawn in HTML on the sheet.
 *
 * The other half of engine/freeform.ts: the same boxes, the same text frame
 * and insets, the same arrowheads, in sheet points that the sheet then
 * scales — so what is laid out here is where the PDF puts it.
 */

export const FONT_STACKS: Record<FontFamily, string> = {
    helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif',
    times: '"Times New Roman", Times, "Liberation Serif", serif',
    courier: '"Courier New", Courier, "Liberation Mono", monospace',
}

type Props = {
    slide: CustomSlide
    family: FontFamily
    fill: (text: string) => string
    /** In the builder: empty text shows its placeholder, and one element's text can be left out while it is edited. */
    editing?: { placeholders: boolean; hideTextOf?: string }
}

export function FreeformContent({ slide, family, fill, editing }: Props) {
    return (
        <>
            {slide.elements.map(element => (
                <FreeformElement
                    key={element.id}
                    element={element}
                    family={family}
                    fill={fill}
                    placeholder={editing?.placeholders ?? false}
                    hideText={editing?.hideTextOf === element.id}
                />
            ))}
        </>
    )
}

function FreeformElement({
    element,
    family,
    fill,
    placeholder,
    hideText,
}: {
    element: SlideElement
    family: FontFamily
    fill: (text: string) => string
    placeholder: boolean
    hideText: boolean
}) {
    const style: React.CSSProperties = {
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.w,
        height: element.h,
        opacity: element.opacity,
    }

    switch (element.type) {
        case 'shape':
            return (
                <div style={style} className="tp-free">
                    <ShapeOutline element={element} />
                    {!hideText && <ShapeText element={element} family={family} fill={fill} placeholder={placeholder} />}
                </div>
            )
        case 'line':
            return (
                <div style={style} className="tp-free">
                    <LineDrawing element={element} />
                </div>
            )
        case 'image': {
            const stroke = element.stroke && (element.strokeWidth ?? 0) > 0 ? element.strokeWidth! : 0
            return (
                <div style={style} className="tp-free">
                    <img
                        src={element.source}
                        alt=""
                        draggable={false}
                        style={{
                            display: 'block',
                            width: '100%',
                            height: '100%',
                            objectFit: 'fill',
                            outline: stroke ? `${stroke}px solid ${element.stroke}` : undefined,
                            outlineOffset: stroke ? -stroke / 2 : undefined,
                        }}
                    />
                </div>
            )
        }
    }
}

/** The shape itself, as SVG: strokes centred on the edge, as the PDF strokes them. */
function ShapeOutline({ element }: { element: ShapeElement }) {
    const stroke = element.stroke && (element.strokeWidth ?? 0) > 0 ? element.stroke : undefined
    if (!element.fill && !stroke) return null
    const { w, h } = element
    const paint = {
        fill: element.fill ?? 'none',
        stroke: stroke ?? 'none',
        strokeWidth: stroke ? element.strokeWidth : 0,
        strokeLinejoin: 'round' as const,
    }
    return (
        <svg className="tp-free__svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            {element.shape === 'ellipse' ? (
                <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...paint} />
            ) : element.shape === 'triangle' ? (
                <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} {...paint} />
            ) : (
                <rect
                    width={w}
                    height={h}
                    rx={element.shape === 'roundRect' ? cornerRadius(w, h) : 0}
                    {...paint}
                />
            )}
        </svg>
    )
}

/** A shape's text: in its text frame, aligned both ways, a bullet on each paragraph if asked. */
export function ShapeText({
    element,
    family,
    fill,
    placeholder,
}: {
    element: ShapeElement
    family: FontFamily
    fill: (text: string) => string
    placeholder: boolean
}) {
    const filled = fill(element.text)
    const empty = !filled.trim()
    if (empty && !(placeholder && element.placeholder)) return null

    const frame = textFrame({ ...element, x: 0, y: 0 })
    const indent = element.bullets ? bulletIndent(element.size) : 0
    const paragraphs = (empty ? element.placeholder! : filled).split(/\r?\n/)

    return (
        <div
            className="tp-free__text"
            style={{
                left: frame.x,
                top: frame.y,
                width: frame.w,
                height: frame.h,
                padding: `${TEXT_INSET_Y}px ${TEXT_INSET_X}px`,
                justifyContent:
                    element.valign === 'middle' ? 'center' : element.valign === 'bottom' ? 'flex-end' : 'flex-start',
                fontFamily: FONT_STACKS[element.family ?? family],
                fontSize: element.size,
                lineHeight: element.lineHeight ?? DEFAULT_LINE_HEIGHT,
                color: empty ? '#9ca3af' : element.color,
                fontWeight: element.bold ? 700 : 400,
                fontStyle: element.italic ? 'italic' : 'normal',
                textDecoration: element.underline && !empty ? 'underline' : undefined,
                textAlign: element.align,
            }}
        >
            {paragraphs.map((paragraph, index) =>
                element.bullets && paragraph.trim() ? (
                    <div key={index} className="tp-free__bullet">
                        <span style={{ width: indent, flex: `0 0 ${indent}px`, textAlign: 'left' }}>•</span>
                        <span className="tp-free__para">{paragraph}</span>
                    </div>
                ) : (
                    <div key={index} className="tp-free__para" style={{ paddingLeft: indent }}>
                        {paragraph || '​'}
                    </div>
                )
            )}
        </div>
    )
}

function LineDrawing({ element }: { element: LineElement }) {
    // Drawn in the box's own coordinates; a flat box still has a line across it.
    const local = { ...element, x: 0, y: 0 }
    const { from, to } = lineEnds(local)
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const cut = arrowInset(element.strokeWidth)
    const along = (point: [number, number], toward: [number, number], by: number): [number, number] =>
        length
            ? [point[0] + ((toward[0] - point[0]) / length) * by, point[1] + ((toward[1] - point[1]) / length) * by]
            : point
    const start = element.arrowStart ? along(from, to, cut) : from
    const end = element.arrowEnd ? along(to, from, cut) : to
    const points = (corners: [number, number][]) => corners.map(([x, y]) => `${x},${y}`).join(' ')

    return (
        <svg
            className="tp-free__svg"
            width={Math.max(1, element.w)}
            height={Math.max(1, element.h)}
            aria-hidden="true"
        >
            <line
                x1={start[0]}
                y1={start[1]}
                x2={end[0]}
                y2={end[1]}
                stroke={element.stroke}
                strokeWidth={element.strokeWidth}
                strokeLinecap="round"
                strokeDasharray={
                    element.dashed ? `${element.strokeWidth * 3} ${element.strokeWidth * 2.5}` : undefined
                }
            />
            {element.arrowEnd && <polygon points={points(arrowHead(from, to, element.strokeWidth))} fill={element.stroke} />}
            {element.arrowStart && (
                <polygon points={points(arrowHead(to, from, element.strokeWidth))} fill={element.stroke} />
            )}
        </svg>
    )
}
