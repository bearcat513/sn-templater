/**
 * Templater: the server-side API for scripts. Business rules, flows,
 * scheduled jobs and fix scripts use it to find, create and copy templates,
 * stage and publish changes to them, get links that export records to PDF,
 * and build saved presentations, custom slides included.
 *
 *   var templater = new x_1040823_template.Templater();
 *   var url = templater.exportUrl('Incident report', current, { absolute: true });
 *
 * This is a thin bridge. The code is the typed module in
 * src/server/templater/, which this loads and hands every call to; see the
 * README's "Scripting" section for what each method does.
 *
 * MODULE names the module with the app's version in it. `npm version`
 * keeps it in step (scripts/sync-version.mjs), and a test fails the build
 * when it is not.
 */
var Templater = Class.create();

Templater.MODULE = 'x_1040823_template/templater/0.1.0/src/server/templater/index.ts';

Templater.prototype = {
    /**
     * @param {object} [options]
     * @param {boolean} [options.secure] Read and write through ACLs (GlideRecordSecure) as the current user.
     */
    initialize: function (options) {
        var module = require(Templater.MODULE);
        this._api = new module.Templater(options);
    },

    /* templates */
    getTemplate: function (template) { return this._api.getTemplate(template); },
    getDraft: function (template) { return this._api.getDraft(template); },
    findTemplates: function (filter) { return this._api.findTemplates(filter); },
    createTemplate: function (spec) { return this._api.createTemplate(spec); },
    copyTemplate: function (template, changes) { return this._api.copyTemplate(template, changes); },
    updateTemplate: function (template, changes) { return this._api.updateTemplate(template, changes); },

    /* drafts and versions */
    saveDraft: function (template, body) { return this._api.saveDraft(template, body); },
    publish: function (template, note) { return this._api.publish(template, note); },
    discardDraft: function (template) { return this._api.discardDraft(template); },
    versions: function (template) { return this._api.versions(template); },
    getVersion: function (template, version) { return this._api.getVersion(template, version); },
    restoreVersion: function (template, version, options) { return this._api.restoreVersion(template, version, options); },
    checkBody: function (kind, body) { return this._api.checkBody(kind, body); },

    /* documents */
    exportUrl: function (template, records, options) { return this._api.exportUrl(template, records, options); },

    /* decks */
    deck: function (template) { return this._api.deck(template); },
    openDeck: function (presentation, options) { return this._api.openDeck(presentation, options); },
    publishDeck: function (presentation, note) { return this._api.publishDeck(presentation, note); },
    presentUrl: function (presentation, options) { return this._api.presentUrl(presentation, options); },
    buildUrl: function (presentation, options) { return this._api.buildUrl(presentation, options); },

    type: 'Templater',
};
