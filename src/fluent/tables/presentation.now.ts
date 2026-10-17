import '@servicenow/sdk/global'
import { IntegerColumn, ReferenceColumn, StringColumn, Table } from '@servicenow/sdk/core'

/**
 * A saved presentation: a deck template, the records it was built from, and
 * how its author arranged it — the running order, slides hidden from the show,
 * and custom slides of their own slotted in anywhere.
 *
 * The record slides are not stored: they are drawn from the template against
 * whatever the filter matches when the presentation is opened, so a weekly
 * review saved once shows this week's records next week. Only what a person
 * made by hand is kept, in `body` — the custom slides (pictures included, as
 * data: URLs, which is why it is allowed to be large) and the order.
 *
 * Deleting the template clears the reference rather than the presentation:
 * the custom slides are someone's work, and can be put on another deck.
 */
export const x_1040823_template_presentation = Table({
    name: 'x_1040823_template_presentation',
    label: 'Presentation',
    display: 'name',
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    actions: { read: true },
    schema: {
        name: StringColumn({ label: 'Name', maxLength: 100, mandatory: true }),
        template: ReferenceColumn({
            label: 'Deck template',
            referenceTable: 'x_1040823_template_template',
            cascadeRule: 'clear',
        }),
        title: StringColumn({
            label: 'Deck title',
            maxLength: 200,
            hint: 'Shown on the title slide as {{deck.title}}.',
        }),
        query: StringColumn({
            label: 'Records',
            maxLength: 4000,
            hint: 'An encoded query on the template’s table: which records get a slide.',
        }),
        order_by: StringColumn({
            label: 'Order by',
            maxLength: 120,
            hint: 'A field to sort records by. Start with a minus sign to sort descending.',
        }),
        record_limit: IntegerColumn({ label: 'Record limit', default: 20 }),
        body: StringColumn({
            label: 'Body',
            maxLength: 3000000,
            hint: 'The custom slides and the running order, as JSON. Edit it in the Templater slide builder.',
        }),
    },
})
