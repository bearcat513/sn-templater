import React from 'react'
import { FONT_FAMILIES, type FontFamily } from '../engine/pdfFonts'
import type { ImageElement, LineElement, ShapeElement, ShapeKind, SlideElement } from '../engine/presentation'
import { ImagePicker } from '../designer/ImagePicker'
import { ColorField, Field, Input, NumberInput, Segmented, Select, Switch } from '../ui/controls'
import { Icon } from '../ui/icons'
import type { SlideEditor } from './editor'
import { FONT_LABELS, ToolButton } from './Ribbon'

const SHAPE_LABELS: Record<ShapeKind, string> = {
    rect: 'Rectangle',
    roundRect: 'Rounded rectangle',
    ellipse: 'Ellipse',
    triangle: 'Triangle',
}

/** The tokens a custom slide's text can use: the deck's, not a record's. */
const SLIDE_TOKENS = [
    ['deck.title', 'The presentation’s title'],
    ['deck.count', 'How many records it shows'],
    ['slide.number', 'This slide’s number'],
    ['slide.count', 'How many slides are shown'],
    ['table.label', 'The records’ table'],
    ['now.date', 'Today’s date'],
    ['user.name', 'Who is presenting'],
] as const

/**
 * The right-hand panel: the selected element's every property, or — with
 * nothing selected — the slide's own.
 */
export function Inspector({ editor }: { editor: SlideEditor }) {
    const { selected } = editor
    return (
        <div className="tp-inspector">
            {selected.length === 0 ? (
                <SlideProperties editor={editor} />
            ) : selected.length === 1 ? (
                <ElementProperties editor={editor} element={selected[0]!} />
            ) : (
                <MultipleProperties editor={editor} />
            )}
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="tp-inspector__section">
            <h3 className="tp-inspector__title">{title}</h3>
            <div className="tp-stack tp-stack--tight">{children}</div>
        </section>
    )
}

/* ------------------------------------------------------------------- slide */

function SlideProperties({ editor }: { editor: SlideEditor }) {
    const { slide } = editor
    return (
        <>
            <Section title="Slide">
                <Field label="Name" hint="What the slide list calls it. Empty uses its first line of text.">
                    <Input
                        value={slide.name ?? ''}
                        maxLength={80}
                        onChange={event => editor.change(current => ({ ...current, name: event.target.value || undefined }), 'slide-name')}
                    />
                </Field>
                <ColorField
                    label="Background"
                    allowEmpty
                    value={slide.background ?? ''}
                    hint="Empty uses the deck’s own."
                    onChange={background =>
                        editor.change(current => ({ ...current, background: background || undefined }), 'slide-background')
                    }
                />
                <Switch
                    checked={slide.furniture === true}
                    onChange={furniture => editor.change(current => ({ ...current, furniture: furniture || undefined }))}
                    label="Show the deck’s letterhead, watermark and footer"
                />
            </Section>
            <Section title="Tokens">
                <p className="tp-subtle">Type these into any text on the slide; they are filled in when it is shown.</p>
                <ul className="tp-inspector__tokens">
                    {SLIDE_TOKENS.map(([token, description]) => (
                        <li key={token}>
                            <code>{`{{${token}}}`}</code>
                            <span className="tp-subtle">{description}</span>
                        </li>
                    ))}
                </ul>
            </Section>
            <Section title="Shortcuts">
                <ul className="tp-inspector__keys tp-subtle">
                    <li>
                        <kbd>Double-click</kbd> type in a shape
                    </li>
                    <li>
                        <kbd>Shift</kbd> drag straight, resize in proportion
                    </li>
                    <li>
                        <kbd>Alt</kbd> drag without snapping
                    </li>
                    <li>
                        <kbd>Arrows</kbd> nudge (with <kbd>Shift</kbd>, by 10)
                    </li>
                    <li>
                        <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>V</kbd> / <kbd>D</kbd> copy, paste, duplicate
                    </li>
                    <li>
                        <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd> undo, redo
                    </li>
                </ul>
            </Section>
        </>
    )
}

/* ---------------------------------------------------------------- elements */

function Position({ editor, element }: { editor: SlideEditor; element: SlideElement }) {
    const set = (key: 'x' | 'y' | 'w' | 'h', value: number | undefined) => {
        if (value === undefined) return
        const min = element.type === 'line' ? 0 : 1
        editor.patch({ [key]: key === 'w' || key === 'h' ? Math.max(min, value) : value }, `position-${key}`)
    }
    return (
        <Section title="Position and size">
            <div className="tp-grid tp-grid--2">
                {(['x', 'y', 'w', 'h'] as const).map(key => (
                    <Field key={key} label={{ x: 'Left', y: 'Top', w: 'Width', h: 'Height' }[key]}>
                        <NumberInput value={Math.round(element[key])} onChange={value => set(key, value)} aria-label={key} />
                    </Field>
                ))}
            </div>
            <Field label="Align to slide">
                <AlignButtons editor={editor} />
            </Field>
            <Field label="Opacity">
                <div className="tp-row">
                    <input
                        type="range"
                        className="tp-grow"
                        min={5}
                        max={100}
                        value={Math.round((element.opacity ?? 1) * 100)}
                        onChange={event => {
                            const value = Number(event.target.value) / 100
                            editor.patch({ opacity: value >= 1 ? undefined : value }, 'opacity')
                        }}
                        aria-label="Opacity"
                    />
                    <span className="tp-subtle tp-inspector__value">{Math.round((element.opacity ?? 1) * 100)}%</span>
                </div>
            </Field>
        </Section>
    )
}

function AlignButtons({ editor }: { editor: SlideEditor }) {
    return (
        <div className="tp-row tp-row--wrap tp-inspector__tools">
            <ToolButton icon="alignLeft" label="Align left" onClick={() => editor.align('left')} />
            <ToolButton icon="alignCenter" label="Align centre" onClick={() => editor.align('center')} />
            <ToolButton icon="alignRight" label="Align right" onClick={() => editor.align('right')} />
            <ToolButton icon="alignTop" label="Align top" onClick={() => editor.align('top')} />
            <ToolButton icon="alignMiddle" label="Align middle" onClick={() => editor.align('middle')} />
            <ToolButton icon="alignBottom" label="Align bottom" onClick={() => editor.align('bottom')} />
        </div>
    )
}

function ElementProperties({ editor, element }: { editor: SlideEditor; element: SlideElement }) {
    return (
        <>
            {element.type === 'shape' && <ShapeProperties editor={editor} element={element} />}
            {element.type === 'line' && <LineProperties editor={editor} element={element} />}
            {element.type === 'image' && <ImageProperties editor={editor} element={element} />}
            <Position editor={editor} element={element} />
            <Section title="Arrange">
                <div className="tp-row tp-row--wrap tp-inspector__tools">
                    <ToolButton icon="bringForward" label="Bring to front" onClick={() => editor.arrange('front')} />
                    <ToolButton icon="sendBackward" label="Send to back" onClick={() => editor.arrange('back')} />
                    <ToolButton icon="copy" label="Duplicate" onClick={editor.duplicate} />
                    <ToolButton icon="trash" label="Delete" onClick={editor.remove} />
                </div>
            </Section>
        </>
    )
}

function Outline({
    editor,
    stroke,
    strokeWidth,
}: {
    editor: SlideEditor
    stroke: string | undefined
    strokeWidth: number | undefined
}) {
    return (
        <div className="tp-grid tp-grid--2">
            <ColorField
                label="Outline"
                allowEmpty
                value={stroke ?? ''}
                onChange={value =>
                    editor.patch({ stroke: value || undefined, strokeWidth: value ? (strokeWidth ?? 1.5) : undefined }, 'stroke')
                }
            />
            <Field label="Weight (pt)">
                <NumberInput
                    min={0}
                    max={40}
                    step={0.5}
                    value={stroke ? strokeWidth : undefined}
                    placeholder="–"
                    onChange={value => value !== undefined && editor.patch({ strokeWidth: Math.min(40, Math.max(0, value)) }, 'stroke-width')}
                    aria-label="Outline weight"
                />
            </Field>
        </div>
    )
}

function ShapeProperties({ editor, element }: { editor: SlideEditor; element: ShapeElement }) {
    const patch = (changes: Partial<ShapeElement>, merge?: string) => editor.patch(changes, merge)
    return (
        <>
            <Section title={element.fill || element.stroke ? SHAPE_LABELS[element.shape] : 'Text box'}>
                <Field label="Shape">
                    <Select<ShapeKind>
                        value={element.shape}
                        options={(Object.keys(SHAPE_LABELS) as ShapeKind[]).map(shape => ({ value: shape, label: SHAPE_LABELS[shape] }))}
                        onChange={shape => patch({ shape })}
                    />
                </Field>
                <ColorField label="Fill" allowEmpty value={element.fill ?? ''} onChange={fill => patch({ fill: fill || undefined }, 'fill')} />
                <Outline editor={editor} stroke={element.stroke} strokeWidth={element.strokeWidth} />
            </Section>
            <Section title="Text">
                <div className="tp-grid tp-grid--2">
                    <Field label="Font">
                        <Select<FontFamily>
                            value={element.family ?? editor.sheet.page.family}
                            options={FONT_FAMILIES.map(family => ({ value: family, label: FONT_LABELS[family] }))}
                            onChange={family => patch({ family })}
                        />
                    </Field>
                    <Field label="Size (pt)">
                        <NumberInput
                            min={4}
                            max={400}
                            value={element.size}
                            onChange={size => size && size >= 4 && patch({ size: Math.min(400, size) }, 'font-size')}
                            aria-label="Font size"
                        />
                    </Field>
                </div>
                <ColorField label="Colour" value={element.color} onChange={color => patch({ color }, 'text-color')} />
                <div className="tp-row tp-row--wrap tp-inspector__tools">
                    <ToolButton label="Bold" active={Boolean(element.bold)} onClick={() => patch({ bold: !element.bold || undefined })}>
                        <strong>B</strong>
                    </ToolButton>
                    <ToolButton label="Italic" active={Boolean(element.italic)} onClick={() => patch({ italic: !element.italic || undefined })}>
                        <em>I</em>
                    </ToolButton>
                    <ToolButton
                        label="Underline"
                        active={Boolean(element.underline)}
                        onClick={() => patch({ underline: !element.underline || undefined })}
                    >
                        <span style={{ textDecoration: 'underline' }}>U</span>
                    </ToolButton>
                    <ToolButton
                        icon="list"
                        label="Bullets"
                        active={Boolean(element.bullets)}
                        onClick={() => patch({ bullets: !element.bullets || undefined })}
                    />
                </div>
                <Field label="Horizontal">
                    <Segmented
                        label="Horizontal alignment"
                        size="sm"
                        value={element.align}
                        onChange={align => patch({ align })}
                        options={[
                            { value: 'left', label: 'Left', icon: 'textLeft' },
                            { value: 'center', label: 'Centre', icon: 'textCenter' },
                            { value: 'right', label: 'Right', icon: 'textRight' },
                        ]}
                    />
                </Field>
                <Field label="Vertical">
                    <Segmented
                        label="Vertical alignment"
                        size="sm"
                        value={element.valign}
                        onChange={valign => patch({ valign })}
                        options={[
                            { value: 'top', label: 'Top' },
                            { value: 'middle', label: 'Middle' },
                            { value: 'bottom', label: 'Bottom' },
                        ]}
                    />
                </Field>
                <Field label="Line spacing">
                    <NumberInput
                        min={0.8}
                        max={3}
                        step={0.1}
                        value={element.lineHeight ?? 1.2}
                        onChange={value => value && patch({ lineHeight: Math.min(3, Math.max(0.8, value)) }, 'line-height')}
                        aria-label="Line spacing"
                    />
                </Field>
                <p className="tp-subtle">
                    <Icon name="info" size={12} /> Double-click the shape on the slide to type in it.
                </p>
            </Section>
        </>
    )
}

function LineProperties({ editor, element }: { editor: SlideEditor; element: LineElement }) {
    return (
        <Section title={element.arrowEnd || element.arrowStart ? 'Arrow' : 'Line'}>
            <div className="tp-grid tp-grid--2">
                <ColorField label="Colour" value={element.stroke} onChange={stroke => editor.patch({ stroke }, 'stroke')} />
                <Field label="Weight (pt)">
                    <NumberInput
                        min={0.5}
                        max={40}
                        step={0.5}
                        value={element.strokeWidth}
                        onChange={value => value && editor.patch({ strokeWidth: Math.min(40, Math.max(0.5, value)) }, 'stroke-width')}
                        aria-label="Line weight"
                    />
                </Field>
            </div>
            <Switch checked={Boolean(element.dashed)} onChange={dashed => editor.patch({ dashed: dashed || undefined })} label="Dashed" />
            <Switch
                checked={Boolean(element.arrowStart)}
                onChange={arrowStart => editor.patch({ arrowStart: arrowStart || undefined })}
                label="Arrowhead at the start"
            />
            <Switch
                checked={Boolean(element.arrowEnd)}
                onChange={arrowEnd => editor.patch({ arrowEnd: arrowEnd || undefined })}
                label="Arrowhead at the end"
            />
            <p className="tp-subtle">Drag either end to move it; hold Shift to keep it at 45° steps.</p>
        </Section>
    )
}

function ImageProperties({ editor, element }: { editor: SlideEditor; element: ImageElement }) {
    return (
        <Section title="Picture">
            <ImagePicker
                value={element.source}
                onChange={source => {
                    if (source) editor.patch({ source })
                    else editor.remove()
                }}
            />
            <Outline editor={editor} stroke={element.stroke} strokeWidth={element.strokeWidth} />
        </Section>
    )
}

/* ---------------------------------------------------------------- several */

function MultipleProperties({ editor }: { editor: SlideEditor }) {
    const count = editor.selected.length
    return (
        <>
            <Section title={`${count} selected`}>
                <Field label="Align" hint="With each other, by the selection’s edges.">
                    <AlignButtons editor={editor} />
                </Field>
                <Field label="Distribute" hint={count < 3 ? 'Select three or more to space them evenly.' : undefined}>
                    <div className="tp-row tp-inspector__tools">
                        <ToolButton icon="distributeH" label="Distribute horizontally" disabled={count < 3} onClick={() => editor.distribute('x')} />
                        <ToolButton icon="distributeV" label="Distribute vertically" disabled={count < 3} onClick={() => editor.distribute('y')} />
                    </div>
                </Field>
            </Section>
            <Section title="Arrange">
                <div className="tp-row tp-row--wrap tp-inspector__tools">
                    <ToolButton icon="bringForward" label="Bring to front" onClick={() => editor.arrange('front')} />
                    <ToolButton icon="sendBackward" label="Send to back" onClick={() => editor.arrange('back')} />
                    <ToolButton icon="copy" label="Duplicate" onClick={editor.duplicate} />
                    <ToolButton icon="trash" label="Delete" onClick={editor.remove} />
                </div>
            </Section>
        </>
    )
}
