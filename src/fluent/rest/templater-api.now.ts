import '@servicenow/sdk/global'
import { RestApi } from '@servicenow/sdk/core'
import { getContext, getSchema, getTables, sendEmail } from '../../server/templater-api'

/**
 * /api/x_1040823_template/templater/...
 *
 * Both routes check for the Templater user role themselves, and the schema
 * route also checks the caller can read the table it is asked about.
 */
RestApi({
    $id: Now.ID['templater-api'],
    name: 'Templater',
    serviceId: 'templater',
    shortDescription: 'Table schema and session context for the Templater UI page.',
    consumes: 'application/json',
    produces: 'application/json',
    routes: [
        {
            $id: Now.ID['templater-api-schema'],
            name: 'schema',
            method: 'GET',
            path: '/schema/{table}',
            shortDescription: "A table's fields (inherited ones included) and the tables that reference it.",
            script: getSchema,
        },
        {
            $id: Now.ID['templater-api-tables'],
            name: 'tables',
            method: 'GET',
            path: '/tables',
            shortDescription: 'Tables whose name or label contains ?q=, that the caller can read.',
            script: getTables,
        },
        {
            $id: Now.ID['templater-api-me'],
            name: 'me',
            method: 'GET',
            path: '/me',
            shortDescription: "The caller's name, email and today's date in their format.",
            script: getContext,
        },
        {
            $id: Now.ID['templater-api-email'],
            name: 'email',
            method: 'POST',
            path: '/email',
            shortDescription: 'Emails a link to a PDF attached to a record the caller can read.',
            script: sendEmail,
        },
    ],
})
