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
