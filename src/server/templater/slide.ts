import { MAX_ELEMENTS, MAX_NOTES_LENGTH } from '../shared/constants.ts'
import { BUILD_EFFECTS, FONT_FAMILIES, SHAPE_KINDS, TRANSITIONS } from '../shared/schema.ts'
import type { Deck } from './deck.ts'
import { newId, type PageSetup } from './page.ts'
import type { Templater } from './templater.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- elements are the body's JSON, built a key at a time. */
type Element = Record<string, any>

/** The style keys a script passes for an element. Every one is optional. */
export type ElementStyle = Record<string, any>

export type SlideOptions = { notes?: string; transition?: string }

const HEX_COLOR = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * One custom slide. Positions and sizes are in points on the slide:
 * slide.width × slide.height (960 × 540 for a 16:9 deck), with the origin at
 * the top left. slide.left, slide.top, slide.innerWidth and slide.innerHeight
 * give the area inside the deck's margins.
 *
 * Text anywhere on a slide can use tokens: {{deck.title}}, {{deck.count}},
 * {{table.label}}, {{now.date}}, {{user.name}}, {{slide.number}}, {{slide.count}}.
 *
 * Every method returns the slide, so calls chain.
 */
export class Slide {
    readonly page: PageSetup
    readonly width: number
    readonly height: number
    readonly left: number
    readonly top: number
    readonly innerWidth: number
    readonly innerHeight: number

    /** The slide as the body stores it. */
    _data: { id: string; name?: string; background?: string; furniture?: boolean; alt?: string; elements: Element[] }
    /** Notes and transition, kept by the deck under the slide's key. */
    _options: SlideOptions | null = null
    private _templater: Templater
    private _slots: Record<string, Element> = {}

    constructor(deck: Deck, layout: string) {
        const page = deck.page
        this._templater = deck._templater
        this.page = page
        this.width = deck.width
        this.height = deck.height
        this.left = page.margins.left
        this.top = page.margins.top
        this.innerWidth = this.width - page.margins.left - page.margins.right
        this.innerHeight = this.height - page.margins.top - page.margins.bottom
        this._data = { id: newId(), elements: [] }
        this._layout(layout)
    }

    /**
     * A text box: a rectangle with no fill or outline.
     *
     * style: { x, y, w, h, size, color, bold, italic, underline, align, valign,
     *          family, bullets, lineHeight, code, opacity, rotation, link, build }
     * `build` holds the box back until a click: { effect: 'fade', order: 1 }.
     */
    text(text: unknown, style?: ElementStyle): this {
        return this._add(this._shape('rect', text, style || {}))
    }

    /** A bulleted list. `items` is an array or a string with one item per line. */
    bullets(items: unknown, style?: ElementStyle): this {
        return this._add(this._shape('rect', this._lines(items), { bullets: true, ...(style || {}) }))
    }

    /**
     * A shape, with optional text in it.
     *
     * kind: rect, roundRect, ellipse, triangle, rightTriangle, diamond, pentagon,
     *       hexagon, parallelogram, trapezoid, chevron, arrow or star.
     * style: as text(), plus { fill, stroke, strokeWidth, text }.
     */
    shape(kind: string, style?: ElementStyle): this {
        if (!(SHAPE_KINDS as readonly string[]).includes(kind)) {
            throw new Error('Templater: a shape is one of ' + SHAPE_KINDS.join(', ') + '.')
        }
        const own = style || {}
        const element = this._shape(kind, own.text || '', own)
        // With neither a fill nor an outline it would be invisible: give it the deck's accent, and white text on it.
        if (own.fill === undefined && own.stroke === undefined) {
            element.fill = this.page.accentColor
            if (own.color === undefined) element.color = '#ffffff'
        }
        return this._add(element)
    }

    /**
     * A straight line from (x1, y1) to (x2, y2).
     * style: { x1, y1, x2, y2, stroke, strokeWidth, dashed, arrowStart, arrowEnd, opacity, link, build }
     */
    line(style?: ElementStyle): this {
        const own = style || {}
        const x1 = this._number(own.x1, this.left)
        const y1 = this._number(own.y1, this.top)
        const x2 = this._number(own.x2, x1 + 200)
        const y2 = this._number(own.y2, y1)
        const element = this._box(
            { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) },
            own,
            0
        )
        element.type = 'line'
        element.stroke = this._color(own.stroke, this.page.textColor)
        element.strokeWidth = this._number(own.strokeWidth, 2)
        // The box runs top-left to bottom-right; a line that rises the other way is flipped.
        if ((x2 - x1) * (y2 - y1) < 0) element.flip = true
        // The renderer draws from the left end (the top one, for an upright line): name the arrowheads by that.
        const forward = x1 < x2 || (x1 === x2 && y1 <= y2)
        if (own.arrowEnd) element[forward ? 'arrowEnd' : 'arrowStart'] = true
        if (own.arrowStart) element[forward ? 'arrowStart' : 'arrowEnd'] = true
        if (own.dashed) element.dashed = true
        return this._add(element)
    }

    /**
     * A table. `rows` is an array of rows, each an array of cell text (tokens work).
     * style: { x, y, w, h, header (default true), size, color, family, align,
     *          columns (width shares), headerFill, headerColor, banded, fill, border }
     */
    table(rows: unknown, style?: ElementStyle): this {
        const own = style || {}
        if (!Array.isArray(rows) || !rows.length) throw new Error('Templater: a table needs at least one row.')
        const kept = rows.slice(0, 20)
        let width = 1
        for (const row of kept) width = Math.max(width, Math.min((Array.isArray(row) ? row : []).length, 10))
        const cells = kept.map(row => {
            const cellsOf: unknown[] = Array.isArray(row) ? row : []
            const out: string[] = []
            for (let j = 0; j < width; j++) out.push(String(cellsOf[j] === undefined ? '' : cellsOf[j]).slice(0, 1000))
            return out
        })
        const element = this._box(
            { x: this.left, y: this.top, w: this.innerWidth, h: Math.min(this.innerHeight, kept.length * 36) },
            own,
            1
        )
        element.type = 'table'
        element.rows = cells
        element.header = own.header !== false
        element.size = this._number(own.size, 14)
        element.color = this._color(own.color, this.page.textColor)
        element.align = this._align(own.align)
        element.headerFill = this._color(own.headerFill, this.page.accentColor)
        element.headerColor = this._color(own.headerColor, '#ffffff')
        element.border = this._color(own.border, '#d4d4d8')
        if (own.banded) element.banded = this._color(own.banded)
        if (own.fill) element.fill = this._color(own.fill)
        if (own.family) element.family = this._family(own.family)
        if (Array.isArray(own.columns) && own.columns.length === width) element.columns = own.columns
        return this._add(element)
    }

    /** A PNG or JPEG data: URL stretched to its box. style: { x, y, w, h, stroke, strokeWidth, opacity, link, build } */
    image(source: unknown, style?: ElementStyle): this {
        const url = String(source || '').trim()
        if (!/^data:image\/(png|jpe?g);base64,/i.test(url)) {
            throw new Error('Templater: a picture must be a PNG or JPEG data: URL.')
        }
        const own = style || {}
        const element = this._box({ x: this.left, y: this.top, w: 240, h: 160 }, own, 1)
        element.type = 'image'
        element.source = url
        if (own.stroke) {
            element.stroke = this._color(own.stroke)
            element.strokeWidth = this._number(own.strokeWidth, 1)
        }
        return this._add(element)
    }

    /**
     * A chart template (sys_id, name or GlideRecord), drawn to fill its box: its
     * own records, grouping and look, counted each time the presentation opens.
     * style: { x, y, w, h, hideTitle, opacity, rotation, link, build } and, to
     * change the template's look on this slide alone: chart (another kind of the
     * same shape, e.g. 'bar' for a column chart), title, color, showValues,
     * size (text, in points), fill and stroke (a card behind the chart), hideNote.
     * The box defaults to the area inside the margins.
     */
    chart(template: unknown, style?: ElementStyle): this {
        const record = this._templater._requireTemplate(template, 'Templater: slide.chart')
        if (String(record.getValue('kind')) !== 'chart') {
            throw new Error('Templater: slide.chart: "' + record.getValue('name') + '" is not a chart template.')
        }
        const own = style || {}
        const element = this._box({ x: this.left, y: this.top, w: this.innerWidth, h: this.innerHeight }, own, 1)
        element.type = 'chart'
        element.template = record.getUniqueValue()
        element.name = String(record.getValue('name') || '').slice(0, 100)
        if (own.hideTitle) element.hideTitle = true
        if (own.chart) element.chart = String(own.chart)
        if (own.title) element.title = String(own.title).slice(0, 200)
        if (own.color) element.color = this._color(own.color)
        if (typeof own.showValues === 'boolean') element.showValues = own.showValues
        if (own.size) element.size = Math.min(32, Math.max(6, this._number(own.size, 12)))
        if (own.fill) element.fill = this._color(own.fill)
        if (own.stroke) element.stroke = this._color(own.stroke)
        if (own.hideNote) element.hideNote = true
        return this._add(element)
    }

    /** What the slide sorter calls it. Without one it is named after its first line of text. */
    name(name: unknown): this {
        this._data.name = String(name || '').slice(0, 80)
        return this
    }

    /** What the slide shows, in words, for screen readers. Without it, its name and text are read. */
    alt(text: unknown): this {
        const alt = String(text || '').trim()
        if (alt) this._data.alt = alt.slice(0, 1000)
        else delete this._data.alt
        return this
    }

    /** A background colour for this slide alone. */
    background(color: unknown): this {
        this._data.background = this._color(color)
        return this
    }

    /** Draw the deck's letterhead, watermark and footer on this slide too. */
    furniture(on?: boolean): this {
        if (on === false) delete this._data.furniture
        else this._data.furniture = true
        return this
    }

    notes(notes: unknown): this {
        this._options = this._options || {}
        this._options.notes = String(notes || '').slice(0, MAX_NOTES_LENGTH)
        return this
    }

    transition(transition: string): this {
        if (!(TRANSITIONS as readonly string[]).includes(transition)) {
            throw new Error('Templater: a transition is one of ' + TRANSITIONS.join(', ') + '.')
        }
        this._options = this._options || {}
        this._options.transition = transition
        return this
    }

    /** The layout's boxes in the order the layout makes them, for changing after fill(). */
    elements(): Element[] {
        return this._data.elements
    }

    /** Fills the layout's boxes: { title, subtitle, body, left, right, text }. */
    fill(content: Record<string, unknown>): this {
        for (const name of Object.keys(content)) {
            const element = this._slots[name]
            if (!element) throw new Error('Templater: this layout has no "' + name + '" box.')
            element.text = this._lines(content[name])
        }
        return this
    }

    /* ------------------------------------------------------------ internals */

    _add(element: Element): this {
        if (this._data.elements.length >= MAX_ELEMENTS) {
            throw new Error('Templater: a slide can have up to ' + MAX_ELEMENTS + ' elements.')
        }
        this._data.elements.push(element)
        return this
    }

    private _lines(value: unknown): string {
        if (Array.isArray(value)) return value.join('\n').slice(0, 5000)
        return String(value === undefined || value === null ? '' : value).slice(0, 5000)
    }

    private _number(value: unknown, fallback: number): number {
        const number = typeof value === 'number' ? value : parseFloat(String(value))
        return isFinite(number) ? number : fallback
    }

    private _color(value: unknown, fallback?: string): string {
        if (value === undefined || value === null || value === '') return fallback as string
        const raw = String(value).trim()
        if (!HEX_COLOR.test(raw)) {
            throw new Error('Templater: "' + value + '" is not a colour. Use a hex colour such as #1d4ed8.')
        }
        return raw.charAt(0) === '#' ? raw : '#' + raw
    }

    private _align(value: unknown): string {
        return value === 'center' || value === 'right' ? value : 'left'
    }

    private _family(value: unknown): string {
        if (!(FONT_FAMILIES as readonly unknown[]).includes(value)) {
            throw new Error('Templater: a font is one of ' + FONT_FAMILIES.join(', ') + '.')
        }
        return String(value)
    }

    /** The box every element has, with the defaults given and the common style applied. */
    private _box(defaults: { x: number; y: number; w: number; h: number }, style: ElementStyle, min: number): Element {
        const element: Element = {
            id: newId(),
            x: this._number(style.x, defaults.x),
            y: this._number(style.y, defaults.y),
            w: Math.max(min, this._number(style.w, defaults.w)),
            h: Math.max(min, this._number(style.h, defaults.h)),
        }
        if (style.opacity !== undefined && style.opacity < 1)
            element.opacity = Math.max(0.05, this._number(style.opacity, 1))
        if (style.rotation && min > 0) element.rotation = this._number(style.rotation, 0)
        if (style.link) element.link = String(style.link).slice(0, 2000)
        if (style.build) {
            const effect = style.build.effect || 'appear'
            if (!(BUILD_EFFECTS as readonly string[]).includes(effect)) {
                throw new Error('Templater: a build effect is one of ' + BUILD_EFFECTS.join(', ') + '.')
            }
            element.build = { effect, order: Math.max(1, parseInt(style.build.order, 10) || 1) }
        }
        return element
    }

    /** A shape with text, in the deck's own type unless the style says otherwise. */
    private _shape(kind: string, text: unknown, style: ElementStyle): Element {
        const element = this._box({ x: this.left, y: this.top, w: this.innerWidth, h: 60 }, style, 1)
        element.type = 'shape'
        element.shape = kind
        element.text = this._lines(text)
        element.size = this._number(style.size, this.page.fontSize)
        element.color = this._color(style.color, this.page.textColor)
        element.align = this._align(style.align)
        element.valign = style.valign === 'middle' || style.valign === 'bottom' ? style.valign : 'top'
        if (style.bold) element.bold = true
        if (style.italic) element.italic = true
        if (style.underline) element.underline = true
        if (style.bullets) element.bullets = true
        if (style.code) element.code = true
        if (style.family) element.family = this._family(style.family)
        if (style.lineHeight) element.lineHeight = this._number(style.lineHeight, 1.2)
        if (style.placeholder) element.placeholder = String(style.placeholder).slice(0, 80)
        if (style.fill) element.fill = this._color(style.fill)
        if (style.stroke) {
            element.stroke = this._color(style.stroke)
            element.strokeWidth = this._number(style.strokeWidth, 1.5)
        }
        return element
    }

    /** The same stock layouts as the slide builder (layoutSlide in src/client/engine/presentation.ts). */
    private _layout(layout: string) {
        const page = this.page
        const { left, top, innerWidth, innerHeight } = this
        const titleHeight = Math.round(innerHeight * 0.2)

        const box = (slot: string, frame: ElementStyle, style: ElementStyle) => {
            const element = this._shape('rect', '', { ...frame, ...style })
            this._slots[slot] = element
            this._add(element)
        }
        const title = (frame: ElementStyle, size: number, extra?: ElementStyle) =>
            box('title', frame, {
                placeholder: 'Click to add title',
                size,
                bold: true,
                color: page.accentColor,
                ...(extra || {}),
            })
        const body = (slot: string, frame: ElementStyle) =>
            box(slot, frame, { placeholder: 'Click to add text', size: Math.max(14, page.fontSize + 2), bullets: true })

        switch (layout) {
            case 'title':
                title({ x: left, y: top + innerHeight * 0.28, w: innerWidth, h: innerHeight * 0.26 }, 44, {
                    align: 'center',
                    valign: 'bottom',
                })
                box(
                    'subtitle',
                    {
                        x: left + innerWidth * 0.1,
                        y: top + innerHeight * 0.58,
                        w: innerWidth * 0.8,
                        h: innerHeight * 0.16,
                    },
                    { placeholder: 'Click to add subtitle', size: 20, color: page.mutedColor, align: 'center' }
                )
                break
            case 'titleContent':
                title({ x: left, y: top, w: innerWidth, h: titleHeight }, 32, { valign: 'middle' })
                body('body', { x: left, y: top + titleHeight + 12, w: innerWidth, h: innerHeight - titleHeight - 12 })
                break
            case 'section':
                title({ x: left, y: top + innerHeight * 0.3, w: innerWidth, h: innerHeight * 0.24 }, 40, {
                    valign: 'bottom',
                })
                box(
                    'text',
                    { x: left, y: top + innerHeight * 0.56, w: innerWidth, h: innerHeight * 0.14 },
                    { placeholder: 'Click to add text', size: 18, color: page.mutedColor }
                )
                break
            case 'twoContent': {
                const gap = 24
                const half = (innerWidth - gap) / 2
                const y = top + titleHeight + 12
                const h = innerHeight - titleHeight - 12
                title({ x: left, y: top, w: innerWidth, h: titleHeight }, 32, { valign: 'middle' })
                body('left', { x: left, y, w: half, h })
                body('right', { x: left + half + gap, y, w: half, h })
                break
            }
            case 'titleOnly':
                title({ x: left, y: top, w: innerWidth, h: titleHeight }, 32, { valign: 'middle' })
                break
        }
    }
}
