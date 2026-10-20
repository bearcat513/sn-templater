/**
 * Templater: the server-side API for scripts. Business rules, flows,
 * scheduled jobs and fix scripts can use it to find, create and copy
 * templates, to get links that export records to PDF, and to build saved
 * presentations, custom slides included, without opening the builder.
 *
 *   var templater = new x_1040823_template.Templater();
 *
 *   // A link that opens the Incident report for this record and makes the PDF
 *   var url = templater.exportUrl('Incident report', current, { absolute: true });
 *
 *   // A weekly deck with an agenda slide in front of the records
 *   var deck = templater.deck('Major incident review')
 *       .title('P1 review, week of ' + new GlideDate().getDisplayValue())
 *       .records('active=true^priority=1')
 *       .orderBy('-opened_at')
 *       .limit(15)
 *       .addSlide('titleContent', { title: 'Agenda', body: ['Open P1s', 'Actions', 'Next steps'] }, { position: 'afterCover' })
 *       .addSlide('blank', function (slide) {
 *           slide.text('Questions?', { x: 0, y: 220, w: slide.width, h: 100, size: 48, align: 'center' });
 *       });
 *   var sysId = deck.save('Weekly P1 review');
 *
 *   // A chart template, counted when the presentation opens, on a slide of its own
 *   deck.addSlide('titleOnly', function (slide) {
 *       slide.chart('Open P1s by assignment group', { y: slide.top + 90, h: slide.innerHeight - 90 });
 *   }, { name: 'Where they sit' });
 *   gs.info(deck.presentUrl({ absolute: true }));
 *
 * PDFs are still drawn in the browser. A link from here opens Templater,
 * which renders the file with the viewer's own session, so a template only
 * ever shows what its reader is allowed to see.
 *
 * Records are read and written with GlideRecord, as server scripts normally
 * are. Use `new Templater({ secure: true })` to go through ACLs as the
 * current user instead.
 */
var Templater = Class.create();

Templater.TEMPLATE_TABLE = 'x_1040823_template_template';
Templater.PRESENTATION_TABLE = 'x_1040823_template_presentation';
Templater.PAGE = 'x_1040823_template_templater.do';

/* These limits match the browser's (src/client/engine/presentation.ts and loader.ts). */
Templater.MAX_RECORDS = 500;
Templater.MAX_CUSTOM_SLIDES = 200;
Templater.MAX_ELEMENTS = 120;
Templater.MAX_BODY_LENGTH = 3000000;
Templater.MAX_NOTES_LENGTH = 5000;

/* Slide sizes and page defaults from src/client/engine/pdf.ts and template.ts, in points. */
Templater.PAGE_DIMENSIONS = {
    A4: { width: 595.28, height: 841.89 },
    Letter: { width: 612, height: 792 },
    Legal: { width: 612, height: 1008 },
    Slide16x9: { width: 960, height: 540 },
    Slide4x3: { width: 720, height: 540 },
};
Templater.DEFAULT_PAGE = {
    size: 'A4',
    margins: { top: 56, right: 48, bottom: 56, left: 48 },
    family: 'helvetica',
    fontSize: 10,
    textColor: '#18181b',
    mutedColor: '#71717a',
    accentColor: '#18181b',
};

Templater.LAYOUTS = ['blank', 'title', 'titleContent', 'section', 'twoContent', 'titleOnly'];
Templater.SHAPES = [
    'rect', 'roundRect', 'ellipse', 'triangle', 'rightTriangle', 'diamond', 'pentagon',
    'hexagon', 'parallelogram', 'trapezoid', 'chevron', 'arrow', 'star',
];
Templater.TRANSITIONS = ['none', 'fade', 'push', 'wipe', 'zoom'];
Templater.BUILD_EFFECTS = ['appear', 'fade', 'fly', 'zoom'];
Templater.FONT_FAMILIES = ['helvetica', 'times', 'courier'];

Templater.SYS_ID = /^[0-9a-f]{32}$/;
Templater.HEX_COLOR = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

Templater.prototype = {
    /**
     * @param {object} [options]
     * @param {boolean} [options.secure] Read and write through ACLs (GlideRecordSecure) as the current user.
     */
    initialize: function (options) {
        this.secure = Boolean(options && options.secure);
    },

    /* ------------------------------- templates ------------------------------- */

    /**
     * A template as a plain object, found by sys_id, by name, or from its
     * GlideRecord. By name, an active template wins over an inactive one.
     * Returns null when there is none.
     *
     * { sys_id, name, kind, table, description, active, query, orderBy, limit, body }
     * where `body` is the parsed JSON (null when it is empty or unreadable).
     */
    getTemplate: function (template) {
        var record = this._templateRecord(template);
        return record ? this._templateObject(record) : null;
    },

    /**
     * Templates, as plain objects without their bodies.
     *
     * @param {object} [filter]
     * @param {string} [filter.table] Templates that fit this table: made for it or for a table it extends.
     * @param {string} [filter.kind] 'document', 'deck' or 'chart'.
     * @param {boolean} [filter.activeOnly] Defaults to true.
     */
    findTemplates: function (filter) {
        filter = filter || {};
        var record = this._record(Templater.TEMPLATE_TABLE);
        if (filter.activeOnly !== false) record.addActiveQuery();
        if (filter.kind) record.addQuery('kind', String(filter.kind));
        if (filter.table) record.addQuery('table', 'IN', this._ancestors(String(filter.table)).join(','));
        record.orderBy('name');
        record.query();

        var found = [];
        while (record.next()) {
            var template = this._templateObject(record);
            delete template.body;
            found.push(template);
        }
        return found;
    },

    /**
     * Creates a template and returns its sys_id.
     *
     * @param {object} spec
     * @param {string} spec.name
     * @param {string} spec.table
     * @param {string} [spec.kind] 'document' (the default), 'deck' or 'chart'.
     * @param {object|string} [spec.body] The template JSON. If you leave it out, the
     *     designer starts the template off from the table's fields the first time it is opened.
     * @param {string} [spec.description]
     * @param {string} [spec.query] Default records for a deck or batch export (encoded query).
     * @param {string} [spec.orderBy] e.g. '-sys_updated_on'
     * @param {number} [spec.limit]
     * @param {boolean} [spec.active]
     */
    createTemplate: function (spec) {
        if (!spec || !spec.name) throw new Error('Templater.createTemplate: a template needs a name.');
        if (!spec.table || !gs.tableExists(String(spec.table))) {
            throw new Error('Templater.createTemplate: there is no table called "' + spec.table + '".');
        }
        var record = this._record(Templater.TEMPLATE_TABLE);
        record.initialize();
        this._writeTemplate(record, spec);
        if (!spec.kind) record.setValue('kind', 'document');
        return this._insert(record, 'Templater.createTemplate');
    },

    /**
     * Copies a template, the way "Start from" does in the New template dialog,
     * and returns the copy's sys_id. `changes` takes the same fields as
     * createTemplate; the name defaults to "<name> (copy)".
     */
    copyTemplate: function (template, changes) {
        var source = this._requireTemplate(template, 'Templater.copyTemplate');
        changes = changes || {};
        var record = this._record(Templater.TEMPLATE_TABLE);
        record.initialize();
        var fields = ['name', 'kind', 'table', 'description', 'active', 'query', 'order_by', 'record_limit', 'body'];
        for (var i = 0; i < fields.length; i++) record.setValue(fields[i], source.getValue(fields[i]));
        record.setValue('name', String(source.getValue('name')) + ' (copy)');
        this._writeTemplate(record, changes);
        return this._insert(record, 'Templater.copyTemplate');
    },

    /** Changes a template. `changes` takes the same fields as createTemplate. Returns its sys_id. */
    updateTemplate: function (template, changes) {
        var record = this._requireTemplate(template, 'Templater.updateTemplate');
        this._writeTemplate(record, changes || {});
        if (!record.update()) throw new Error('Templater.updateTemplate: the template could not be saved.');
        return record.getUniqueValue();
    },

    /* ------------------------------- documents ------------------------------- */

    /**
     * A link that opens Templater on a document template and makes the PDF.
     * Put it in an email, a work note or a URL action.
     *
     * @param {*} template A sys_id, a name, or a GlideRecord of the template.
     * @param {*} records One record: a GlideRecord or a sys_id. Several: an
     *     array of sys_ids or an encoded query string. With an encoded query, it is
     *     run on the template's table.
     * @param {object} [options]
     * @param {boolean} [options.absolute] Start with the instance's address, for emails.
     */
    exportUrl: function (template, records, options) {
        var source = this._requireTemplate(template, 'Templater.exportUrl');
        var params = { view: 'export', template: source.getUniqueValue() };
        var table = String(source.getValue('table'));

        if (records && typeof records.getUniqueValue === 'function') {
            params.table = String(records.getTableName());
            params.sys_id = String(records.getUniqueValue());
        } else if (Array.isArray(records)) {
            params.table = table;
            params.query = 'sys_idIN' + this._ids(records).join(',');
        } else if (records && Templater.SYS_ID.test(String(records))) {
            params.table = table;
            params.sys_id = String(records);
        } else if (records) {
            params.table = table;
            params.query = String(records);
        }
        return this._url(params, options);
    },

    /* --------------------------------- decks --------------------------------- */

    /**
     * Starts a new presentation on a deck template. Chain the builder's
     * methods, then call save(). The template's default records, order and
     * limit apply until you change them.
     */
    deck: function (template) {
        var source = this._requireTemplate(template, 'Templater.deck');
        if (String(source.getValue('kind')) !== 'deck') {
            throw new Error('Templater.deck: "' + source.getValue('name') + '" is a ' + String(source.getValue('kind') || 'document') + ' template, not a deck.');
        }
        return new Templater.Deck(this, source, null);
    },

    /**
     * Opens a saved presentation (sys_id, name or GlideRecord) to add slides,
     * notes or hidden slides, or to change its records. Call save() to write it back.
     */
    openDeck: function (presentation) {
        var record = this._presentationRecord(presentation);
        if (!record) throw new Error('Templater.openDeck: there is no presentation "' + presentation + '".');
        var template = this._templateRecord(String(record.getValue('template') || ''));
        if (!template) {
            throw new Error('Templater.openDeck: "' + record.getValue('name') + '" has no deck. Its template was deleted.');
        }
        return new Templater.Deck(this, template, record);
    },

    /** A link that presents a saved presentation. */
    presentUrl: function (presentation, options) {
        var record = this._presentationRecord(presentation);
        if (!record) throw new Error('Templater.presentUrl: there is no presentation "' + presentation + '".');
        return this._url({ view: 'present', presentation: record.getUniqueValue() }, options);
    },

    /** A link that opens a saved presentation in the slide builder. */
    buildUrl: function (presentation, options) {
        var record = this._presentationRecord(presentation);
        if (!record) throw new Error('Templater.buildUrl: there is no presentation "' + presentation + '".');
        return this._url({ view: 'build', id: record.getUniqueValue() }, options);
    },

    /* -------------------------------- internals ------------------------------ */

    _record: function (table) {
        return this.secure ? new GlideRecordSecure(table) : new GlideRecord(table);
    },

    _insert: function (record, caller) {
        var sysId = record.insert();
        if (!sysId) throw new Error(caller + ': the record could not be saved.');
        return String(sysId);
    },

    _ancestors: function (table) {
        var tables = new GlideTableHierarchy(table).getTables();
        var names = [];
        for (var i = 0; i < tables.length; i++) names.push(String(tables[i]));
        return names;
    },

    _ids: function (list) {
        var ids = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            var id = item && typeof item.getUniqueValue === 'function' ? item.getUniqueValue() : item;
            if (Templater.SYS_ID.test(String(id))) ids.push(String(id));
        }
        return ids;
    },

    /** By GlideRecord, sys_id or name. By name, active first. */
    _find: function (table, value) {
        if (!value) return null;
        if (typeof value.getUniqueValue === 'function') {
            if (String(value.getTableName()) !== table) return null;
            return this._find(table, String(value.getUniqueValue()));
        }
        var key = String(value);
        var record = this._record(table);
        if (Templater.SYS_ID.test(key) && record.get(key)) return record;

        record = this._record(table);
        record.addQuery('name', key);
        if (table === Templater.TEMPLATE_TABLE) record.orderByDesc('active');
        record.orderByDesc('sys_updated_on');
        record.setLimit(1);
        record.query();
        return record.next() ? record : null;
    },

    _templateRecord: function (template) {
        return this._find(Templater.TEMPLATE_TABLE, template);
    },

    _presentationRecord: function (presentation) {
        return this._find(Templater.PRESENTATION_TABLE, presentation);
    },

    _requireTemplate: function (template, caller) {
        var record = this._templateRecord(template);
        if (!record) throw new Error(caller + ': there is no template "' + template + '".');
        return record;
    },

    _templateObject: function (record) {
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
            body: this._parse(record.getValue('body')),
        };
    },

    _writeTemplate: function (record, spec) {
        if (spec.name !== undefined) record.setValue('name', String(spec.name));
        if (spec.kind !== undefined) {
            if (spec.kind !== 'document' && spec.kind !== 'deck' && spec.kind !== 'chart') {
                throw new Error('Templater: a template\'s kind is "document", "deck" or "chart", not "' + spec.kind + '".');
            }
            record.setValue('kind', spec.kind);
        }
        if (spec.table !== undefined) record.setValue('table', String(spec.table));
        if (spec.description !== undefined) record.setValue('description', String(spec.description));
        if (spec.active !== undefined) record.setValue('active', Boolean(spec.active));
        if (spec.query !== undefined) record.setValue('query', String(spec.query));
        if (spec.orderBy !== undefined) record.setValue('order_by', String(spec.orderBy));
        if (spec.limit !== undefined) record.setValue('record_limit', this._limit(spec.limit));
        if (spec.body !== undefined) record.setValue('body', this._serialize(spec.body, 'Templater: a template body'));
    },

    _parse: function (text) {
        if (!text) return null;
        try {
            return JSON.parse(String(text));
        } catch (e) {
            return null;
        }
    },

    _serialize: function (body, what) {
        var text = typeof body === 'string' ? body : JSON.stringify(body);
        if (typeof body === 'string' && body.trim() && this._parse(body) === null) throw new Error(what + ' must be valid JSON.');
        if (text.length > Templater.MAX_BODY_LENGTH) {
            throw new Error(what + ' must be ' + Templater.MAX_BODY_LENGTH + ' characters or fewer.');
        }
        return text;
    },

    _limit: function (value) {
        var limit = parseInt(value, 10);
        if (!(limit > 0)) throw new Error('Templater: a record limit must be a positive number.');
        return Math.min(limit, Templater.MAX_RECORDS);
    },

    _url: function (params, options) {
        var parts = [];
        for (var name in params) {
            if (params.hasOwnProperty(name) && params[name]) parts.push(name + '=' + encodeURIComponent(params[name]));
        }
        var url = Templater.PAGE + '?' + parts.join('&');
        if (options && options.absolute) {
            var base = String(gs.getProperty('glide.servlet.uri', ''));
            url = base.replace(/\/?$/, '/') + url;
        }
        return url;
    },

    type: 'Templater',
};

/* =================================================================== decks */

/**
 * A presentation being built or changed. Every setter returns the deck, so
 * calls chain; nothing is written until save().
 *
 * Where a custom slide goes (`position` on addSlide):
 *   'end' (the default), 'start', 'afterCover',
 *   { after: <record sys_id or GlideRecord> }, { before: <record sys_id or GlideRecord> }
 *
 * The running order is stored as slide keys, so record slides are drawn
 * fresh every time the presentation opens. A record that starts matching
 * later takes its place among the other records. Custom slides stay where
 * you put them.
 */
Templater.Deck = function (templater, template, presentation) {
    this._templater = templater;
    this._template = template;
    this._presentation = presentation;

    var body = this._templater._parse(template.getValue('body')) || {};
    this._templateBody = body;
    this.page = Templater.resolvePage(body.page);
    var dimensions = Templater.PAGE_DIMENSIONS[this.page.size] || Templater.PAGE_DIMENSIONS.Slide16x9;
    if (this.page.landscape && !/^Slide/.test(this.page.size)) {
        dimensions = { width: dimensions.height, height: dimensions.width };
    }
    /** The slide's size in points. Every x, y, w and h on a slide uses the same points. */
    this.width = dimensions.width;
    this.height = dimensions.height;

    var source = presentation || template;
    this._meta = {
        name: presentation ? String(presentation.getValue('name') || '') : '',
        title: presentation ? String(presentation.getValue('title') || '') : String(template.getValue('name') || ''),
        query: String(source.getValue('query') || ''),
        orderBy: String(source.getValue('order_by') || ''),
        limit: parseInt(source.getValue('record_limit'), 10) || 20,
    };

    var saved = presentation ? this._templater._parse(presentation.getValue('body')) : null;
    this._body = {
        version: 1,
        slides: saved && Array.isArray(saved.slides) ? saved.slides : [],
        order: saved && Array.isArray(saved.order) ? saved.order : [],
    };
    if (saved && saved.transition) this._body.transition = saved.transition;
    if (saved && saved.options) this._body.options = saved.options;
    this._placements = [];
    this._hidden = {};
};

Templater.Deck.prototype = {
    /** The title on the title slide: {{deck.title}}. */
    title: function (title) {
        this._meta.title = String(title || '');
        return this;
    },

    /**
     * Which records get a slide: an encoded query on the template's table, a
     * GlideRecord, or an array of sys_ids. A queried GlideRecord gives its
     * encoded query; one record on its own, such as `current`, gives just that record.
     */
    records: function (records) {
        if (records && typeof records.getEncodedQuery === 'function') {
            var table = String(records.getTableName());
            var wanted = String(this._template.getValue('table'));
            if (this._templater._ancestors(table).indexOf(wanted) === -1) {
                throw new Error('Templater: the deck is for ' + wanted + ', and these records are on ' + table + '.');
            }
            var encoded = String(records.getEncodedQuery() || '');
            var sysId = records.isValidRecord() ? String(records.getUniqueValue()) : '';
            // `current` in a business rule has no query: an empty one would match every record.
            if (!encoded && !sysId) throw new Error('Templater: that GlideRecord has neither a query nor a record.');
            this._meta.query = encoded || 'sys_id=' + sysId;
        } else if (Array.isArray(records)) {
            this._meta.query = 'sys_idIN' + this._templater._ids(records).join(',');
        } else {
            this._meta.query = String(records || '');
        }
        return this;
    },

    /** A field to sort by. Start it with a minus sign to sort descending: '-opened_at'. */
    orderBy: function (field) {
        this._meta.orderBy = String(field || '');
        return this;
    },

    /** At most this many records (up to 500). */
    limit: function (limit) {
        this._meta.limit = this._templater._limit(limit);
        return this;
    },

    /** How every slide comes in when presenting: none, fade, push, wipe or zoom. */
    transition: function (transition) {
        if (Templater.TRANSITIONS.indexOf(transition) === -1) {
            throw new Error('Templater: a transition is one of ' + Templater.TRANSITIONS.join(', ') + '.');
        }
        this._body.transition = transition;
        return this;
    },

    /**
     * Speaker notes for a record's slide (a sys_id or GlideRecord), the title
     * slide ('cover'), or any slide key. A custom slide sets its own with slide.notes().
     */
    notes: function (slide, notes) {
        return this._option(this._keyOf(slide), { notes: String(notes || '').slice(0, Templater.MAX_NOTES_LENGTH) });
    },

    /** Leaves a record's slide (or the title slide: 'cover') out of the show and the PDF. */
    hide: function (slide) {
        this._hidden[this._keyOf(slide)] = true;
        return this;
    },

    /**
     * Adds a custom slide.
     *
     * @param {string} layout blank, title, titleContent, section, twoContent or titleOnly.
     * @param {object|function} [content] Text for the layout's boxes:
     *     { title, subtitle, body, left, right, text }. `body`, `left` and `right` take a string or an
     *     array of bullet points. Or pass a function, which is called with the slide (see Templater.Slide)
     *     to place elements yourself.
     * @param {object} [options] { position, name, background, furniture, notes, transition }
     */
    addSlide: function (layout, content, options) {
        if (this._body.slides.length >= Templater.MAX_CUSTOM_SLIDES) {
            throw new Error('Templater: a presentation can have up to ' + Templater.MAX_CUSTOM_SLIDES + ' custom slides.');
        }
        layout = layout || 'blank';
        if (Templater.LAYOUTS.indexOf(layout) === -1) {
            throw new Error('Templater: a layout is one of ' + Templater.LAYOUTS.join(', ') + '.');
        }
        options = options || {};
        var slide = new Templater.Slide(this, layout);
        if (typeof content === 'function') content(slide);
        else if (content) slide.fill(content);
        if (options.name) slide.name(options.name);
        if (options.background) slide.background(options.background);
        if (options.furniture) slide.furniture(true);
        if (options.notes) slide.notes(options.notes);
        if (options.transition) slide.transition(options.transition);

        this._body.slides.push(slide._data);
        if (slide._options) this._option('custom:' + slide._data.id, slide._options);
        this._placements.push({ key: 'custom:' + slide._data.id, position: options.position || 'end' });
        return this;
    },

    /** Writes the presentation and returns its sys_id. A new one needs a name; it defaults to the title. */
    save: function (name) {
        if (name) this._meta.name = String(name);
        if (!this._meta.name) this._meta.name = this._meta.title || String(this._template.getValue('name'));

        this._body.order = this._arrange();
        var text = this._templater._serialize(this._body, 'Templater: a presentation body');

        var record = this._presentation;
        if (!record) {
            record = this._templater._record(Templater.PRESENTATION_TABLE);
            record.initialize();
            record.setValue('template', this._template.getUniqueValue());
        }
        record.setValue('name', this._meta.name.slice(0, 100));
        record.setValue('title', this._meta.title.slice(0, 200));
        record.setValue('query', this._meta.query);
        record.setValue('order_by', this._meta.orderBy);
        record.setValue('record_limit', this._meta.limit);
        record.setValue('body', text);

        if (this._presentation) {
            if (!record.update()) throw new Error('Templater: the presentation could not be saved.');
        } else {
            this._templater._insert(record, 'Templater: the presentation');
            this._presentation = record;
        }
        this._placements = [];
        this._hidden = {};
        return record.getUniqueValue();
    },

    /** The saved presentation's sys_id, or null before save(). */
    sysId: function () {
        return this._presentation ? this._presentation.getUniqueValue() : null;
    },

    /** A link that presents it. Needs save() first. */
    presentUrl: function (options) {
        return this._templater.presentUrl(this._saved('presentUrl'), options);
    },

    /** A link that opens it in the slide builder. Needs save() first. */
    buildUrl: function (options) {
        return this._templater.buildUrl(this._saved('buildUrl'), options);
    },

    /** The sys_ids of the records the deck would show now, in order. */
    recordIds: function () {
        var table = String(this._template.getValue('table'));
        var record = this._templater._record(table);
        if (this._meta.query) record.addEncodedQuery(this._meta.query);
        var order = this._meta.orderBy.trim();
        if (order.charAt(0) === '-') record.orderByDesc(order.slice(1));
        else if (order) record.orderBy(order);
        record.setLimit(Math.max(1, Math.min(this._meta.limit, Templater.MAX_RECORDS)));
        record.query();
        var ids = [];
        while (record.next()) ids.push(record.getUniqueValue());
        return ids;
    },

    /* ------------------------------- internals ------------------------------ */

    _saved: function (caller) {
        if (!this._presentation) throw new Error('Templater: call save() before ' + caller + '().');
        return this._presentation;
    },

    _keyOf: function (slide) {
        if (slide && typeof slide.getUniqueValue === 'function') return 'record:' + slide.getUniqueValue() + ':1';
        var key = String(slide || '');
        if (key === 'cover') return 'cover:1';
        if (Templater.SYS_ID.test(key)) return 'record:' + key + ':1';
        return key;
    },

    _option: function (key, change) {
        var options = this._body.options || (this._body.options = {});
        var current = options[key] || {};
        for (var name in change) if (change.hasOwnProperty(name)) current[name] = change[name];
        if (!current.notes || !String(current.notes).trim()) delete current.notes;
        if (!current.transition) delete current.transition;
        if (current.notes || current.transition) options[key] = current;
        else delete options[key];
        return this;
    },

    /**
     * The running order, as keys: the saved order (or, for a new deck, the
     * title slide and the records as they match now) with each new custom
     * slide put where it was asked for, and hidden slides marked.
     */
    _arrange: function () {
        var order = [];
        var i;
        if (this._body.order.length) {
            for (i = 0; i < this._body.order.length; i++) {
                var entry = this._body.order[i];
                if (entry && entry.key) order.push(entry.hidden ? { key: entry.key, hidden: true } : { key: entry.key });
            }
        } else {
            if (this._templateBody.cover && this._templateBody.cover.length) order.push({ key: 'cover:1' });
            var ids = this.recordIds();
            for (i = 0; i < ids.length; i++) order.push({ key: 'record:' + ids[i] + ':1' });
        }

        var indexOf = function (prefix, last) {
            var found = -1;
            for (var j = 0; j < order.length; j++) {
                if (order[j].key.indexOf(prefix) === 0) {
                    found = j;
                    if (!last) break;
                }
            }
            return found;
        };

        for (i = 0; i < this._placements.length; i++) {
            var placement = this._placements[i];
            var item = { key: placement.key };
            var position = placement.position;
            var at = order.length;

            if (position === 'start') {
                at = 0;
            } else if (position === 'afterCover') {
                at = indexOf('cover:', true) + 1;
            } else if (position && (position.after || position.before)) {
                var anchor = this._keyOf(position.after || position.before).replace(/:\d+$/, ':');
                var found = indexOf(anchor, Boolean(position.after));
                if (found === -1) {
                    gs.warn('[Templater] ' + anchor.slice(0, -1) + ' is not in the deck; its custom slide goes at the end.');
                } else {
                    at = position.after ? found + 1 : found;
                }
            } else if (position !== 'end') {
                throw new Error('Templater: a slide position is "start", "afterCover", "end", { after: id } or { before: id }.');
            }
            order.splice(at, 0, item);
        }

        var placed = {};
        for (i = 0; i < order.length; i++) {
            placed[order[i].key] = true;
            if (this._hidden[order[i].key]) order[i].hidden = true;
        }
        for (var key in this._hidden) {
            if (this._hidden.hasOwnProperty(key) && !placed[key]) gs.warn('[Templater] ' + key + ' is not in the deck, so it cannot be hidden.');
        }
        return order;
    },
};

/* ================================================================== slides */

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
Templater.Slide = function (deck, layout) {
    var page = deck.page;
    this._templater = deck._templater;
    this.page = page;
    this.width = deck.width;
    this.height = deck.height;
    this.left = page.margins.left;
    this.top = page.margins.top;
    this.innerWidth = this.width - page.margins.left - page.margins.right;
    this.innerHeight = this.height - page.margins.top - page.margins.bottom;
    this._data = { id: Templater.newId(), elements: [] };
    this._options = null;
    this._layout(layout);
};

Templater.Slide.prototype = {
    /**
     * A text box: a rectangle with no fill or outline.
     *
     * style: { x, y, w, h, size, color, bold, italic, underline, align, valign,
     *          family, bullets, lineHeight, code, opacity, rotation, link, build }
     * `build` holds the box back until a click: { effect: 'fade', order: 1 }.
     */
    text: function (text, style) {
        return this._add(this._shape('rect', text, style || {}));
    },

    /** A bulleted list. `items` is an array or a string with one item per line. */
    bullets: function (items, style) {
        var options = this._merge({ bullets: true }, style);
        return this._add(this._shape('rect', this._lines(items), options));
    },

    /**
     * A shape, with optional text in it.
     *
     * kind: rect, roundRect, ellipse, triangle, rightTriangle, diamond, pentagon,
     *       hexagon, parallelogram, trapezoid, chevron, arrow or star.
     * style: as text(), plus { fill, stroke, strokeWidth, text }.
     */
    shape: function (kind, style) {
        if (Templater.SHAPES.indexOf(kind) === -1) {
            throw new Error('Templater: a shape is one of ' + Templater.SHAPES.join(', ') + '.');
        }
        style = style || {};
        var element = this._shape(kind, style.text || '', style);
        // With neither a fill nor an outline it would be invisible: give it the deck's accent, and white text on it.
        if (style.fill === undefined && style.stroke === undefined) {
            element.fill = this.page.accentColor;
            if (style.color === undefined) element.color = '#ffffff';
        }
        return this._add(element);
    },

    /**
     * A straight line from (x1, y1) to (x2, y2).
     * style: { x1, y1, x2, y2, stroke, strokeWidth, dashed, arrowStart, arrowEnd, opacity, link, build }
     */
    line: function (style) {
        style = style || {};
        var x1 = this._number(style.x1, this.left);
        var y1 = this._number(style.y1, this.top);
        var x2 = this._number(style.x2, x1 + 200);
        var y2 = this._number(style.y2, y1);
        var element = this._box({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }, style, 0);
        element.type = 'line';
        element.stroke = this._color(style.stroke, this.page.textColor);
        element.strokeWidth = this._number(style.strokeWidth, 2);
        // The box runs top-left to bottom-right; a line that rises the other way is flipped.
        if ((x2 - x1) * (y2 - y1) < 0) element.flip = true;
        // The renderer draws from the left end (the top one, for an upright line): name the arrowheads by that.
        var forward = x1 < x2 || (x1 === x2 && y1 <= y2);
        if (style.arrowEnd) element[forward ? 'arrowEnd' : 'arrowStart'] = true;
        if (style.arrowStart) element[forward ? 'arrowStart' : 'arrowEnd'] = true;
        if (style.dashed) element.dashed = true;
        return this._add(element);
    },

    /**
     * A table. `rows` is an array of rows, each an array of cell text (tokens work).
     * style: { x, y, w, h, header (default true), size, color, family, align,
     *          columns (width shares), headerFill, headerColor, banded, fill, border }
     */
    table: function (rows, style) {
        style = style || {};
        if (!Array.isArray(rows) || !rows.length) throw new Error('Templater: a table needs at least one row.');
        rows = rows.slice(0, 20);
        var width = 1;
        for (var i = 0; i < rows.length; i++) width = Math.max(width, Math.min((rows[i] || []).length, 10));
        var cells = [];
        for (i = 0; i < rows.length; i++) {
            var row = [];
            for (var j = 0; j < width; j++) row.push(String((rows[i] || [])[j] === undefined ? '' : rows[i][j]).slice(0, 1000));
            cells.push(row);
        }
        var element = this._box({ x: this.left, y: this.top, w: this.innerWidth, h: Math.min(this.innerHeight, rows.length * 36) }, style, 1);
        element.type = 'table';
        element.rows = cells;
        element.header = style.header !== false;
        element.size = this._number(style.size, 14);
        element.color = this._color(style.color, this.page.textColor);
        element.align = this._align(style.align);
        element.headerFill = this._color(style.headerFill, this.page.accentColor);
        element.headerColor = this._color(style.headerColor, '#ffffff');
        element.border = this._color(style.border, '#d4d4d8');
        if (style.banded) element.banded = this._color(style.banded);
        if (style.fill) element.fill = this._color(style.fill);
        if (style.family) element.family = this._family(style.family);
        if (Array.isArray(style.columns) && style.columns.length === width) element.columns = style.columns;
        return this._add(element);
    },

    /** A PNG or JPEG data: URL stretched to its box. style: { x, y, w, h, stroke, strokeWidth, opacity, link, build } */
    image: function (source, style) {
        source = String(source || '').trim();
        if (!/^data:image\/(png|jpe?g);base64,/i.test(source)) {
            throw new Error('Templater: a picture must be a PNG or JPEG data: URL.');
        }
        style = style || {};
        var element = this._box({ x: this.left, y: this.top, w: 240, h: 160 }, style, 1);
        element.type = 'image';
        element.source = source;
        if (style.stroke) {
            element.stroke = this._color(style.stroke);
            element.strokeWidth = this._number(style.strokeWidth, 1);
        }
        return this._add(element);
    },

    /**
     * A chart template (sys_id, name or GlideRecord), drawn to fill its box: its
     * own records, grouping and look, counted each time the presentation opens.
     * style: { x, y, w, h, hideTitle, opacity, rotation, link, build } and, to
     * change the template's look on this slide alone: chart (another kind of the
     * same shape, e.g. 'bar' for a column chart), title, color, showValues,
     * size (text, in points), fill and stroke (a card behind the chart), hideNote.
     * The box defaults to the area inside the margins.
     */
    chart: function (template, style) {
        var record = this._templater._requireTemplate(template, 'Templater: slide.chart');
        if (String(record.getValue('kind')) !== 'chart') {
            throw new Error('Templater: slide.chart: "' + record.getValue('name') + '" is not a chart template.');
        }
        style = style || {};
        var element = this._box({ x: this.left, y: this.top, w: this.innerWidth, h: this.innerHeight }, style, 1);
        element.type = 'chart';
        element.template = record.getUniqueValue();
        element.name = String(record.getValue('name') || '').slice(0, 100);
        if (style.hideTitle) element.hideTitle = true;
        if (style.chart) element.chart = String(style.chart);
        if (style.title) element.title = String(style.title).slice(0, 200);
        if (style.color) element.color = this._color(style.color);
        if (typeof style.showValues === 'boolean') element.showValues = style.showValues;
        if (style.size) element.size = Math.min(32, Math.max(6, this._number(style.size, 12)));
        if (style.fill) element.fill = this._color(style.fill);
        if (style.stroke) element.stroke = this._color(style.stroke);
        if (style.hideNote) element.hideNote = true;
        return this._add(element);
    },

    /** What the slide sorter calls it. Without one it is named after its first line of text. */
    name: function (name) {
        this._data.name = String(name || '').slice(0, 80);
        return this;
    },

    /** A background colour for this slide alone. */
    background: function (color) {
        this._data.background = this._color(color);
        return this;
    },

    /** Draw the deck's letterhead, watermark and footer on this slide too. */
    furniture: function (on) {
        if (on === false) delete this._data.furniture;
        else this._data.furniture = true;
        return this;
    },

    notes: function (notes) {
        this._options = this._options || {};
        this._options.notes = String(notes || '').slice(0, Templater.MAX_NOTES_LENGTH);
        return this;
    },

    transition: function (transition) {
        if (Templater.TRANSITIONS.indexOf(transition) === -1) {
            throw new Error('Templater: a transition is one of ' + Templater.TRANSITIONS.join(', ') + '.');
        }
        this._options = this._options || {};
        this._options.transition = transition;
        return this;
    },

    /** The layout's boxes in the order the layout makes them, for changing after fill(). */
    elements: function () {
        return this._data.elements;
    },

    /** Fills the layout's boxes: { title, subtitle, body, left, right, text }. */
    fill: function (content) {
        var slots = this._slots || {};
        for (var name in content) {
            if (!content.hasOwnProperty(name)) continue;
            var element = slots[name];
            if (!element) throw new Error('Templater: this layout has no "' + name + '" box.');
            element.text = this._lines(content[name]);
        }
        return this;
    },

    /* ------------------------------- internals ------------------------------ */

    _add: function (element) {
        if (this._data.elements.length >= Templater.MAX_ELEMENTS) {
            throw new Error('Templater: a slide can have up to ' + Templater.MAX_ELEMENTS + ' elements.');
        }
        this._data.elements.push(element);
        return this;
    },

    _lines: function (value) {
        if (Array.isArray(value)) return value.join('\n').slice(0, 5000);
        return String(value === undefined || value === null ? '' : value).slice(0, 5000);
    },

    _merge: function (base, extra) {
        var merged = {};
        var name;
        for (name in base) if (base.hasOwnProperty(name)) merged[name] = base[name];
        for (name in extra || {}) if (extra.hasOwnProperty(name)) merged[name] = extra[name];
        return merged;
    },

    _number: function (value, fallback) {
        var number = typeof value === 'number' ? value : parseFloat(value);
        return isFinite(number) ? number : fallback;
    },

    _color: function (value, fallback) {
        if (value === undefined || value === null || value === '') return fallback;
        var raw = String(value).trim();
        if (!Templater.HEX_COLOR.test(raw)) throw new Error('Templater: "' + value + '" is not a colour. Use a hex colour such as #1d4ed8.');
        return raw.charAt(0) === '#' ? raw : '#' + raw;
    },

    _align: function (value) {
        return value === 'center' || value === 'right' ? value : 'left';
    },

    _family: function (value) {
        if (Templater.FONT_FAMILIES.indexOf(value) === -1) {
            throw new Error('Templater: a font is one of ' + Templater.FONT_FAMILIES.join(', ') + '.');
        }
        return value;
    },

    /** The box every element has, with the defaults given and the common style applied. */
    _box: function (defaults, style, min) {
        var element = {
            id: Templater.newId(),
            x: this._number(style.x, defaults.x),
            y: this._number(style.y, defaults.y),
            w: Math.max(min, this._number(style.w, defaults.w)),
            h: Math.max(min, this._number(style.h, defaults.h)),
        };
        if (style.opacity !== undefined && style.opacity < 1) element.opacity = Math.max(0.05, this._number(style.opacity, 1));
        if (style.rotation && min > 0) element.rotation = this._number(style.rotation, 0);
        if (style.link) element.link = String(style.link).slice(0, 2000);
        if (style.build) {
            var effect = style.build.effect || 'appear';
            if (Templater.BUILD_EFFECTS.indexOf(effect) === -1) {
                throw new Error('Templater: a build effect is one of ' + Templater.BUILD_EFFECTS.join(', ') + '.');
            }
            element.build = { effect: effect, order: Math.max(1, parseInt(style.build.order, 10) || 1) };
        }
        return element;
    },

    /** A shape with text, in the deck's own type unless the style says otherwise. */
    _shape: function (kind, text, style) {
        var element = this._box({ x: this.left, y: this.top, w: this.innerWidth, h: 60 }, style, 1);
        element.type = 'shape';
        element.shape = kind;
        element.text = this._lines(text);
        element.size = this._number(style.size, this.page.fontSize);
        element.color = this._color(style.color, this.page.textColor);
        element.align = this._align(style.align);
        element.valign = style.valign === 'middle' || style.valign === 'bottom' ? style.valign : 'top';
        if (style.bold) element.bold = true;
        if (style.italic) element.italic = true;
        if (style.underline) element.underline = true;
        if (style.bullets) element.bullets = true;
        if (style.code) element.code = true;
        if (style.family) element.family = this._family(style.family);
        if (style.lineHeight) element.lineHeight = this._number(style.lineHeight, 1.2);
        if (style.placeholder) element.placeholder = String(style.placeholder).slice(0, 80);
        if (style.fill) element.fill = this._color(style.fill);
        if (style.stroke) {
            element.stroke = this._color(style.stroke);
            element.strokeWidth = this._number(style.strokeWidth, 1.5);
        }
        return element;
    },

    /** The same stock layouts as the slide builder (layoutSlide in src/client/engine/presentation.ts). */
    _layout: function (layout) {
        var self = this;
        var page = this.page;
        var left = this.left;
        var top = this.top;
        var innerWidth = this.innerWidth;
        var innerHeight = this.innerHeight;
        var titleHeight = Math.round(innerHeight * 0.2);
        var slots = (this._slots = {});

        var box = function (slot, frame, style) {
            var element = self._shape('rect', '', self._merge(frame, style));
            slots[slot] = element;
            self._add(element);
        };
        var title = function (frame, size, extra) {
            box('title', frame, self._merge({ placeholder: 'Click to add title', size: size, bold: true, color: page.accentColor }, extra));
        };
        var body = function (slot, frame) {
            box(slot, frame, { placeholder: 'Click to add text', size: Math.max(14, page.fontSize + 2), bullets: true });
        };

        switch (layout) {
            case 'title':
                title({ x: left, y: top + innerHeight * 0.28, w: innerWidth, h: innerHeight * 0.26 }, 44, { align: 'center', valign: 'bottom' });
                box('subtitle', { x: left + innerWidth * 0.1, y: top + innerHeight * 0.58, w: innerWidth * 0.8, h: innerHeight * 0.16 }, {
                    placeholder: 'Click to add subtitle', size: 20, color: page.mutedColor, align: 'center',
                });
                break;
            case 'titleContent':
                title({ x: left, y: top, w: innerWidth, h: titleHeight }, 32, { valign: 'middle' });
                body('body', { x: left, y: top + titleHeight + 12, w: innerWidth, h: innerHeight - titleHeight - 12 });
                break;
            case 'section':
                title({ x: left, y: top + innerHeight * 0.3, w: innerWidth, h: innerHeight * 0.24 }, 40, { valign: 'bottom' });
                box('text', { x: left, y: top + innerHeight * 0.56, w: innerWidth, h: innerHeight * 0.14 }, {
                    placeholder: 'Click to add text', size: 18, color: page.mutedColor,
                });
                break;
            case 'twoContent':
                var gap = 24;
                var half = (innerWidth - gap) / 2;
                var y = top + titleHeight + 12;
                var h = innerHeight - titleHeight - 12;
                title({ x: left, y: top, w: innerWidth, h: titleHeight }, 32, { valign: 'middle' });
                body('left', { x: left, y: y, w: half, h: h });
                body('right', { x: left + half + gap, y: y, w: half, h: h });
                break;
            case 'titleOnly':
                title({ x: left, y: top, w: innerWidth, h: titleHeight }, 32, { valign: 'middle' });
                break;
        }
    },
};

/* ================================================================= helpers */

/** A template's page setup with the defaults filled in, as the renderer resolves it. */
Templater.resolvePage = function (page) {
    page = page || {};
    var resolved = {};
    var name;
    for (name in Templater.DEFAULT_PAGE) if (Templater.DEFAULT_PAGE.hasOwnProperty(name)) resolved[name] = Templater.DEFAULT_PAGE[name];
    for (name in page) if (page.hasOwnProperty(name)) resolved[name] = page[name];
    var margins = page.margins || {};
    resolved.margins = {
        top: margins.top !== undefined ? margins.top : Templater.DEFAULT_PAGE.margins.top,
        right: margins.right !== undefined ? margins.right : Templater.DEFAULT_PAGE.margins.right,
        bottom: margins.bottom !== undefined ? margins.bottom : Templater.DEFAULT_PAGE.margins.bottom,
        left: margins.left !== undefined ? margins.left : Templater.DEFAULT_PAGE.margins.left,
    };
    if (!Templater.PAGE_DIMENSIONS[resolved.size]) resolved.size = Templater.DEFAULT_PAGE.size;
    return resolved;
};

/** An id for a slide or an element. A whole GUID: the builder accepts up to 40 characters, and a part of one is not sure to be unique. */
Templater.newId = function () {
    return String(gs.generateGUID());
};
