import '@servicenow/sdk/global'
import { IntegerColumn, ReferenceColumn, StringColumn, Table, TableNameColumn } from '@servicenow/sdk/core'

/**
 * One published version of a template: its body as it was published, with
 * who published it, when, and why. Written by the "Number template versions"
 * business rule whenever a template's body changes, never by hand; deleting
 * a template deletes its versions.
 *
 * Pictures stay attachments on the template itself, so a version's body
 * names them exactly as the template's does.
 */
export const x_1040823_template_version = Table({
    name: 'x_1040823_template_version',
    label: 'Template version',
    display: 'name',
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    actions: { read: true },
    schema: {
        template: ReferenceColumn({
            label: 'Template',
            referenceTable: 'x_1040823_template_template',
            cascadeRule: 'delete',
            mandatory: true,
        }),
        version: IntegerColumn({ label: 'Version', mandatory: true }),
        name: StringColumn({ label: 'Name', maxLength: 100 }),
        kind: StringColumn({ label: 'Kind', maxLength: 40 }),
        table: TableNameColumn({ label: 'Table' }),
        note: StringColumn({ label: 'Note', maxLength: 1000 }),
        body: StringColumn({ label: 'Body', maxLength: 3000000 }),
    },
})
