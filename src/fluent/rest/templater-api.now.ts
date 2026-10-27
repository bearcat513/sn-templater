import '@servicenow/sdk/global'
import { RestApi } from '@servicenow/sdk/core'
import { getContext, getSchema, getTables, saveRecord, sendEmail } from '../../server/templater-api'

/**
 * /api/x_1040823_template/templater/...
 *
 * Every route checks for the Templater user role itself. The schema and
 * email routes also check the caller can read what they are asked about,
 * and the save route writes through the caller's own ACLs.
 */
RestApi({
    $id: Now.ID['templater-api'],
    name: 'Templater',
    serviceId: 'templater',
    shortDescription: 'Table schema, session context, email and safe saves for the Templater UI page.',
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
            shortDescription: "The caller's name, email, today's date in their format, time zone and language.",
            script: getContext,
        },
        {
            $id: Now.ID['templater-api-email'],
            name: 'email',
            method: 'POST',
            path: '/email',
            shortDescription: 'Emails a link to a PDF attached to a record the caller can read, or to a delivery.',
            script: sendEmail,
        },
        {
            $id: Now.ID['templater-api-save'],
            name: 'save',
            method: 'POST',
            path: '/save/{table}/{sys_id}',
            shortDescription:
                'Saves a template or presentation only if nobody else has since it was read, in one transaction.',
            script: saveRecord,
        },
    ],
})
