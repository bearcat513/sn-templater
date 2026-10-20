import React from 'react'
import { useCharts, useChartTemplates } from '../data/charts'
import { FONT_FAMILIES, type FontFamily } from '../engine/pdfFonts'
import {
    BUILD_EFFECTS,
    CHART_LOOK_KEYS,
    MAX_TABLE_COLUMNS,
    MAX_TABLE_ROWS,
    SHAPE_KINDS,
    TRANSITIONS,
    buildSequence,
    normalizeRotation,
    type BuildEffect,
    type ChartElement,
    type ImageElement,
    type LineElement,
    type ShapeElement,
    type ShapeKind,
    type SlideElement,
    type TableElement,
    type Transition,
} from '../engine/presentation'
import { showValuesLabel } from '../designer/ChartFields'
import { ImagePicker } from '../designer/ImagePicker'
import { CHART_KINDS, chartShape, paletteChart, type ChartKind } from '../engine/template'
import { Button, ColorField, Field, Input, NumberInput, Segmented, Select, Switch } from '../ui/controls'
import { Icon } from '../ui/icons'
import type { SlideEditor } from './editor'
import { insertColumn, insertRow, moveBuild, nextBuildOrder, removeColumn, removeRow, setCell } from './operations'
import { FONT_LABELS, ToolButton } from './Ribbon'

const SHAPE_LABELS = Object.fromEntries(SHAPE_KINDS.map(entry => [entry.shape, entry.label])) as Record<ShapeKind, string>

/** How the slide being edited comes in, and the deck's own choice it falls back to. */
export type TransitionControl = {
    value: Transition | undefined
    deck: Transition
    onChange: (transition: Transition | undefined) => void
    onApplyAll: () => void
}

/** A slide's transition: its own, or the deck's — and a way to make one the deck's. */
export function TransitionSection({ control }: { control: TransitionControl }) {
    const label = TRANSITIONS.find(entry => entry.transition === control.deck)?.label ?? control.deck
    return (
        <Section title="Transition">
            <Field label="When this slide comes in" hint="Played by the presenter. The PDF has none.">
                <Select<Transition | 'deck'>
                    value={control.value ?? 'deck'}
                    options={[
                        { value: 'deck', label: `Deck default (${label})` },
                        ...TRANSITIONS.map(entry => ({ value: entry.transition, label: entry.label })),
                    ]}
                    onChange={value => control.onChange(value === 'deck' ? undefined : value)}
                />
            </Field>
            <div>
                <Button size="sm" variant="ghost" icon="transition" onClick={control.onApplyAll}>
                    Apply to all slides
                </Button>
            </div>
        </Section>
    )
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
export function Inspector({ editor, transition }: { editor: SlideEditor; transition: TransitionControl }) {
    const { selected } = editor
    return (
        <div className="tp-inspector">
            {selected.length === 0 ? (
                <SlideProperties editor={editor} transition={transition} />
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

function SlideProperties({ editor, transition }: { editor: SlideEditor; transition: TransitionControl }) {
    const { slide } = editor
    const sequence = buildSequence(slide)
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
            <TransitionSection control={transition} />
            {sequence.length > 0 && (
                <Section title="Animations">
                    <p className="tp-subtle">Shown one click at a time when presenting, in this order.</p>
                    <ol className="tp-inspector__builds">
                        {sequence.map(id => {
                            const element = slide.elements.find(each => each.id === id)!
                            return (
                                <li key={id}>
                                    <button type="button" className="tp-link-button" onClick={() => editor.select([id])}>
                                        {describe(element)}
                                    </button>
                                    <span className="tp-subtle">{BUILD_EFFECTS.find(entry => entry.effect === element.build?.effect)?.label}</span>
                                </li>
                            )
                        })}
                    </ol>
                </Section>
            )}
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
                    <li>
                        <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> / <kbd>V</kbd> copy, paste formatting
                    </li>
                    <li>
                        <kbd>Ctrl</kbd>+<kbd>K</kbd> add a link
                    </li>
                </ul>
            </Section>
        </>
    )
}

/** What the animation list calls an element: its first line of text, or what it is. */
function describe(element: SlideElement): string {
    if (element.type === 'shape') {
        const line = element.text.split('\n').find(part => part.trim())
        return line?.trim().slice(0, 40) || SHAPE_LABELS[element.shape]
    }
    if (element.type === 'table') return `Table, ${element.rows[0]?.length ?? 0} × ${element.rows.length}`
    if (element.type === 'chart') return element.name ? `Chart: ${element.name.slice(0, 32)}` : 'Chart'
    return element.type === 'image' ? 'Picture' : element.arrowEnd || element.arrowStart ? 'Arrow' : 'Line'
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
            {element.type !== 'line' && (
                <Field label="Rotation (°)" hint="Clockwise. Drag the round handle on the slide; Shift turns in 15° steps.">
                    <div className="tp-row">
                        <NumberInput
                            min={-180}
                            max={180}
                            value={element.rotation ?? 0}
                            onChange={value => {
                                if (value === undefined) return
                                const rotation = normalizeRotation(value)
                                editor.patch({ rotation: rotation || undefined }, 'rotation')
                            }}
                            aria-label="Rotation"
                        />
                        <ToolButton
                            icon="rotate"
                            label="Turn 90° clockwise"
                            onClick={() => editor.patch(each => ({ rotation: normalizeRotation((each.rotation ?? 0) + 90) || undefined }))}
                        />
                        <ToolButton label="Reset rotation" disabled={!element.rotation} onClick={() => editor.patch({ rotation: undefined })}>
                            0°
                        </ToolButton>
                    </div>
                </Field>
            )}
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
            {element.type === 'table' && <TableProperties editor={editor} element={element} />}
            {element.type === 'chart' && <ChartProperties editor={editor} element={element} />}
            <Position editor={editor} element={element} />
            <LinkSection editor={editor} element={element} />
            <AnimationSection editor={editor} element={element} />
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

/** Where clicking the element goes, in the presenter and the PDF. */
function LinkSection({ editor, element }: { editor: SlideEditor; element: SlideElement }) {
    return (
        <Section title="Link">
            <Field
                label="Address"
                hint="https://…, mailto:…, or a path on this instance like /incident_list.do. Opens when the element is clicked while presenting, and in the PDF."
            >
                <Input
                    id="tp-element-link"
                    value={element.link ?? ''}
                    placeholder="None"
                    spellCheck={false}
                    onChange={event => editor.patch({ link: event.target.value.trim() ? event.target.value : undefined }, 'link')}
                />
            </Field>
        </Section>
    )
}

/** Whether the element waits for a click when presenting, how it arrives, and when. */
function AnimationSection({ editor, element }: { editor: SlideEditor; element: SlideElement }) {
    const sequence = buildSequence(editor.slide)
    const at = sequence.indexOf(element.id)
    return (
        <Section title="Animation">
            <Field label="On click" hint="The PDF and the thumbnails show every element.">
                <Select<BuildEffect | 'none'>
                    value={element.build?.effect ?? 'none'}
                    options={[{ value: 'none', label: 'None — always shown' }, ...BUILD_EFFECTS.map(entry => ({ value: entry.effect, label: entry.label }))]}
                    onChange={effect =>
                        editor.patch({
                            build:
                                effect === 'none'
                                    ? undefined
                                    : { effect, order: element.build?.order ?? nextBuildOrder(editor.slide) },
                        })
                    }
                />
            </Field>
            {at !== -1 && (
                <div className="tp-row">
                    <span className="tp-subtle tp-grow">
                        Step {at + 1} of {sequence.length}
                    </span>
                    <ToolButton
                        icon="chevronUp"
                        label="Play earlier"
                        disabled={at === 0}
                        onClick={() => editor.change(slide => moveBuild(slide, sequence, element.id, -1))}
                    />
                    <ToolButton
                        icon="chevronDown"
                        label="Play later"
                        disabled={at === sequence.length - 1}
                        onClick={() => editor.change(slide => moveBuild(slide, sequence, element.id, 1))}
                    />
                </div>
            )}
        </Section>
    )
}

function TableProperties({ editor, element }: { editor: SlideEditor; element: TableElement }) {
    const patch = (changes: Partial<TableElement>, merge?: string) => editor.patch(changes, merge)
    const rows = element.rows.length
    const columns = element.rows[0]?.length ?? 1
    return (
        <>
            <Section title={`Table, ${columns} × ${rows}`}>
                <div className="tp-row tp-row--wrap">
                    <Button size="sm" icon="plus" disabled={rows >= MAX_TABLE_ROWS} onClick={() => patch(insertRow(element))}>
                        Row
                    </Button>
                    <Button size="sm" icon="plus" disabled={columns >= MAX_TABLE_COLUMNS} onClick={() => patch(insertColumn(element))}>
                        Column
                    </Button>
                    <Button size="sm" icon="minus" variant="ghost" disabled={rows <= 1} onClick={() => patch(removeRow(element, rows - 1))}>
                        Row
                    </Button>
                    <Button size="sm" icon="minus" variant="ghost" disabled={columns <= 1} onClick={() => patch(removeColumn(element, columns - 1))}>
                        Column
                    </Button>
                </div>
                <div className="tp-inspector__cells" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                    {element.rows.map((cells, row) =>
                        cells.map((cell, column) => (
                            <Input
                                key={`${row},${column}`}
                                value={cell}
                                className={element.header && row === 0 ? 'is-header' : undefined}
                                aria-label={`Row ${row + 1}, column ${column + 1}`}
                                onChange={event => patch(setCell(element, row, column, event.target.value), `cell:${row},${column}`)}
                            />
                        ))
                    )}
                </div>
                <p className="tp-subtle">
                    <Icon name="info" size={12} /> Double-click a cell on the slide to type in it. Tokens work in cells.
                </p>
                <Switch checked={element.header} onChange={header => patch({ header })} label="Header row" />
                <div className="tp-grid tp-grid--2">
                    <ColorField label="Header fill" allowEmpty value={element.headerFill ?? ''} onChange={value => patch({ headerFill: value || undefined }, 'header-fill')} />
                    <ColorField label="Header text" allowEmpty value={element.headerColor ?? ''} onChange={value => patch({ headerColor: value || undefined }, 'header-color')} />
                    <ColorField label="Cells" allowEmpty value={element.fill ?? ''} onChange={value => patch({ fill: value || undefined }, 'cell-fill')} />
                    <ColorField label="Banding" allowEmpty value={element.banded ?? ''} onChange={value => patch({ banded: value || undefined }, 'banded')} />
                </div>
                <ColorField label="Grid lines" allowEmpty value={element.border ?? ''} onChange={value => patch({ border: value || undefined }, 'border')} />
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
                            max={200}
                            value={element.size}
                            onChange={size => size && size >= 4 && patch({ size: Math.min(200, size) }, 'font-size')}
                            aria-label="Font size"
                        />
                    </Field>
                </div>
                <ColorField label="Colour" value={element.color} onChange={color => patch({ color }, 'text-color')} />
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
                <Switch
                    checked={Boolean(element.code)}
                    onChange={code => patch({ code: code || undefined, ...(code ? { family: 'courier' as const, bullets: undefined } : {}) })}
                    label="Code — keep every space"
                />
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

/**
 * A chart element: which chart template it shows, and how this slide shows
 * it. What the chart counts belongs to the template, so it is changed there
 * — once, for every slide and deck that shows it; its look can be changed
 * here, for this slide alone, each choice falling back to the template's.
 */
function ChartProperties({ editor, element }: { editor: SlideEditor; element: ChartElement }) {
    const templates = useChartTemplates()
    const spec = useCharts([element.template])[element.template]?.spec
    const options = (templates.data ?? []).filter(chart => chart.active || chart.sysId === element.template)
    const known = options.some(chart => chart.sysId === element.template)
    const patch = (changes: Partial<ChartElement>, merge?: string) => editor.patch(changes, merge)
    const templateKind = spec?.chart
    const kind = element.chart ?? templateKind
    const kindLabel = (chart: ChartKind | undefined) => CHART_KINDS.find(entry => entry.kind === chart)?.label ?? 'Template’s'
    const kinds = templateKind ? CHART_KINDS.filter(entry => chartShape(entry.kind) === chartShape(templateKind)) : []
    const tri = (value: boolean | undefined): 'template' | 'on' | 'off' => (value === undefined ? 'template' : value ? 'on' : 'off')
    return (
        <>
            <Section title="Chart">
                <Field
                    label="Chart template"
                    hint="The chart counts its own table with its own filter whenever the presentation opens."
                >
                    <Select<string>
                        value={element.template}
                        options={[
                            ...(known ? [] : [{ value: element.template, label: element.name ?? 'This chart' }]),
                            ...options.map(chart => ({ value: chart.sysId, label: `${chart.name} · ${chart.tableLabel || chart.table}` })),
                        ]}
                        onChange={sysId => {
                            const chart = options.find(entry => entry.sysId === sysId)
                            // A kind that suits one template may not suit the next.
                            if (chart) patch({ template: chart.sysId, name: chart.name, chart: undefined })
                        }}
                        aria-label="Chart template"
                    />
                </Field>
                <div>
                    <a
                        className="tp-btn tp-btn--ghost tp-btn--sm"
                        href={`${window.location.pathname}?view=edit&id=${encodeURIComponent(element.template)}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <Icon name="external" size={14} />
                        <span>Edit the chart template</span>
                    </a>
                </div>
            </Section>
            <Section title="On this slide">
                <Field label="Draw as" hint={kinds.length > 1 ? 'The same figures, as another kind of chart.' : undefined}>
                    <Select<ChartKind | 'template'>
                        value={element.chart ?? 'template'}
                        options={[
                            { value: 'template', label: `Template’s (${kindLabel(templateKind)})` },
                            ...kinds.filter(entry => entry.kind !== templateKind).map(entry => ({ value: entry.kind, label: entry.label })),
                        ]}
                        onChange={chart => patch({ chart: chart === 'template' ? undefined : chart })}
                        aria-label="Draw as"
                    />
                </Field>
                <Switch
                    checked={!element.hideTitle}
                    onChange={show => patch({ hideTitle: show ? undefined : true })}
                    label="Show the chart’s title"
                />
                {!element.hideTitle && (
                    <Field label="Title" hint="Empty uses the template’s. {{list.count}} is how many records were counted.">
                        <Input
                            value={element.title ?? ''}
                            placeholder={spec?.title || 'Template’s title'}
                            maxLength={200}
                            onChange={event => patch({ title: event.target.value.trim() ? event.target.value : undefined }, 'chart-title')}
                        />
                    </Field>
                )}
                <Field label={kind ? showValuesLabel(kind) : 'Show figures'}>
                    <Select<'template' | 'on' | 'off'>
                        value={tri(element.showValues)}
                        options={[
                            { value: 'template', label: `Template’s (${spec?.showValues ? 'shown' : 'hidden'})` },
                            { value: 'on', label: 'Shown' },
                            { value: 'off', label: 'Hidden' },
                        ]}
                        onChange={value => patch({ showValues: value === 'template' ? undefined : value === 'on' })}
                        aria-label="Show figures"
                    />
                </Field>
                <div className="tp-grid tp-grid--2">
                    {!(kind && paletteChart(kind)) && (
                        <ColorField
                            label="Colour"
                            allowEmpty
                            hint="Empty is the template’s."
                            value={element.color ?? ''}
                            onChange={color => patch({ color: color || undefined }, 'chart-color')}
                        />
                    )}
                    <Field label="Text size (pt)" hint="Empty is the slide’s.">
                        <NumberInput
                            min={6}
                            max={32}
                            value={element.size}
                            placeholder="–"
                            onChange={size => patch({ size: size === undefined ? undefined : Math.min(32, Math.max(6, size)) }, 'chart-size')}
                            aria-label="Chart text size"
                        />
                    </Field>
                </div>
                <div className="tp-grid tp-grid--2">
                    <ColorField
                        label="Card"
                        allowEmpty
                        value={element.fill ?? ''}
                        onChange={fill => patch({ fill: fill || undefined }, 'chart-fill')}
                    />
                    <ColorField
                        label="Card outline"
                        allowEmpty
                        value={element.stroke ?? ''}
                        onChange={stroke => patch({ stroke: stroke || undefined }, 'chart-stroke')}
                    />
                </div>
                <Switch
                    checked={!element.hideNote}
                    onChange={show => patch({ hideNote: show ? undefined : true })}
                    label="Say when only some records were counted"
                />
                <div>
                    <Button
                        size="sm"
                        variant="ghost"
                        icon="undo"
                        disabled={CHART_LOOK_KEYS.every(key => element[key] === undefined) && !element.chart && !element.title}
                        onClick={() =>
                            patch({ chart: undefined, title: undefined, ...Object.fromEntries(CHART_LOOK_KEYS.map(key => [key, undefined])) })
                        }
                    >
                        Back to the template’s look
                    </Button>
                </div>
            </Section>
        </>
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
