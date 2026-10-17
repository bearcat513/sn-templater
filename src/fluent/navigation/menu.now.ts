import '@servicenow/sdk/global'
import { ApplicationMenu, Record } from '@servicenow/sdk/core'
import { templaterEditor, templaterUser } from '../security/roles.now'

export const templaterMenu = ApplicationMenu({
    $id: Now.ID['templater-menu'],
    title: 'Templater',
    hint: 'PDF exports and slide decks from any record',
    description: 'Design templates, export records and their related lists to PDF, and present records as slides.',
    roles: [templaterUser],
    active: true,
})

Record({
    $id: Now.ID['templater-module-templates'],
    table: 'sys_app_module',
    data: {
        title: 'Templates',
        application: templaterMenu,
        link_type: 'DIRECT',
        query: 'x_1040823_template_templater.do?view=templates',
        hint: 'Browse and design templates',
        roles: [templaterUser],
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
        roles: [templaterUser],
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
        hint: 'Present records as slides',
        roles: [templaterUser],
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
        roles: [templaterEditor],
        active: true,
        order: 400,
    },
})
