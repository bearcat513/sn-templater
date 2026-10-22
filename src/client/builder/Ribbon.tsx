import React from 'react'
import { useChartTemplates } from '../data/charts'
import { FONT_FAMILIES, type FontFamily } from '../engine/pdfFonts'
import { SHAPE_KINDS, type ShapeElement, type ShapeKind, type TableElement } from '../engine/presentation'
import { Icon, type IconName } from '../ui/icons'
import { NumberInput, Select, cx } from '../ui/controls'
import { Menu } from '../ui/overlays'
import type { SlideEditor } from './editor'

export const FONT_LABELS: Record<FontFamily, string> = {
    helvetica: 'Helvetica',
    times: 'Times',
    courier: 'Courier',
}

/** A square toolbar button that can be pressed in, like Bold. */
export function ToolButton({
    icon,
    label,
    active,
    disabled,
    onClick,
    children,
}: {
    icon?: IconName
    label: string
    active?: boolean
    disabled?: boolean
    onClick: () => void
    children?: React.ReactNode
}) {
    return (
        <button
            type="button"
            className={cx('tp-tool', active && 'is-active')}
            title={label}
            aria-label={label}
            aria-pressed={active === undefined ? undefined : active}
            disabled={disabled}
            onMouseDown={event => event.preventDefault()}
            onClick={onClick}
        >
            {icon ? <Icon name={icon} size={16} /> : children}
        </button>
    )
}

export const SHAPE_ICONS: Record<ShapeKind, IconName> = {
    rect: 'square',
    roundRect: 'square',
    ellipse: 'circle',
    triangle: 'triangle',
    rightTriangle: 'triangle',
    diamond: 'diamond',
    pentagon: 'hexagon',
    hexagon: 'hexagon',
    parallelogram: 'square',
    trapezoid: 'square',
    chevron: 'chevronRight',
    arrow: 'arrowRight',
    star: 'star',
}

const TABLE_SIZES: [number, number][] = [
    [2, 2],
    [3, 3],
    [4, 3],
    [5, 4],
    [6, 2],
]

/**
 * The strip above the canvas: insert things, set the type of the selected
 * shapes, and stack them. Everything here is also in the inspector; this is
 * the quick way to the parts used most.
 */
export function Ribbon({ editor }: { editor: SlideEditor }) {
    const shapes = editor.selected.filter((element): element is ShapeElement => element.type === 'shape')
    // A table's text takes a face, a size, a colour and an alignment too; bold and bullets are a shape's.
    const textual = editor.selected.filter(
        (element): element is ShapeElement | TableElement => element.type === 'shape' || element.type === 'table'
    )
    const first = textual[0]
    const hasText = Boolean(first)
    const hasShapes = shapes.length > 0
    const all = (test: (shape: ShapeElement) => boolean) => shapes.length > 0 && shapes.every(test)
    const textPatch = (patch: Partial<Pick<ShapeElement, 'family' | 'size' | 'color' | 'align'>>, merge?: string) =>
        editor.patch(element => (element.type === 'shape' || element.type === 'table' ? patch : {}), merge)
    const shapePatch = (patch: Partial<ShapeElement>, merge?: string) =>
        editor.patch(element => (element.type === 'shape' ? patch : {}), merge)
    const some = editor.selection.length > 0
    const chartTemplates = useChartTemplates()
    const charts = (chartTemplates.data ?? []).filter(chart => chart.active)

    return (
        <div className="tp-ribbon" role="toolbar" aria-label="Slide tools">
            <div className="tp-ribbon__group" aria-label="Insert">
                <ToolButton icon="type" label="Text box" onClick={editor.insertText} />
                <Menu
                    label="Shapes"
                    icon="square"
                    align="start"
                    items={SHAPE_KINDS.map(({ shape, label }) => ({
                        label,
                        icon: SHAPE_ICONS[shape],
                        onSelect: () => editor.insertShape(shape),
                    }))}
                />
                <ToolButton icon="line" label="Line" onClick={() => editor.insertLine(false)} />
                <ToolButton icon="arrowRight" label="Arrow" onClick={() => editor.insertLine(true)} />
                <ToolButton icon="image" label="Picture" onClick={() => editor.insertImage()} />
                <Menu
                    label="Table"
                    icon="table"
                    align="start"
                    items={TABLE_SIZES.map(([rows, columns]) => ({
                        label: `${columns} columns × ${rows} rows`,
                        icon: 'table' as const,
                        onSelect: () => editor.insertTable(rows, columns),
                    }))}
                />
                <ToolButton icon="code" label="Code box" onClick={editor.insertCode} />
                <Menu
                    label="Chart"
                    icon="chart"
                    align="start"
                    items={
                        charts.length
                            ? charts.map(chart => ({
                                  label: chart.name,
                                  icon: 'chart' as const,
                                  onSelect: () => editor.insertChart(chart),
                              }))
                            : [
                                  {
                                      label: chartTemplates.loading ? 'Loading charts…' : 'No chart templates yet',
                                      icon: 'chart' as const,
                                      disabled: true,
                                      onSelect: () => undefined,
                                  },
                              ]
                    }
                />
            </div>

            <div className="tp-ribbon__group" aria-label="Font">
                <Select<FontFamily>
                    className="tp-ribbon__font"
                    aria-label="Font"
                    disabled={!hasText}
                    value={first?.family ?? editor.sheet.page.family}
                    options={FONT_FAMILIES.map(family => ({ value: family, label: FONT_LABELS[family] }))}
                    onChange={family => textPatch({ family })}
                />
                <div className="tp-ribbon__size">
                    <NumberInput
                        aria-label="Font size"
                        min={4}
                        max={400}
                        value={first?.size}
                        placeholder="–"
                        onChange={size => size && size >= 4 && textPatch({ size: Math.min(400, size) }, 'font-size')}
                    />
                </div>
                <ToolButton
                    label="Bold (Ctrl+B)"
                    disabled={!hasShapes}
                    active={all(shape => Boolean(shape.bold))}
                    onClick={() => shapePatch({ bold: !all(shape => Boolean(shape.bold)) || undefined })}
                >
                    <strong>B</strong>
                </ToolButton>
                <ToolButton
                    label="Italic (Ctrl+I)"
                    disabled={!hasShapes}
                    active={all(shape => Boolean(shape.italic))}
                    onClick={() => shapePatch({ italic: !all(shape => Boolean(shape.italic)) || undefined })}
                >
                    <em>I</em>
                </ToolButton>
                <ToolButton
                    label="Underline (Ctrl+U)"
                    disabled={!hasShapes}
                    active={all(shape => Boolean(shape.underline))}
                    onClick={() => shapePatch({ underline: !all(shape => Boolean(shape.underline)) || undefined })}
                >
                    <span style={{ textDecoration: 'underline' }}>U</span>
                </ToolButton>
                <label className={cx('tp-tool tp-tool--color', !hasText && 'is-disabled')} title="Text colour">
                    <span style={{ borderBottomColor: first?.color ?? '#000000' }}>A</span>
                    <input
                        type="color"
                        disabled={!hasText}
                        value={first?.color ?? '#000000'}
                        onChange={event => textPatch({ color: event.target.value }, 'text-color')}
                        aria-label="Text colour"
                    />
                </label>
            </div>

            <div className="tp-ribbon__group" aria-label="Paragraph">
                {(['left', 'center', 'right'] as const).map(align => (
                    <ToolButton
                        key={align}
                        icon={align === 'left' ? 'textLeft' : align === 'center' ? 'textCenter' : 'textRight'}
                        label={`Align text ${align}`}
                        disabled={!hasText}
                        active={hasText && textual.every(element => element.align === align)}
                        onClick={() => textPatch({ align })}
                    />
                ))}
                <ToolButton
                    icon="list"
                    label="Bullets"
                    disabled={!hasShapes}
                    active={all(shape => Boolean(shape.bullets))}
                    onClick={() => shapePatch({ bullets: !all(shape => Boolean(shape.bullets)) || undefined })}
                />
            </div>

            <div className="tp-ribbon__group" aria-label="Clipboard">
                <ToolButton
                    icon="brush"
                    label={
                        editor.painter
                            ? 'Format painter: click an element to paint it (Esc to stop)'
                            : 'Format painter (Ctrl+Shift+C)'
                    }
                    disabled={!editor.painter && editor.selection.length !== 1}
                    active={Boolean(editor.painter)}
                    onClick={editor.togglePainter}
                />
            </div>

            <div className="tp-ribbon__group" aria-label="Arrange">
                <ToolButton
                    icon="bringForward"
                    label="Bring forward"
                    disabled={!some}
                    onClick={() => editor.arrange('forward')}
                />
                <ToolButton
                    icon="sendBackward"
                    label="Send backward"
                    disabled={!some}
                    onClick={() => editor.arrange('backward')}
                />
                <ToolButton icon="copy" label="Duplicate (Ctrl+D)" disabled={!some} onClick={editor.duplicate} />
                <ToolButton icon="trash" label="Delete (Del)" disabled={!some} onClick={editor.remove} />
            </div>
        </div>
    )
}
