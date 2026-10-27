import { gs, type GlideRecord } from '@servicenow/glide'
import {
    MAX_CUSTOM_SLIDES,
    MAX_NOTES_LENGTH,
    MAX_RECORDS,
    MAX_SECTION_RECORDS,
    MAX_SECTIONS,
    PRESENTATION_TABLE,
} from '../shared/constants.ts'
import { PRESENTATION_BODY_VERSION, SLIDE_LAYOUTS, TRANSITIONS } from '../shared/schema.ts'
import { BLANK_DECK_PAGE, dimensionsOf, newId, resolvePage, type PageSetup } from './page.ts'
import { Slide, type SlideOptions } from './slide.ts'
import type { Templater } from './templater.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- the body is JSON, read and written a key at a time. */

type Gr = GlideRecord<string>

/** Where a custom slide or a section goes in the running order. */
export type Position = 'end' | 'start' | 'afterCover' | { after: unknown } | { before: unknown }

type Entry = { key: string; hidden?: boolean }

type Body = {
    version: number
    slides: any[]
    order: Entry[]
    sections?: any[]
    transition?: string
    options?: Record<string, SlideOptions>
}

/**
 * A presentation being built or changed. Every setter returns the deck, so
 * calls chain; nothing is written until save() (which publishes it) or
 * saveDraft() (which keeps it for the builder, unpublished).
 *
 * Where a custom slide goes (`position` on addSlide):
 *   'end' (the default), 'start', 'afterCover',
 *   { after: <record sys_id or GlideRecord> }, { before: <record sys_id or GlideRecord> }
 *
 * The running order is stored as slide keys, so record slides are drawn
 * fresh every time the presentation opens. A record that starts matching
 * later takes its place among the other records. Custom slides stay where
 * you put them.
 *
 * A deck with no template (`templater.deck()`) is blank: it has no records
 * of its own, only custom slides and the templates placed in it.
 */
export class Deck {
    /** The deck's page: its size, margins and colours. */
    readonly page: PageSetup
    /** The slide's size in points. Every x, y, w and h on a slide uses the same points. */
    readonly width: number
    readonly height: number

    _templater: Templater
    private _template: Gr | null
    private _presentation: Gr | null
    private _templateBody: Record<string, any>
    private _meta: { name: string; title: string; query: string; orderBy: string; limit: number }
    private _body: Body
    private _placements: { key: string; position: Position }[] = []
    private _hidden: Record<string, boolean> = {}

    constructor(templater: Templater, template: Gr | null, presentation: Gr | null, fromDraft = false) {
        this._templater = templater
        this._template = template
        this._presentation = presentation

        const body = template ? templater._parse(template.getValue('body')) || {} : { page: BLANK_DECK_PAGE }
        this._templateBody = body
        this.page = resolvePage(body.page)
        const dimensions = dimensionsOf(this.page)
        this.width = dimensions.width
        this.height = dimensions.height

        const source = presentation || template
        this._meta = {
            name: presentation ? String(presentation.getValue('name') || '') : '',
            title: presentation
                ? String(presentation.getValue('title') || '')
                : template
                  ? String(template.getValue('name') || '')
                  : '',
            query: source && template ? String(source.getValue('query') || '') : '',
            orderBy: source && template ? String(source.getValue('order_by') || '') : '',
            limit: (source && parseInt(source.getValue('record_limit'), 10)) || 20,
        }

        // Opened to change, a presentation with unpublished changes carries on from them.
        const draft = presentation && fromDraft ? templater._parse(presentation.getValue('draft_body')) : null
        const saved = draft || (presentation ? templater._parse(presentation.getValue('body')) : null)
        if (draft && draft.meta) {
            const meta = draft.meta
            if (meta.title !== undefined) this._meta.title = String(meta.title || '')
            if (template && meta.query !== undefined) this._meta.query = String(meta.query || '')
            if (template && meta.orderBy !== undefined) this._meta.orderBy = String(meta.orderBy || '')
            if (meta.limit) this._meta.limit = parseInt(meta.limit, 10) || this._meta.limit
        }
        this._body = {
            version: PRESENTATION_BODY_VERSION,
            slides: saved && Array.isArray(saved.slides) ? saved.slides : [],
            order: saved && Array.isArray(saved.order) ? saved.order : [],
        }
        if (saved && Array.isArray(saved.sections) && saved.sections.length) this._body.sections = saved.sections
        if (saved && saved.transition) this._body.transition = saved.transition
        if (saved && saved.options) this._body.options = saved.options
    }

    /** The title on the title slide: {{deck.title}}. */
    title(title: unknown): this {
        this._meta.title = String(title || '')
        return this
    }

    /**
     * Which records get a slide: an encoded query on the template's table, a
     * GlideRecord, or an array of sys_ids. A queried GlideRecord gives its
     * encoded query; one record on its own, such as `current`, gives just that record.
     */
    records(records: unknown): this {
        this._meta.query = this._query(records, this._own('records'), 'deck')
        return this
    }

    /** A field to sort by. Start it with a minus sign to sort descending: '-opened_at'. */
    orderBy(field: unknown): this {
        this._own('orderBy')
        this._meta.orderBy = String(field || '')
        return this
    }

    /** At most this many records. */
    limit(limit: unknown): this {
        this._own('limit')
        this._meta.limit = this._templater._limit(limit)
        return this
    }

    /**
     * Places a template's slides in the deck as a section of their own: its
     * title slide, then a slide for each record it matches, drawn in the
     * template's own look every time the presentation opens. A blank deck
     * and a deck built on a template can both have sections.
     *
     * options: { records, orderBy, limit, title, name, position }. `records` is
     * an encoded query, a GlideRecord or an array of sys_ids on the template's
     * table; it defaults to the template's own. `limit` is at most 200.
     * `position` is 'end' (the default), 'start' or 'afterCover', as for addSlide.
     */
    addTemplate(template: unknown, options?: Record<string, any>): this {
        const source = this._templater._requireTemplate(template, 'Templater.addTemplate')
        if (String(source.getValue('kind')) === 'chart') {
            throw new Error(
                'Templater.addTemplate: "' +
                    source.getValue('name') +
                    '" is a chart template. Place it on a slide with slide.chart().'
            )
        }
        const sections = this._body.sections || (this._body.sections = [])
        if (sections.length >= MAX_SECTIONS) {
            throw new Error('Templater: a presentation can place up to ' + MAX_SECTIONS + ' templates.')
        }
        const own = options || {}
        const table = String(source.getValue('table'))
        const limit = parseInt(own.limit, 10) || parseInt(source.getValue('record_limit'), 10) || 20
        const section: Record<string, any> = {
            id: newId(),
            template: source.getUniqueValue(),
            name: String(own.name || source.getValue('name') || '').slice(0, 100),
            query:
                own.records !== undefined
                    ? this._query(own.records, table, 'template')
                    : String(source.getValue('query') || ''),
            limit: Math.max(1, Math.min(limit, MAX_SECTION_RECORDS)),
        }
        const orderBy =
            own.orderBy !== undefined ? String(own.orderBy || '') : String(source.getValue('order_by') || '')
        if (orderBy) section.orderBy = orderBy
        if (own.title) section.title = String(own.title).slice(0, 200)
        sections.push(section)
        this._placements.push({ key: 'section:' + section.id, position: own.position || 'end' })
        return this
    }

    /** How every slide comes in when presenting: none, fade, push, wipe or zoom. */
    transition(transition: string): this {
        if (!(TRANSITIONS as readonly string[]).includes(transition)) {
            throw new Error('Templater: a transition is one of ' + TRANSITIONS.join(', ') + '.')
        }
        this._body.transition = transition
        return this
    }

    /**
     * Speaker notes for a record's slide (a sys_id or GlideRecord), the title
     * slide ('cover'), or any slide key. A custom slide sets its own with slide.notes().
     */
    notes(slide: unknown, notes: unknown): this {
        return this._option(this._keyOf(slide), { notes: String(notes || '').slice(0, MAX_NOTES_LENGTH) })
    }

    /** Leaves a record's slide (or the title slide: 'cover') out of the show and the PDF. */
    hide(slide: unknown): this {
        this._hidden[this._keyOf(slide)] = true
        return this
    }

    /**
     * Adds a custom slide.
     *
     * layout: blank, title, titleContent, section, twoContent or titleOnly.
     * content: text for the layout's boxes — { title, subtitle, body, left, right, text };
     *     `body`, `left` and `right` take a string or an array of bullet points. Or a
     *     function, which is called with the slide to place elements yourself.
     * options: { position, name, alt, background, furniture, notes, transition }
     */
    addSlide(
        layout?: string,
        content?: Record<string, unknown> | ((slide: Slide) => void),
        options?: Record<string, any>
    ): this {
        if (this._body.slides.length >= MAX_CUSTOM_SLIDES) {
            throw new Error('Templater: a presentation can have up to ' + MAX_CUSTOM_SLIDES + ' custom slides.')
        }
        const kind = layout || 'blank'
        if (!(SLIDE_LAYOUTS as readonly string[]).includes(kind)) {
            throw new Error('Templater: a layout is one of ' + SLIDE_LAYOUTS.join(', ') + '.')
        }
        const own = options || {}
        const slide = new Slide(this, kind)
        if (typeof content === 'function') content(slide)
        else if (content) slide.fill(content)
        if (own.name) slide.name(own.name)
        if (own.alt) slide.alt(own.alt)
        if (own.background) slide.background(own.background)
        if (own.furniture) slide.furniture(true)
        if (own.notes) slide.notes(own.notes)
        if (own.transition) slide.transition(own.transition)

        this._body.slides.push(slide._data)
        if (slide._options) this._option('custom:' + slide._data.id, slide._options)
        this._placements.push({ key: 'custom:' + slide._data.id, position: own.position || 'end' })
        return this
    }

    /**
     * Writes the presentation, published — what its link presents — and returns
     * its sys_id. A new one needs a name; it defaults to the title. Any
     * unpublished changes made in the builder are replaced by this.
     */
    save(name?: unknown): string {
        return this._write(name, false)
    }

    /**
     * Writes the changes as unpublished: the builder opens them, and the
     * presentation's link goes on presenting what was last published until
     * someone publishes. A presentation never published is published instead.
     */
    saveDraft(name?: unknown): string {
        return this._write(name, true)
    }

    /** The saved presentation's sys_id, or null before save(). */
    sysId(): string | null {
        return this._presentation ? this._presentation.getUniqueValue() : null
    }

    /** A link that presents it. Needs save() first. */
    presentUrl(options?: { absolute?: boolean }): string {
        return this._templater.presentUrl(this._saved('presentUrl'), options)
    }

    /** A link that opens it in the slide builder. Needs save() first. */
    buildUrl(options?: { absolute?: boolean }): string {
        return this._templater.buildUrl(this._saved('buildUrl'), options)
    }

    /** The sys_ids of the records the deck would show now, in order. */
    recordIds(): string[] {
        if (!this._template) return []
        const table = String(this._template.getValue('table'))
        const record = this._templater._record(table)
        if (this._meta.query) record.addEncodedQuery(this._meta.query)
        const order = this._meta.orderBy.trim()
        if (order.charAt(0) === '-') record.orderByDesc(order.slice(1))
        else if (order) record.orderBy(order)
        record.setLimit(Math.max(1, Math.min(this._meta.limit, MAX_RECORDS)))
        record.query()
        const ids: string[] = []
        while (record.next()) ids.push(record.getUniqueValue())
        return ids
    }

    /* ------------------------------------------------------------ internals */

    private _write(name: unknown, asDraft: boolean): string {
        if (name) this._meta.name = String(name)
        if (!this._meta.name) {
            this._meta.name =
                this._meta.title || (this._template ? String(this._template.getValue('name')) : 'Untitled presentation')
        }

        this._body.order = this._arrange()
        const text = this._templater._serialize(this._body, 'Templater: a presentation body', 'presentation')

        let record = this._presentation
        const isNew = !record
        if (!record) {
            record = this._templater._record(PRESENTATION_TABLE)
            record.initialize()
            if (this._template) record.setValue('template', this._template.getUniqueValue())
        }
        record.setValue('name', this._meta.name.slice(0, 100))

        if (asDraft && !isNew && String(record.getValue('version') || '0') !== '0') {
            // The draft carries the deck's settings with it, so publishing changes them all at once.
            const draft = {
                ...JSON.parse(text),
                meta: {
                    title: this._meta.title.slice(0, 200),
                    query: this._meta.query,
                    orderBy: this._meta.orderBy,
                    limit: this._meta.limit,
                },
            }
            record.setValue('draft_body', JSON.stringify(draft))
        } else {
            record.setValue('title', this._meta.title.slice(0, 200))
            record.setValue('query', this._meta.query)
            record.setValue('order_by', this._meta.orderBy)
            record.setValue('record_limit', this._meta.limit)
            record.setValue('body', text)
            record.setValue('draft_body', '')
        }

        if (isNew) {
            this._templater._insert(record, 'Templater: the presentation')
            this._presentation = record
        } else if (!record.update()) {
            throw new Error('Templater: the presentation could not be saved.')
        }
        this._placements = []
        this._hidden = {}
        return record.getUniqueValue()
    }

    /** The deck template's table, for the methods that change its own records. A blank deck has none. */
    private _own(caller: string): string {
        if (!this._template) {
            throw new Error(
                'Templater: a blank deck has no records of its own to ' +
                    caller +
                    '. Place a template with addTemplate() instead.'
            )
        }
        return String(this._template.getValue('table'))
    }

    /** An encoded query on `wanted` from a query, a GlideRecord or an array of sys_ids. */
    private _query(records: any, wanted: string, what: string): string {
        if (records && typeof records.getEncodedQuery === 'function') {
            const table = String(records.getTableName())
            if (this._templater._ancestors(table).indexOf(wanted) === -1) {
                throw new Error(
                    'Templater: the ' + what + ' is for ' + wanted + ', and these records are on ' + table + '.'
                )
            }
            const encoded = String(records.getEncodedQuery() || '')
            const sysId = records.isValidRecord() ? String(records.getUniqueValue()) : ''
            // `current` in a business rule has no query: an empty one would match every record.
            if (!encoded && !sysId) throw new Error('Templater: that GlideRecord has neither a query nor a record.')
            return encoded || 'sys_id=' + sysId
        }
        if (Array.isArray(records)) return 'sys_idIN' + this._templater._ids(records).join(',')
        return String(records || '')
    }

    private _saved(caller: string): Gr {
        if (!this._presentation) throw new Error('Templater: call save() before ' + caller + '().')
        return this._presentation
    }

    private _keyOf(slide: any): string {
        if (slide && typeof slide.getUniqueValue === 'function') return 'record:' + slide.getUniqueValue() + ':1'
        const key = String(slide || '')
        if (key === 'cover') return 'cover:1'
        if (/^[0-9a-f]{32}$/.test(key)) return 'record:' + key + ':1'
        return key
    }

    private _option(key: string, change: SlideOptions): this {
        const options = this._body.options || (this._body.options = {})
        const current: SlideOptions = { ...(options[key] || {}), ...change }
        if (!current.notes || !String(current.notes).trim()) delete current.notes
        if (!current.transition) delete current.transition
        if (current.notes || current.transition) options[key] = current
        else delete options[key]
        return this
    }

    /**
     * The running order, as keys: the saved order (or, for a new deck, the
     * title slide and the records as they match now) with each new custom
     * slide put where it was asked for, and hidden slides marked.
     */
    private _arrange(): Entry[] {
        const order: Entry[] = []
        if (this._body.order.length) {
            for (const entry of this._body.order) {
                if (entry && entry.key) order.push(entry.hidden ? { key: entry.key, hidden: true } : { key: entry.key })
            }
        } else {
            if (this._templateBody.cover && this._templateBody.cover.length) order.push({ key: 'cover:1' })
            for (const id of this.recordIds()) order.push({ key: 'record:' + id + ':1' })
        }

        const indexOf = (prefix: string, last: boolean): number => {
            let found = -1
            for (let j = 0; j < order.length; j++) {
                if (order[j]!.key.indexOf(prefix) === 0) {
                    found = j
                    if (!last) break
                }
            }
            return found
        }

        for (const placement of this._placements) {
            const position: any = placement.position
            let at = order.length
            if (position === 'start') {
                at = 0
            } else if (position === 'afterCover') {
                at = indexOf('cover:', true) + 1
            } else if (position && (position.after || position.before)) {
                const anchor = this._keyOf(position.after || position.before).replace(/:\d+$/, ':')
                const found = indexOf(anchor, Boolean(position.after))
                if (found === -1) {
                    gs.warn(
                        '[Templater] ' + anchor.slice(0, -1) + ' is not in the deck; its custom slide goes at the end.'
                    )
                } else {
                    at = position.after ? found + 1 : found
                }
            } else if (position !== 'end') {
                throw new Error(
                    'Templater: a slide position is "start", "afterCover", "end", { after: id } or { before: id }.'
                )
            }
            order.splice(at, 0, { key: placement.key })
        }

        const placed: Record<string, boolean> = {}
        for (const entry of order) {
            placed[entry.key] = true
            if (this._hidden[entry.key]) entry.hidden = true
        }
        for (const key of Object.keys(this._hidden)) {
            if (!placed[key]) gs.warn('[Templater] ' + key + ' is not in the deck, so it cannot be hidden.')
        }
        return order
    }
}
