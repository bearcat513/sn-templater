import '@servicenow/sdk/global'
import { Property } from '@servicenow/sdk/core'

/**
 * Turns on the in-page developer tools: a console, a network log and a state
 * inspector docked to the bottom of the Templater page, and server-side
 * timing on the scripted REST API. Off unless an admin turns it on.
 */
export const debugProperty = Property({
    $id: Now.ID['templater-debug-property'],
    name: 'x_1040823_template.debug',
    type: 'boolean',
    value: false,
    description:
        'Show the Templater developer tools (console, network log, state inspector) to every Templater user, and log server timings for the Templater REST API to the system log. true or false.',
    roles: {
        write: ['admin'],
    },
})
