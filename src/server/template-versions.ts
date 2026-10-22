import { GlideRecord } from '@servicenow/glide'

const VERSION_TABLE = 'x_1040823_template_version'

/**
 * Before insert and update on a template: when its published body changes,
 * number the change and keep the body as a version, with the publish note
 * that came with it. The note is cleared once it is used, so it belongs to
 * one publish only.
 */
export function numberTemplateVersion(current: GlideRecord<string>, previous: GlideRecord<string> | null) {
    current.setValue('has_draft', current.getValue('draft_body') ? 'true' : 'false')

    const body = String(current.getValue('body') || '')
    const before = previous ? String(previous.getValue('body') || '') : ''
    if (!body || (previous && body === before)) return

    const next = (Number(current.getValue('version')) || 0) + 1
    current.setValue('version', String(next))

    const version = new GlideRecord(VERSION_TABLE)
    version.initialize()
    version.setValue('template', current.getUniqueValue())
    version.setValue('version', String(next))
    version.setValue('name', String(current.getValue('name') || ''))
    version.setValue('kind', String(current.getValue('kind') || ''))
    version.setValue('table', String(current.getValue('table') || ''))
    version.setValue('note', String(current.getValue('publish_note') || ''))
    version.setValue('body', body)
    version.insert()

    current.setValue('publish_note', '')
}
