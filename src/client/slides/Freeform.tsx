import React from 'react'
import {
    DEFAULT_LINE_HEIGHT,
    TEXT_INSET_X,
    TEXT_INSET_Y,
    arrowHead,
    arrowInset,
    bulletIndent,
    cellFill,
    cellShape,
    cornerRadius,
    lineEnds,
    shapePoints,
    tableCells,
    tableLines,
    textFrame,
} from '../engine/freeform'
import { safeUrl } from '../engine/links'
import type { FontFamily } from '../engine/pdfFonts'
import {
    buildSequence,
    type CustomSlide,
    type LineElement,
    type ShapeElement,
    type SlideElement,
    type TableElement,
} from '../engine/presentation'

/**
 * A custom slide's elements, drawn in HTML on the sheet.
 *
 * The other half of engine/freeform.ts: the same boxes, the same text frame
 * and insets, the same arrowheads and polygon corners, in sheet points that
 * the sheet then scales — so what is laid out here is where the PDF puts it.
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
    /** In the presenter: how many build steps are shown, and which one should animate in. */
    builds?: { shown: number; animate?: number }
    /** Set in the presenter: element links are anchors, and paths resolve against this. */
    linkBase?: string
}

export function FreeformContent({ slide, family, fill, editing, builds, linkBase }: Props) {
    const sequence = builds ? buildSequence(slide) : []
    return (
        <>
            {slide.elements.map(element => {
                const step = sequence.indexOf(element.id)
                if (builds && step !== -1 && step >= builds.shown) return null
                return (
                    <FreeformElement
                        key={element.id}
                        element={element}
                        family={family}
                        fill={fill}
                        placeholder={editing?.placeholders ?? false}
                        hideText={editing?.hideTextOf}
                        animate={builds && step !== -1 && step === builds.animate ? element.build!.effect : undefined}
                        link={linkBase !== undefined && element.link ? safeUrl(fill(element.link), linkBase) : null}
                    />
                )
            })}
        </>
    )
}

function FreeformElement({
    element,
    family,
    fill,
    placeholder,
    hideText,
    animate,
    link,
}: {
    element: SlideElement
    family: FontFamily
    fill: (text: string) => string
    placeholder: boolean
    hideText?: string
    animate?: string
    link: string | null
}) {
    const turn = element.type === 'line' ? 0 : (element.rotation ?? 0)
    const style: React.CSSProperties = {
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.w,
        height: element.h,
        opacity: element.opacity,
        transform: turn ? `rotate(${turn}deg)` : undefined,
    }
    const className = `tp-free${animate ? ` tp-build tp-build--${animate}` : ''}`
    const anchor = link ? (
        <a className="tp-free__link" href={link} target="_blank" rel="noreferrer noopener" aria-label={link} />
    ) : null

    switch (element.type) {
        case 'shape':
            return (
                <div style={style} className={className}>
                    <ShapeOutline element={element} />
                    {hideText !== element.id && <ShapeText element={element} family={family} fill={fill} placeholder={placeholder} />}
                    {anchor}
                </div>
            )
        case 'line':
            return (
                <div style={style} className={className}>
                    <LineDrawing element={element} />
                    {anchor}
                </div>
            )
        case 'image': {
            const stroke = element.stroke && (element.strokeWidth ?? 0) > 0 ? element.strokeWidth! : 0
            return (
                <div style={style} className={className}>
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
                    {anchor}
                </div>
            )
        }
        case 'table':
            return (
                <div style={style} className={className}>
                    <TableDrawing element={element} family={family} fill={fill} hideText={hideText} />
                    {anchor}
                </div>
            )
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
    const points = shapePoints({ ...element, x: 0, y: 0 })
    return (
        <svg className="tp-free__svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            {element.shape === 'ellipse' ? (
                <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...paint} />
            ) : points ? (
                <polygon points={points.map(([x, y]) => `${x},${y}`).join(' ')} {...paint} />
            ) : (
                <rect width={w} height={h} rx={element.shape === 'roundRect' ? cornerRadius(w, h) : 0} {...paint} />
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
    offset = [0, 0],
}: {
    element: ShapeElement
    family: FontFamily
    fill: (text: string) => string
    placeholder: boolean
    /** Where the element's box is, in the coordinates the text is drawn in. A table's cell is not at its table's corner. */
    offset?: [number, number]
}) {
    const filled = fill(element.text)
    const empty = !filled.trim()
    if (empty && !(placeholder && element.placeholder)) return null

    const frame = textFrame({ ...element, x: offset[0], y: offset[1] })
    const indent = element.bullets ? bulletIndent(element.size) : 0
    const paragraphs = (empty ? element.placeholder! : filled).split(/\r?\n/)

    return (
        <div
            className={`tp-free__text${element.code ? ' tp-free__text--code' : ''}`}
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

/** A table's fills, grid and text, in the table's own box. */
function TableDrawing({
    element,
    family,
    fill,
    hideText,
}: {
    element: TableElement
    family: FontFamily
    fill: (text: string) => string
    hideText?: string
}) {
    const local = { ...element, x: 0, y: 0 }
    const cells = tableCells(local)
    return (
        <>
            <svg className="tp-free__svg" width={element.w} height={element.h} aria-hidden="true">
                {cells.map(cell => {
                    const color = cellFill(element, cell.row)
                    return color ? <rect key={`${cell.row},${cell.column}`} x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill={color} /> : null
                })}
                {element.border && (
                    <>
                        {tableLines(local).map(([x1, y1, x2, y2], index) => (
                            <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={element.border} strokeWidth={0.75} />
                        ))}
                        <rect width={element.w} height={element.h} fill="none" stroke={element.border} strokeWidth={0.75} />
                    </>
                )}
            </svg>
            {cells.map(cell => {
                const shape = cellShape(element, cell)
                if (hideText === shape.id) return null
                return (
                    <ShapeText
                        key={shape.id}
                        element={{ ...shape, x: 0, y: 0 }}
                        family={family}
                        fill={fill}
                        placeholder={false}
                        offset={[cell.x, cell.y]}
                    />
                )
            })}
        </>
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
