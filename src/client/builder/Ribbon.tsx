import React from 'react'
import { FONT_FAMILIES, type FontFamily } from '../engine/pdfFonts'
import type { ShapeElement } from '../engine/presentation'
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

/**
 * The strip above the canvas: insert things, set the type of the selected
 * shapes, and stack them. Everything here is also in the inspector; this is
 * the quick way to the parts used most.
 */
export function Ribbon({ editor }: { editor: SlideEditor }) {
    const shapes = editor.selected.filter((element): element is ShapeElement => element.type === 'shape')
    const first = shapes[0]
    const hasText = Boolean(first)
    const all = (test: (shape: ShapeElement) => boolean) => shapes.length > 0 && shapes.every(test)
    const textPatch = (patch: Partial<ShapeElement>, merge?: string) =>
        editor.patch(element => (element.type === 'shape' ? patch : {}), merge)
    const some = editor.selection.length > 0

    return (
        <div className="tp-ribbon" role="toolbar" aria-label="Slide tools">
            <div className="tp-ribbon__group" aria-label="Insert">
                <ToolButton icon="type" label="Text box" onClick={editor.insertText} />
                <Menu
                    label="Shapes"
                    icon="square"
                    align="start"
                    items={[
                        { label: 'Rectangle', icon: 'square', onSelect: () => editor.insertShape('rect') },
                        { label: 'Rounded rectangle', icon: 'square', onSelect: () => editor.insertShape('roundRect') },
                        { label: 'Ellipse', icon: 'circle', onSelect: () => editor.insertShape('ellipse') },
                        { label: 'Triangle', icon: 'triangle', onSelect: () => editor.insertShape('triangle') },
                    ]}
                />
                <ToolButton icon="line" label="Line" onClick={() => editor.insertLine(false)} />
                <ToolButton icon="arrowRight" label="Arrow" onClick={() => editor.insertLine(true)} />
                <ToolButton icon="image" label="Picture" onClick={() => editor.insertImage()} />
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
                    disabled={!hasText}
                    active={all(shape => Boolean(shape.bold))}
                    onClick={() => textPatch({ bold: !all(shape => Boolean(shape.bold)) || undefined })}
                >
                    <strong>B</strong>
                </ToolButton>
                <ToolButton
                    label="Italic (Ctrl+I)"
                    disabled={!hasText}
                    active={all(shape => Boolean(shape.italic))}
                    onClick={() => textPatch({ italic: !all(shape => Boolean(shape.italic)) || undefined })}
                >
                    <em>I</em>
                </ToolButton>
                <ToolButton
                    label="Underline (Ctrl+U)"
                    disabled={!hasText}
                    active={all(shape => Boolean(shape.underline))}
                    onClick={() => textPatch({ underline: !all(shape => Boolean(shape.underline)) || undefined })}
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
                        active={hasText && all(shape => shape.align === align)}
                        onClick={() => textPatch({ align })}
                    />
                ))}
                <ToolButton
                    icon="list"
                    label="Bullets"
                    disabled={!hasText}
                    active={all(shape => Boolean(shape.bullets))}
                    onClick={() => textPatch({ bullets: !all(shape => Boolean(shape.bullets)) || undefined })}
                />
            </div>

            <div className="tp-ribbon__group" aria-label="Arrange">
                <ToolButton icon="bringForward" label="Bring forward" disabled={!some} onClick={() => editor.arrange('forward')} />
                <ToolButton icon="sendBackward" label="Send backward" disabled={!some} onClick={() => editor.arrange('backward')} />
                <ToolButton icon="copy" label="Duplicate (Ctrl+D)" disabled={!some} onClick={editor.duplicate} />
                <ToolButton icon="trash" label="Delete (Del)" disabled={!some} onClick={editor.remove} />
            </div>
        </div>
    )
}
