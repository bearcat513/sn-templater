import '@servicenow/sdk/global'
import { BooleanColumn, IntegerColumn, ListColumn, ReferenceColumn, StringColumn, Table } from '@servicenow/sdk/core'

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
 * The deck template is optional. A presentation without one is built from
 * nothing: custom slides, and other templates placed in it as sections —
 * each a template, its filter, sort and limit, kept in `body` — whose slides
 * are drawn the same way, in that template's own look.
 *
 * Deleting the template clears the reference rather than the presentation:
 * the custom slides are someone's work, and can be put on another deck.
 *
 * ## Drafts and versions
 *
 * Like a template's, `body` is what is *published*: what the presentation's
 * link presents. The builder saves to `draft_body` — the body with the deck's
 * title, records and order under `meta` — and publishing moves it into the
 * record. Every change to `body` is numbered (`version`) and kept as a row of
 * x_1040823_template_pres_version by the "Number presentation versions"
 * business rule.
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
            hint: 'The custom slides, the templates placed in sections, and the running order, as JSON. Edit it in the Templater slide builder.',
        }),
        draft_body: StringColumn({
            label: 'Draft body',
            maxLength: 3000000,
            hint: 'Changes saved in the slide builder and not yet published, with the deck settings they change. Empty when there are none.',
        }),
        has_draft: BooleanColumn({ label: 'Has unpublished changes', default: false, readOnly: true }),
        version: IntegerColumn({
            label: 'Version',
            default: 0,
            readOnly: true,
            hint: 'Counts the times the presentation has been published.',
        }),
        publish_note: StringColumn({
            label: 'Publish note',
            maxLength: 1000,
            hint: 'Set with a publish; copied to the version it makes and then cleared.',
        }),
        editors: ListColumn({
            label: 'Shared with people',
            referenceTable: 'sys_user',
            hint: 'People who can change it as well as its author.',
        }),
        editor_groups: ListColumn({
            label: 'Shared with groups',
            referenceTable: 'sys_user_group',
            hint: 'Groups whose members can change it as well as its author.',
        }),
    },
})
