import '@servicenow/sdk/global'
import { IntegerColumn, ReferenceColumn, StringColumn, Table } from '@servicenow/sdk/core'

/**
 * One published version of a presentation: its body and deck settings as
 * they were published, with who published it, when and why. Written by the
 * "Number presentation versions" business rule whenever a presentation's
 * body changes, never by hand; deleting a presentation deletes its versions.
 */
export const x_1040823_template_pres_version = Table({
    name: 'x_1040823_template_pres_version',
    label: 'Presentation version',
    display: 'name',
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    actions: { read: true },
    schema: {
        presentation: ReferenceColumn({
            label: 'Presentation',
            referenceTable: 'x_1040823_template_presentation',
            cascadeRule: 'delete',
            mandatory: true,
        }),
        version: IntegerColumn({ label: 'Version', mandatory: true }),
        name: StringColumn({ label: 'Name', maxLength: 100 }),
        title: StringColumn({ label: 'Deck title', maxLength: 200 }),
        template: StringColumn({ label: 'Deck template', maxLength: 32 }),
        query: StringColumn({ label: 'Records', maxLength: 4000 }),
        order_by: StringColumn({ label: 'Order by', maxLength: 120 }),
        record_limit: IntegerColumn({ label: 'Record limit' }),
        note: StringColumn({ label: 'Note', maxLength: 1000 }),
        body: StringColumn({ label: 'Body', maxLength: 3000000 }),
    },
})
