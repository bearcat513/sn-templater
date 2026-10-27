import '@servicenow/sdk/global'
import { IntegerColumn, ReferenceColumn, StringColumn, Table, TableNameColumn } from '@servicenow/sdk/core'

/**
 * One emailed PDF of a batch: a batch export has no record of its own to
 * attach the file to, so it is attached to one of these, which also says
 * who sent which template's export, of which records, to whom and when —
 * the audit trail of what left the instance.
 *
 * Its sender and the people it was sent to can read it, and so its file;
 * nobody else but an editor can. Unlike a single record's PDF, whose link
 * opens only for people who can read that record, a batch's file was drawn
 * with its sender's access: sending it is sharing what they could see.
 */
export const x_1040823_template_delivery = Table({
    name: 'x_1040823_template_delivery',
    label: 'Templater delivery',
    display: 'subject',
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    actions: { read: true, create: true },
    schema: {
        template: ReferenceColumn({
            label: 'Template',
            referenceTable: 'x_1040823_template_template',
            cascadeRule: 'clear',
        }),
        table: TableNameColumn({ label: 'Table' }),
        query: StringColumn({ label: 'Records', maxLength: 4000 }),
        records: IntegerColumn({ label: 'Record count', default: 0 }),
        recipients: StringColumn({ label: 'Sent to', maxLength: 2000, readOnly: true }),
        subject: StringColumn({ label: 'Subject', maxLength: 200 }),
        message: StringColumn({ label: 'Message', maxLength: 4000 }),
        sent: IntegerColumn({ label: 'Emails sent', default: 0, readOnly: true }),
    },
})

/**
 * One use of a template — a PDF made, a deck presented, a PDF attached or
 * emailed — so its owners can see what it is used for. Written by the page
 * as it happens; read by editors.
 */
export const x_1040823_template_usage = Table({
    name: 'x_1040823_template_usage',
    label: 'Template usage',
    display: 'action',
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    actions: { read: true, create: true },
    schema: {
        template: ReferenceColumn({
            label: 'Template',
            referenceTable: 'x_1040823_template_template',
            cascadeRule: 'delete',
            mandatory: true,
        }),
        action: StringColumn({
            label: 'Action',
            maxLength: 40,
            mandatory: true,
            choices: {
                export: { label: 'PDF made', sequence: 10 },
                present: { label: 'Presented', sequence: 20 },
                attach: { label: 'Attached to a record', sequence: 30 },
                email: { label: 'Emailed', sequence: 40 },
                file: { label: 'Other file made', sequence: 50 },
            },
            dropdown: 'dropdown_without_none',
        }),
        records: IntegerColumn({ label: 'Records', default: 0 }),
        presentation: ReferenceColumn({
            label: 'Presentation',
            referenceTable: 'x_1040823_template_presentation',
            cascadeRule: 'clear',
        }),
    },
})
