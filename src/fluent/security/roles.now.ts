import '@servicenow/sdk/global'
import { Role } from '@servicenow/sdk/core'

/** Can open Templater, read templates, and export or present the records they can already read. */
export const templaterUser = Role({
    name: 'x_1040823_template.user',
    description: 'Use Templater: export records to PDF and present them as slide decks using shared templates.',
})

/** Can also create, change and delete templates. */
export const templaterEditor = Role({
    name: 'x_1040823_template.editor',
    description: 'Design Templater templates. Contains x_1040823_template.user.',
    containsRoles: [templaterUser],
})
