import '@servicenow/sdk/global'
import { BooleanColumn, IntegerColumn, ReferenceColumn, StringColumn, Table } from '@servicenow/sdk/core'

/**
 * A comment on one slide of a presentation, left in the slide builder or the
 * presenter. The slide is named by its key — `custom:<id>`,
 * `record:<sys_id>:1` — as the running order names it, so a comment on a
 * record's slide stays with that record for as long as it is in the deck.
 */
export const x_1040823_template_comment = Table({
    name: 'x_1040823_template_comment',
    label: 'Slide comment',
    display: 'text',
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
        slide: StringColumn({ label: 'Slide', maxLength: 160, mandatory: true }),
        text: StringColumn({ label: 'Comment', maxLength: 4000, mandatory: true }),
        resolved: BooleanColumn({ label: 'Resolved', default: false }),
    },
})

/**
 * Someone presenting with followers: the slide on their screen and its build
 * step, so a "follow along" link can show the same. One row per session,
 * written by its presenter as they move and read by everyone following; a
 * session nobody has moved for a while is over.
 */
export const x_1040823_template_live = Table({
    name: 'x_1040823_template_live',
    label: 'Live presentation',
    display: 'slide',
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
        presenter: ReferenceColumn({ label: 'Presenter', referenceTable: 'sys_user', mandatory: true }),
        slide: StringColumn({ label: 'Slide', maxLength: 160 }),
        step: IntegerColumn({ label: 'Build step', default: 0 }),
        ended: BooleanColumn({ label: 'Ended', default: false }),
    },
})
