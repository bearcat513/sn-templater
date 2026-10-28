import { gs, GlideRecord, GlideRecordSecure, GlideSysAttachment, GlideTableHierarchy } from '@servicenow/glide'
import {
    MAX_BODY_LENGTH,
    MAX_RECORDS,
    PAGE,
    PRESENTATION_TABLE,
    TEMPLATE_TABLE,
    VERSION_TABLE,
} from '../shared/constants.ts'
import { checkBody, checkPresentationBody, TEMPLATE_KINDS, type BodyCheck } from '../shared/schema.ts'
import { stringsOf } from '../lists.ts'
import { Deck } from './deck.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- scripts hand this API anything; each method checks what it gets. */

type Gr = GlideRecord<string>

export type TemplaterOptions = { secure?: boolean }

/** A template as a plain object. `body` is the parsed JSON, or null when it is empty or unreadable. */
export type TemplateObject = {
    sys_id: string
    name: string
    kind: string
    table: string
    description: string
    active: boolean
    query: string
    orderBy: string
    limit: number
    version: number
    hasDraft: boolean
    body?: any
}

/** What createTemplate and updateTemplate take. Every key but name and table is optional. */
export type TemplateSpec = {
    name?: string
    table?: string
    kind?: string
    body?: unknown
    description?: string
    query?: string
    orderBy?: string
    limit?: number
    active?: boolean
}

export type VersionObject = {
    sys_id: string
    version: number
    note: string
    publishedBy: string
    publishedOn: string
    body?: any
}

const SYS_ID = /^[0-9a-f]{32}$/

/**
 * Templater: the server-side API for scripts. Business rules, flows,
 * scheduled jobs and fix scripts use it — through the `Templater` script
 * include, which hands every call to this class — to find, create and copy
 * templates, stage and publish changes to them, get links that export
 * records to PDF, and build saved presentations, custom slides included.
 *
 * PDFs are still drawn in the browser. A link from here opens Templater,
 * which renders the file with the viewer's own session, so a template only
 * ever shows what its reader is allowed to see.
 *
 * Records are read and written with GlideRecord, as server scripts normally
 * are. `{ secure: true }` goes through ACLs as the current user instead.
 *
 * Every body written is checked first (src/server/shared/schema.ts): a body
 * the designer could not read is refused with an Error that says why.
 */
export class Templater {
    readonly secure: boolean

    constructor(options?: TemplaterOptions) {
        this.secure = Boolean(options && options.secure)
    }

    /* ------------------------------------------------------------ templates */

    /**
     * A template as a plain object, found by sys_id, by name, or from its
     * GlideRecord. By name, an active template wins over an inactive one.
     * The body is the published one. Returns null when there is none.
     */
    getTemplate(template: unknown): TemplateObject | null {
        const record = this._templateRecord(template)
        return record ? this._templateObject(record) : null
    }

    /**
     * The same, with the unpublished changes as its body when there are any:
     * what the designer would open. `hasDraft` says which it is.
     */
    getDraft(template: unknown): TemplateObject | null {
        const record = this._templateRecord(template)
        if (!record) return null
        const object = this._templateObject(record)
        const draft = this._parse(record.getValue('draft_body'))
        if (draft) object.body = draft
        return object
    }

    /**
     * Templates, as plain objects without their bodies.
     *
     * filter: { table, kind, activeOnly }. `table` matches templates made for
     * it or for a table it extends; `activeOnly` defaults to true.
     */
    findTemplates(filter?: { table?: string; kind?: string; activeOnly?: boolean }): TemplateObject[] {
        const own = filter || {}
        const record = this._record(TEMPLATE_TABLE)
        if (own.activeOnly !== false) record.addActiveQuery()
        if (own.kind) record.addQuery('kind', String(own.kind))
        if (own.table) record.addQuery('table', 'IN', this._ancestors(String(own.table)).join(','))
        record.orderBy('name')
        record.query()

        const found: TemplateObject[] = []
        while (record.next()) {
            const template = this._templateObject(record)
            delete template.body
            found.push(template)
        }
        return found
    }

    /**
     * Creates a template and returns its sys_id. Its body, when given, is
     * published as version 1. Without one, the designer starts the template
     * from the table's fields the first time it is opened.
     */
    createTemplate(spec: TemplateSpec): string {
        if (!spec || !spec.name) throw new Error('Templater.createTemplate: a template needs a name.')
        if (!spec.table || !gs.tableExists(String(spec.table))) {
            throw new Error('Templater.createTemplate: there is no table called "' + spec.table + '".')
        }
        const record = this._record(TEMPLATE_TABLE)
        record.initialize()
        this._writeTemplate(record, spec, spec.kind || 'document')
        if (!spec.kind) record.setValue('kind', 'document')
        return this._insert(record, 'Templater.createTemplate')
    }

    /**
     * Copies a template, the way "Start from" does in the New template dialog,
     * and returns the copy's sys_id. `changes` takes the same fields as
     * createTemplate; the name defaults to "<name> (copy)". The copy starts from
     * the published body, with copies of the pictures attached to the original.
     */
    copyTemplate(template: unknown, changes?: TemplateSpec): string {
        const source = this._requireTemplate(template, 'Templater.copyTemplate')
        const own = changes || {}
        const record = this._record(TEMPLATE_TABLE)
        record.initialize()
        for (const field of [
            'name',
            'kind',
            'table',
            'description',
            'active',
            'query',
            'order_by',
            'record_limit',
            'body',
        ]) {
            record.setValue(field, source.getValue(field))
        }
        record.setValue('name', String(source.getValue('name')) + ' (copy)')
        this._writeTemplate(record, own, String(own.kind || source.getValue('kind') || 'document'))
        const copyId = this._insert(record, 'Templater.copyTemplate')
        // Pictures are attachments of the template, named in its body: the copy gets its own.
        new GlideSysAttachment().copy(TEMPLATE_TABLE, source.getUniqueValue(), TEMPLATE_TABLE, copyId)
        return copyId
    }

    /**
     * Changes a template and returns its sys_id. `changes` takes the same
     * fields as createTemplate. A `body` here is published straight away, as
     * a new version; to stage a change for review instead, use saveDraft().
     */
    updateTemplate(template: unknown, changes?: TemplateSpec): string {
        const record = this._requireTemplate(template, 'Templater.updateTemplate')
        const own = changes || {}
        this._writeTemplate(record, own, String(own.kind || record.getValue('kind') || 'document'))
        if (own.body !== undefined) record.setValue('draft_body', '')
        if (!record.update()) throw new Error('Templater.updateTemplate: the template could not be saved.')
        return record.getUniqueValue()
    }

    /* --------------------------------------------------- drafts and versions */

    /**
     * Saves a body as unpublished changes: the designer opens it, and exports,
     * decks and presentations go on using the published body. Returns the sys_id.
     */
    saveDraft(template: unknown, body: unknown): string {
        const record = this._requireTemplate(template, 'Templater.saveDraft')
        const kind = String(record.getValue('kind') || 'document')
        record.setValue('draft_body', this._serialize(body, 'Templater.saveDraft: the body', kind))
        if (!record.update()) throw new Error('Templater.saveDraft: the template could not be saved.')
        return record.getUniqueValue()
    }

    /**
     * Publishes a template's unpublished changes, with a note kept on the
     * version it makes, and returns the version number now published. With
     * nothing unpublished it changes nothing and returns the current version.
     */
    publish(template: unknown, note?: string): number {
        const record = this._requireTemplate(template, 'Templater.publish')
        const draft = String(record.getValue('draft_body') || '')
        if (!draft) return parseInt(record.getValue('version'), 10) || 0
        record.setValue('body', draft)
        record.setValue('draft_body', '')
        record.setValue('publish_note', String(note || '').slice(0, 1000))
        if (!record.update()) throw new Error('Templater.publish: the template could not be saved.')
        return parseInt(record.getValue('version'), 10) || 0
    }

    /** Drops a template's unpublished changes. Returns whether there were any. */
    discardDraft(template: unknown): boolean {
        const record = this._requireTemplate(template, 'Templater.discardDraft')
        if (!record.getValue('draft_body')) return false
        record.setValue('draft_body', '')
        if (!record.update()) throw new Error('Templater.discardDraft: the template could not be saved.')
        return true
    }

    /** A template's published versions, newest first, without their bodies. */
    versions(template: unknown): VersionObject[] {
        const record = this._requireTemplate(template, 'Templater.versions')
        const version = this._record(VERSION_TABLE)
        version.addQuery('template', record.getUniqueValue())
        version.orderByDesc('version')
        version.query()
        const found: VersionObject[] = []
        while (version.next()) {
            const object = this._versionObject(version)
            delete object.body
            found.push(object)
        }
        return found
    }

    /** One published version, by its number, with its body parsed. Null when there is no such version. */
    getVersion(template: unknown, number: number): VersionObject | null {
        const version = this._versionRecord(template, number, 'Templater.getVersion')
        return version ? this._versionObject(version) : null
    }

    /**
     * Brings back a published version: as unpublished changes to review, or —
     * with `{ publish: true, note }` — published again as a new version.
     * Returns the template's sys_id.
     */
    restoreVersion(template: unknown, number: number, options?: { publish?: boolean; note?: string }): string {
        const version = this._versionRecord(template, number, 'Templater.restoreVersion')
        if (!version) throw new Error('Templater.restoreVersion: there is no version ' + number + '.')
        const record = this._requireTemplate(template, 'Templater.restoreVersion')
        const body = String(version.getValue('body') || '')
        if (options && options.publish) {
            record.setValue('body', body)
            record.setValue('draft_body', '')
            record.setValue('publish_note', String(options.note || 'Restored version ' + number).slice(0, 1000))
        } else {
            record.setValue('draft_body', body)
        }
        if (!record.update()) throw new Error('Templater.restoreVersion: the template could not be saved.')
        return record.getUniqueValue()
    }

    /**
     * Checks a body without saving it: { ok, errors, warnings }. `kind` is
     * 'document', 'deck', 'chart' or 'presentation'. A body with errors would
     * be refused by every method that writes one.
     */
    checkBody(kind: string, body: unknown): { ok: boolean; errors: string[]; warnings: string[] } {
        const check = this._check(kind, body)
        return { ok: check.ok, errors: check.errors, warnings: check.warnings }
    }

    /* ------------------------------------------------------------ documents */

    /**
     * A link that opens Templater on a document template and makes the PDF.
     * Put it in an email, a work note or a URL action.
     *
     * records: one record (a GlideRecord or a sys_id), or several (an array of
     * sys_ids, or an encoded query on the template's table).
     * options: { absolute } puts the instance's address in front, for emails.
     */
    exportUrl(template: unknown, records: any, options?: { absolute?: boolean }): string {
        const source = this._requireTemplate(template, 'Templater.exportUrl')
        const params: Record<string, string> = { view: 'export', template: source.getUniqueValue() }
        const table = String(source.getValue('table'))

        if (records && typeof records.getUniqueValue === 'function') {
            params.table = String(records.getTableName())
            params.sys_id = String(records.getUniqueValue())
        } else if (Array.isArray(records)) {
            params.table = table
            params.query = 'sys_idIN' + this._ids(records).join(',')
        } else if (records && SYS_ID.test(String(records))) {
            params.table = table
            params.sys_id = String(records)
        } else if (records) {
            params.table = table
            params.query = String(records)
        }
        return this._url(params, options)
    }

    /* ---------------------------------------------------------------- decks */

    /**
     * Starts a new presentation on a deck template. Chain the builder's
     * methods, then call save(). The template's default records, order and
     * limit apply until you change them. With no template, it starts a blank
     * presentation: custom slides of your own, and templates placed in it.
     */
    deck(template?: unknown): Deck {
        if (template === undefined || template === null || template === '') return new Deck(this, null, null)
        const source = this._requireTemplate(template, 'Templater.deck')
        if (String(source.getValue('kind')) !== 'deck') {
            throw new Error(
                'Templater.deck: "' +
                    source.getValue('name') +
                    '" is a ' +
                    String(source.getValue('kind') || 'document') +
                    ' template, not a deck.'
            )
        }
        return new Deck(this, source, null)
    }

    /**
     * Opens a saved presentation (sys_id, name or GlideRecord) to add slides,
     * notes or hidden slides, or to change its records. Call save() to write
     * it back published, or saveDraft() to leave it for review.
     *
     * options: { draft } carries on from the builder's unpublished changes,
     * when there are any, rather than from what is published.
     */
    openDeck(presentation: unknown, options?: { draft?: boolean }): Deck {
        const record = this._presentationRecord(presentation)
        if (!record) throw new Error('Templater.openDeck: there is no presentation "' + presentation + '".')
        // No deck template — built from nothing, or its template was deleted — is a blank presentation.
        const templateId = String(record.getValue('template') || '')
        const template = templateId ? this._templateRecord(templateId) : null
        return new Deck(this, template, record, Boolean(options && options.draft))
    }

    /** Publishes a presentation's unpublished changes. Returns the version now published. */
    publishDeck(presentation: unknown, note?: string): number {
        const record = this._presentationRecord(presentation)
        if (!record) throw new Error('Templater.publishDeck: there is no presentation "' + presentation + '".')
        const draft = this._parse(record.getValue('draft_body'))
        if (!draft) return parseInt(record.getValue('version'), 10) || 0
        const meta = draft.meta || {}
        delete draft.meta
        if (meta.title !== undefined) record.setValue('title', String(meta.title || '').slice(0, 200))
        if (meta.query !== undefined) record.setValue('query', String(meta.query || ''))
        if (meta.orderBy !== undefined) record.setValue('order_by', String(meta.orderBy || ''))
        if (meta.limit) record.setValue('record_limit', this._limit(meta.limit))
        record.setValue('body', this._serialize(draft, 'Templater.publishDeck: the body', 'presentation'))
        record.setValue('draft_body', '')
        record.setValue('publish_note', String(note || '').slice(0, 1000))
        if (!record.update()) throw new Error('Templater.publishDeck: the presentation could not be saved.')
        return parseInt(record.getValue('version'), 10) || 0
    }

    /** A link that presents a saved presentation. */
    presentUrl(presentation: unknown, options?: { absolute?: boolean }): string {
        const record = this._presentationRecord(presentation)
        if (!record) throw new Error('Templater.presentUrl: there is no presentation "' + presentation + '".')
        return this._url({ view: 'present', presentation: record.getUniqueValue() }, options)
    }

    /** A link that opens a saved presentation in the slide builder. */
    buildUrl(presentation: unknown, options?: { absolute?: boolean }): string {
        const record = this._presentationRecord(presentation)
        if (!record) throw new Error('Templater.buildUrl: there is no presentation "' + presentation + '".')
        return this._url({ view: 'build', id: record.getUniqueValue() }, options)
    }

    /* ------------------------------------------- internals the deck uses too */

    _record(table: string): Gr {
        return (this.secure ? new GlideRecordSecure(table) : new GlideRecord(table)) as Gr
    }

    _insert(record: Gr, caller: string): string {
        const sysId = record.insert()
        if (!sysId) throw new Error(caller + ': the record could not be saved.' + this._why())
        return String(sysId)
    }

    _ancestors(table: string): string[] {
        return stringsOf(new GlideTableHierarchy(table).getTables())
    }

    _ids(list: any[]): string[] {
        const ids: string[] = []
        for (const item of list) {
            const id = item && typeof item.getUniqueValue === 'function' ? item.getUniqueValue() : item
            if (SYS_ID.test(String(id))) ids.push(String(id))
        }
        return ids
    }

    _templateRecord(template: unknown): Gr | null {
        return this._find(TEMPLATE_TABLE, template)
    }

    _presentationRecord(presentation: unknown): Gr | null {
        return this._find(PRESENTATION_TABLE, presentation)
    }

    _requireTemplate(template: unknown, caller: string): Gr {
        const record = this._templateRecord(template)
        if (!record) throw new Error(caller + ': there is no template "' + template + '".')
        return record
    }

    _parse(text: unknown): any {
        if (!text) return null
        try {
            return JSON.parse(String(text))
        } catch {
            return null
        }
    }

    /**
     * A body as the text to store, refused when the reader could not use it.
     * `kind` is the template's kind, or 'presentation'.
     */
    _serialize(body: unknown, what: string, kind: string): string {
        const text = typeof body === 'string' ? body : JSON.stringify(body)
        if (text.length > MAX_BODY_LENGTH) {
            throw new Error(what + ' must be ' + MAX_BODY_LENGTH + ' characters or fewer.')
        }
        const check = this._check(kind, text)
        if (!check.ok) throw new Error(what + ' was refused: ' + check.errors.join(' '))
        for (const warning of check.warnings) gs.warn('[Templater] ' + what + ': ' + warning)
        return text
    }

    _limit(value: unknown): number {
        const limit = parseInt(String(value), 10)
        if (!(limit > 0)) throw new Error('Templater: a record limit must be a positive number.')
        return Math.min(limit, MAX_RECORDS)
    }

    /* ------------------------------------------------------------ internals */

    private _check(kind: string, body: unknown): BodyCheck {
        return kind === 'presentation' ? checkPresentationBody(body) : checkBody(kind, body)
    }

    /** Why the last write failed, when a business rule said. */
    private _why(): string {
        const messages = stringsOf(gs.getErrorMessages())
        return messages.length ? ' ' + messages.join(' ') : ''
    }

    /** By GlideRecord, sys_id or name. By name, active first. */
    private _find(table: string, value: any): Gr | null {
        if (!value) return null
        if (typeof value.getUniqueValue === 'function') {
            if (String(value.getTableName()) !== table) return null
            return this._find(table, String(value.getUniqueValue()))
        }
        const key = String(value)
        let record = this._record(table)
        if (SYS_ID.test(key) && record.get(key)) return record

        record = this._record(table)
        record.addQuery('name', key)
        if (table === TEMPLATE_TABLE) record.orderByDesc('active')
        record.orderByDesc('sys_updated_on')
        record.setLimit(1)
        record.query()
        return record.next() ? record : null
    }

    private _versionRecord(template: unknown, number: number, caller: string): Gr | null {
        const record = this._requireTemplate(template, caller)
        const version = this._record(VERSION_TABLE)
        version.addQuery('template', record.getUniqueValue())
        version.addQuery('version', String(parseInt(String(number), 10)))
        version.setLimit(1)
        version.query()
        return version.next() ? version : null
    }

    private _templateObject(record: Gr): TemplateObject {
        return {
            sys_id: record.getUniqueValue(),
            name: String(record.getValue('name') || ''),
            kind: String(record.getValue('kind') || 'document'),
            table: String(record.getValue('table') || ''),
            description: String(record.getValue('description') || ''),
            active: String(record.getValue('active')) !== '0' && String(record.getValue('active')) !== 'false',
            query: String(record.getValue('query') || ''),
            orderBy: String(record.getValue('order_by') || ''),
            limit: parseInt(record.getValue('record_limit'), 10) || 50,
            version: parseInt(record.getValue('version'), 10) || 0,
            hasDraft: Boolean(record.getValue('draft_body')),
            body: this._parse(record.getValue('body')),
        }
    }

    private _versionObject(record: Gr): VersionObject {
        return {
            sys_id: record.getUniqueValue(),
            version: parseInt(record.getValue('version'), 10) || 0,
            note: String(record.getValue('note') || ''),
            publishedBy: String(record.getValue('sys_created_by') || ''),
            publishedOn: String(record.getValue('sys_created_on') || ''),
            body: this._parse(record.getValue('body')),
        }
    }

    private _writeTemplate(record: Gr, spec: TemplateSpec, kind: string) {
        if (spec.name !== undefined) record.setValue('name', String(spec.name))
        if (spec.kind !== undefined) {
            if (!(TEMPLATE_KINDS as readonly string[]).includes(spec.kind)) {
                throw new Error(
                    'Templater: a template\'s kind is "document", "deck" or "chart", not "' + spec.kind + '".'
                )
            }
            record.setValue('kind', spec.kind)
        }
        if (spec.table !== undefined) record.setValue('table', String(spec.table))
        if (spec.description !== undefined) record.setValue('description', String(spec.description))
        if (spec.active !== undefined) record.setValue('active', Boolean(spec.active))
        if (spec.query !== undefined) record.setValue('query', String(spec.query))
        if (spec.orderBy !== undefined) record.setValue('order_by', String(spec.orderBy))
        if (spec.limit !== undefined) record.setValue('record_limit', this._limit(spec.limit))
        if (spec.body !== undefined)
            record.setValue('body', this._serialize(spec.body, 'Templater: a template body', kind))
    }

    private _url(params: Record<string, string>, options?: { absolute?: boolean }): string {
        const parts: string[] = []
        for (const name of Object.keys(params)) {
            if (params[name]) parts.push(name + '=' + encodeURIComponent(params[name]!))
        }
        let url = PAGE + '?' + parts.join('&')
        if (options && options.absolute) {
            const base = String(gs.getProperty('glide.servlet.uri', ''))
            url = base.replace(/\/?$/, '/') + url
        }
        return url
    }
}
