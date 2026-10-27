import '@servicenow/sdk/global'
import { Acl } from '@servicenow/sdk/core'
import { templaterEditor, templaterUser } from './roles.now'

/*
 * Templates are shared: anyone who uses Templater can read every template,
 * and only editors can change them. What a template can *show* is not decided
 * here — records are always read with the viewer's own session, so a template
 * cannot reach past what its reader could already open.
 */

Acl({
    $id: Now.ID['template-read'],
    type: 'record',
    table: 'x_1040823_template_template',
    operation: 'read',
    roles: [templaterUser],
    adminOverrides: true,
    description: 'Templater users can read templates.',
})

Acl({
    $id: Now.ID['template-create'],
    type: 'record',
    table: 'x_1040823_template_template',
    operation: 'create',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can create templates.',
})

Acl({
    $id: Now.ID['template-write'],
    type: 'record',
    table: 'x_1040823_template_template',
    operation: 'write',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can change templates.',
})

Acl({
    $id: Now.ID['template-delete'],
    type: 'record',
    table: 'x_1040823_template_template',
    operation: 'delete',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can delete templates.',
})

/*
 * Presentations belong to whoever made them. Every Templater user can open
 * and present any of them, and save their own; only the author — or an
 * editor, who looks after the decks — can change or delete one. Like a
 * template, a presentation shows its viewer only the records they can read.
 */

/**
 * Allow ACLs are alternatives: either one lets a person change a presentation.
 * A record being created has no author yet, and its creator is about to be it.
 * Its author can share it with people and groups (`editors`,
 * `editor_groups`), who can then change it too.
 */
const OWN_PRESENTATION = `(function () {
    if (current.isNewRecord() || current.getValue('sys_created_by') == gs.getUserName()) return true;
    var me = gs.getUserID();
    var people = String(current.getValue('editors') || '');
    if (people && people.split(',').indexOf(me) !== -1) return true;
    var groups = String(current.getValue('editor_groups') || '');
    if (!groups) return false;
    var member = new GlideRecord('sys_user_grmember');
    member.addQuery('user', me);
    member.addQuery('group', 'IN', groups);
    member.setLimit(1);
    member.query();
    return member.hasNext();
})()`

/** Only the author or an editor decides who else may change a presentation. */
const AUTHOR_ONLY = "answer = current.isNewRecord() || current.getValue('sys_created_by') == gs.getUserName();"

Acl({
    $id: Now.ID['presentation-read'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    operation: 'read',
    roles: [templaterUser],
    adminOverrides: true,
    description: 'Templater users can open and present saved presentations.',
})

Acl({
    $id: Now.ID['presentation-create'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    operation: 'create',
    roles: [templaterUser],
    adminOverrides: true,
    description: 'Templater users can save presentations.',
})

Acl({
    $id: Now.ID['presentation-write-own'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    operation: 'write',
    roles: [templaterUser],
    script: `answer = ${OWN_PRESENTATION};`,
    adminOverrides: true,
    description: 'Templater users can change the presentations they saved, or that were shared with them.',
})

Acl({
    $id: Now.ID['presentation-write'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    operation: 'write',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can change any presentation.',
})

Acl({
    $id: Now.ID['presentation-delete-own'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    operation: 'delete',
    roles: [templaterUser],
    script: AUTHOR_ONLY,
    adminOverrides: true,
    description: 'Templater users can delete the presentations they saved.',
})

Acl({
    $id: Now.ID['presentation-delete'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    operation: 'delete',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can delete any presentation.',
})

/*
 * Template versions are a template's published history. Editors read them to
 * compare and restore; nobody writes them but the business rule that keeps
 * them, and they go when their template goes.
 */

Acl({
    $id: Now.ID['template-version-read'],
    type: 'record',
    table: 'x_1040823_template_version',
    operation: 'read',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can read the versions of templates.',
})

/* Who a presentation is shared with is its author's call, or an editor's. */

Acl({
    $id: Now.ID['presentation-editors-write-own'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    field: 'editors',
    operation: 'write',
    roles: [templaterUser],
    script: AUTHOR_ONLY,
    adminOverrides: true,
    description: 'Only the author of a presentation can share it with people.',
})

Acl({
    $id: Now.ID['presentation-editors-write'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    field: 'editors',
    operation: 'write',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can share any presentation with people.',
})

Acl({
    $id: Now.ID['presentation-editor_groups-write-own'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    field: 'editor_groups',
    operation: 'write',
    roles: [templaterUser],
    script: AUTHOR_ONLY,
    adminOverrides: true,
    description: 'Only the author of a presentation can share it with groups.',
})

Acl({
    $id: Now.ID['presentation-editor_groups-write'],
    type: 'record',
    table: 'x_1040823_template_presentation',
    field: 'editor_groups',
    operation: 'write',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can share any presentation with groups.',
})

/*
 * A presentation's versions are its published history: anyone who can open
 * the presentation can see what it was. Only the business rule writes them.
 */

Acl({
    $id: Now.ID['presentation-version-read'],
    type: 'record',
    table: 'x_1040823_template_pres_version',
    operation: 'read',
    roles: [templaterUser],
    adminOverrides: true,
    description: 'Templater users can read the versions of presentations.',
})

/*
 * Comments on slides: everyone who can open a presentation can read and add
 * them; a comment is changed or removed by whoever wrote it, by the
 * presentation's author, or by an editor.
 */

const OWN_COMMENT =
    "answer = current.isNewRecord() || current.getValue('sys_created_by') == gs.getUserName() || current.presentation.sys_created_by == gs.getUserName();"

Acl({
    $id: Now.ID['comment-read'],
    type: 'record',
    table: 'x_1040823_template_comment',
    operation: 'read',
    roles: [templaterUser],
    adminOverrides: true,
    description: 'Templater users can read comments on slides.',
})

Acl({
    $id: Now.ID['comment-create'],
    type: 'record',
    table: 'x_1040823_template_comment',
    operation: 'create',
    roles: [templaterUser],
    adminOverrides: true,
    description: 'Templater users can comment on slides.',
})

Acl({
    $id: Now.ID['comment-write-own'],
    type: 'record',
    table: 'x_1040823_template_comment',
    operation: 'write',
    roles: [templaterUser],
    script: OWN_COMMENT,
    adminOverrides: true,
    description: 'Templater users can change or resolve their own comments, and those on their presentations.',
})

Acl({
    $id: Now.ID['comment-write'],
    type: 'record',
    table: 'x_1040823_template_comment',
    operation: 'write',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can change or resolve any comment.',
})

Acl({
    $id: Now.ID['comment-delete-own'],
    type: 'record',
    table: 'x_1040823_template_comment',
    operation: 'delete',
    roles: [templaterUser],
    script: OWN_COMMENT,
    adminOverrides: true,
    description: 'Templater users can delete their own comments, and those on their presentations.',
})

Acl({
    $id: Now.ID['comment-delete'],
    type: 'record',
    table: 'x_1040823_template_comment',
    operation: 'delete',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can delete any comment.',
})

/* Live sessions: anyone who can present starts one; only its presenter moves it; everyone follows. */

Acl({
    $id: Now.ID['live-read'],
    type: 'record',
    table: 'x_1040823_template_live',
    operation: 'read',
    roles: [templaterUser],
    adminOverrides: true,
    description: 'Templater users can follow someone presenting.',
})

Acl({
    $id: Now.ID['live-create'],
    type: 'record',
    table: 'x_1040823_template_live',
    operation: 'create',
    roles: [templaterUser],
    script: "answer = current.getValue('presenter') == gs.getUserID();",
    adminOverrides: true,
    description: 'Templater users can present with followers, as themselves.',
})

Acl({
    $id: Now.ID['live-write'],
    type: 'record',
    table: 'x_1040823_template_live',
    operation: 'write',
    roles: [templaterUser],
    script: "answer = current.getValue('presenter') == gs.getUserID();",
    adminOverrides: true,
    description: 'Only its presenter moves a live session on.',
})

/*
 * Deliveries hold batch PDFs that were emailed. Their sender and the people
 * they were sent to can read them (and so open the file); editors can read
 * every one, as the audit trail of what was sent. Nobody changes one after
 * it is sent but the email route, which records who it went to.
 */

const DELIVERY_READER = `answer = (function () {
    if (current.getValue('sys_created_by') == gs.getUserName()) return true;
    var email = String(gs.getUser().getEmail() || '').toLowerCase();
    if (!email) return false;
    var to = String(current.getValue('recipients') || '').toLowerCase().split(',');
    for (var i = 0; i < to.length; i++) if (to[i].trim() === email) return true;
    return false;
})();`

Acl({
    $id: Now.ID['delivery-read-own'],
    type: 'record',
    table: 'x_1040823_template_delivery',
    operation: 'read',
    script: DELIVERY_READER,
    adminOverrides: true,
    description: 'The sender of a Templater delivery and the people it was sent to can read it and open its file.',
})

Acl({
    $id: Now.ID['delivery-read'],
    type: 'record',
    table: 'x_1040823_template_delivery',
    operation: 'read',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can read every delivery.',
})

Acl({
    $id: Now.ID['delivery-create'],
    type: 'record',
    table: 'x_1040823_template_delivery',
    operation: 'create',
    roles: [templaterUser],
    adminOverrides: true,
    description: 'Templater users can make a delivery to email a batch PDF.',
})

Acl({
    $id: Now.ID['delivery-write-own'],
    type: 'record',
    table: 'x_1040823_template_delivery',
    operation: 'write',
    roles: [templaterUser],
    script: "answer = current.getValue('sys_created_by') == gs.getUserName() && current.getValue('sent') == '0';",
    adminOverrides: true,
    description: 'The sender can finish a delivery until it is sent.',
})

/* Usage: everyone's use is counted; template owners — editors — read the counts. */

Acl({
    $id: Now.ID['usage-create'],
    type: 'record',
    table: 'x_1040823_template_usage',
    operation: 'create',
    roles: [templaterUser],
    adminOverrides: true,
    description: 'Templater users record their use of templates.',
})

Acl({
    $id: Now.ID['usage-read'],
    type: 'record',
    table: 'x_1040823_template_usage',
    operation: 'read',
    roles: [templaterEditor],
    adminOverrides: true,
    description: 'Templater editors can read how templates are used.',
})
