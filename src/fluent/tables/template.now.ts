import '@servicenow/sdk/global'
import {
    BooleanColumn,
    ConditionsColumn,
    IntegerColumn,
    StringColumn,
    Table,
    TableNameColumn,
} from '@servicenow/sdk/core'

/**
 * One table for every kind of template. Documents and decks are the same
 * thing — the same editor, the same letterhead, the same block language —
 * and `kind` only decides their defaults and where they are offered. A chart
 * is its own body (a grouping and a look), counting the records of `table`
 * that `query` matches, and is placed in the others by sys_id.
 *
 * The body is one large text column rather than a JSON column: it is the
 * canonical JSON the editor writes. Its pictures are attachments on the
 * record, named in the body by their content (`attachment:templater-….png`);
 * a body written before that carries them as data: URLs, which is why it is
 * still allowed to be large.
 *
 * ## Drafts and versions
 *
 * `body` is what is *published*: what exports, decks and presentations use.
 * The designer saves to `draft_body`, and publishing moves the draft into
 * `body`. Every change to `body` is numbered (`version`) and kept as a row of
 * x_1040823_template_version by a business rule, so a published template can
 * be compared with and restored from what it was.
 */
export const x_1040823_template_template = Table({
    name: 'x_1040823_template_template',
    label: 'Template',
    display: 'name',
    allowWebServiceAccess: true,
    accessibleFrom: 'public',
    actions: { read: true },
    schema: {
        name: StringColumn({ label: 'Name', maxLength: 100, mandatory: true }),
        kind: StringColumn({
            label: 'Kind',
            maxLength: 40,
            mandatory: true,
            default: 'document',
            choices: {
                document: { label: 'PDF document', sequence: 10 },
                deck: { label: 'Slide deck', sequence: 20 },
                chart: { label: 'Chart', sequence: 30 },
            },
            dropdown: 'dropdown_without_none',
        }),
        table: TableNameColumn({ label: 'Table', mandatory: true }),
        description: StringColumn({ label: 'Description', maxLength: 1000 }),
        active: BooleanColumn({ label: 'Active', default: true }),
        query: ConditionsColumn({
            label: 'Default records',
            dependent: 'table',
            maxLength: 4000,
            hint: 'Which records a deck or batch export starts from. Can be changed when presenting.',
        }),
        order_by: StringColumn({
            label: 'Order by',
            maxLength: 120,
            hint: 'A field to sort records by. Start with a minus sign to sort descending, e.g. -sys_updated_on.',
        }),
        record_limit: IntegerColumn({ label: 'Record limit', default: 50 }),
        body: StringColumn({
            label: 'Body',
            maxLength: 3000000,
            hint: 'The published template, as JSON. Edit it in the Templater designer.',
        }),
        draft_body: StringColumn({
            label: 'Draft body',
            maxLength: 3000000,
            hint: 'Changes saved in the designer and not yet published. Empty when there are none.',
        }),
        has_draft: BooleanColumn({
            label: 'Has unpublished changes',
            default: false,
            readOnly: true,
        }),
        version: IntegerColumn({
            label: 'Version',
            default: 0,
            readOnly: true,
            hint: 'Counts the times the body has been published.',
        }),
        publish_note: StringColumn({
            label: 'Publish note',
            maxLength: 1000,
            hint: 'Set with a publish; copied to the version it makes and then cleared.',
        }),
    },
})
