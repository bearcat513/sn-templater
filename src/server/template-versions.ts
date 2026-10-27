import { gs, GlideRecord } from '@servicenow/glide'
import { PRESENTATION_VERSION_TABLE, VERSION_TABLE } from './shared/constants.ts'
import { checkBody, checkPresentationBody, type BodyCheck } from './shared/schema.ts'

type Gr = GlideRecord<string>

/**
 * Refuses a body the designer could not read, whoever wrote it — the
 * designer, a script, the Table API or a body pasted on the form — so a hand
 * edit cannot break every export made from the template. Only a body that
 * changed is checked; one already stored is left alone, whatever it says.
 * Returns whether the write may go on.
 */
function refuseUnreadable(
    current: Gr,
    previous: Gr | null,
    fields: string[],
    check: (body: string) => BodyCheck,
    what: string
): boolean {
    for (const field of fields) {
        const body = String(current.getValue(field) || '')
        if (!body || (previous && body === String(previous.getValue(field) || ''))) continue
        const result = check(body)
        if (!result.ok) {
            gs.addErrorMessage(what + ' was not saved: ' + result.errors.slice(0, 5).join(' '))
            current.setAbortAction(true)
            return false
        }
    }
    return true
}

/**
 * Keeps the published history: when `body` changes, the version number goes
 * up and the new body is kept as a version row, with the publish note that
 * came with it. The note is cleared once it is used, so it belongs to one
 * publish only. `copy` names the record's own fields kept on the version.
 */
function numberVersion(current: Gr, previous: Gr | null, table: string, parent: string, copy: string[]) {
    current.setValue('has_draft', current.getValue('draft_body') ? 'true' : 'false')

    const body = String(current.getValue('body') || '')
    const before = previous ? String(previous.getValue('body') || '') : ''
    if (!body || (previous && body === before)) return

    const next = (Number(current.getValue('version')) || 0) + 1
    current.setValue('version', String(next))

    const version = new GlideRecord(table)
    version.initialize()
    version.setValue(parent, current.getUniqueValue())
    version.setValue('version', String(next))
    for (const field of copy) version.setValue(field, String(current.getValue(field) || ''))
    version.setValue('note', String(current.getValue('publish_note') || ''))
    version.setValue('body', body)
    version.insert()

    current.setValue('publish_note', '')
}

/**
 * Before insert and update on a template: refuse an unreadable body or
 * draft, then number a changed published body and keep it as a version.
 */
export function numberTemplateVersion(current: GlideRecord<string>, previous: GlideRecord<string> | null) {
    const kind = String(current.getValue('kind') || 'document')
    if (!refuseUnreadable(current, previous, ['body', 'draft_body'], body => checkBody(kind, body), 'The template'))
        return
    numberVersion(current, previous, VERSION_TABLE, 'template', ['name', 'kind', 'table'])
}

/**
 * Before insert and update on a presentation: the same for its body and its
 * unpublished changes. A draft carries the deck's settings under `meta`,
 * which the check leaves alone.
 */
export function numberPresentationVersion(current: GlideRecord<string>, previous: GlideRecord<string> | null) {
    if (
        !refuseUnreadable(
            current,
            previous,
            ['body', 'draft_body'],
            body => checkPresentationBody(body),
            'The presentation'
        )
    )
        return
    numberVersion(current, previous, PRESENTATION_VERSION_TABLE, 'presentation', [
        'name',
        'title',
        'query',
        'order_by',
        'record_limit',
        'template',
    ])
}
