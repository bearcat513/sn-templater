import '@servicenow/sdk/global'
import { ApplicationMenu, Record } from '@servicenow/sdk/core'
import { templaterUser } from '../security/roles.now'

export const templaterMenu = ApplicationMenu({
    $id: Now.ID['templater-menu'],
    title: 'Templater',
    hint: 'PDF exports and slide decks from any record',
    description: 'Design templates, export records and their related lists to PDF, and present records as slides.',
    roles: [templaterUser],
    active: true,
})

/*
 * A module's `roles` is a plain string field on sys_app_module, so it takes
 * role names: a Role object here is written as "[object Object]", a role
 * nobody has, and the menu shows up empty (which the navigator then hides).
 */

Record({
    $id: Now.ID['templater-module-templates'],
    table: 'sys_app_module',
    data: {
        title: 'Templates',
        application: templaterMenu,
        link_type: 'DIRECT',
        query: 'x_1040823_template_templater.do?view=templates',
        hint: 'Browse and design templates',
        roles: ['x_1040823_template.user'],
        active: true,
        order: 100,
    },
})

Record({
    $id: Now.ID['templater-module-export'],
    table: 'sys_app_module',
    data: {
        title: 'Export to PDF',
        application: templaterMenu,
        link_type: 'DIRECT',
        query: 'x_1040823_template_templater.do?view=export',
        hint: 'Export records and their related lists to PDF',
        roles: ['x_1040823_template.user'],
        active: true,
        order: 200,
    },
})

Record({
    $id: Now.ID['templater-module-present'],
    table: 'sys_app_module',
    data: {
        title: 'Present a deck',
        application: templaterMenu,
        link_type: 'DIRECT',
        query: 'x_1040823_template_templater.do?view=present',
        hint: 'Present records as slides, and open saved presentations',
        roles: ['x_1040823_template.user'],
        active: true,
        order: 300,
    },
})

Record({
    $id: Now.ID['templater-module-table'],
    table: 'sys_app_module',
    data: {
        title: 'All template records',
        application: templaterMenu,
        link_type: 'LIST',
        name: 'x_1040823_template_template',
        hint: 'The template table, for administration',
        roles: ['x_1040823_template.editor'],
        active: true,
        order: 400,
    },
})

Record({
    $id: Now.ID['templater-module-presentation-table'],
    table: 'sys_app_module',
    data: {
        title: 'All presentation records',
        application: templaterMenu,
        link_type: 'LIST',
        name: 'x_1040823_template_presentation',
        hint: 'Saved presentations, for administration',
        roles: ['x_1040823_template.editor'],
        active: true,
        order: 500,
    },
})
