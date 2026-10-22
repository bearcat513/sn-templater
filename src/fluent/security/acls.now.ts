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
 */
const OWN_PRESENTATION = "answer = current.isNewRecord() || current.getValue('sys_created_by') == gs.getUserName();"

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
    script: OWN_PRESENTATION,
    adminOverrides: true,
    description: 'Templater users can change the presentations they saved.',
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
    script: OWN_PRESENTATION,
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
