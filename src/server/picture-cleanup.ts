import { gs, GlideDateTime, GlideRecord, GlideSysAttachment } from '@servicenow/glide'
import {
    PICTURE_PREFIX,
    PICTURE_RETENTION_PROPERTY,
    PRESENTATION_TABLE,
    PRESENTATION_VERSION_TABLE,
    TEMPLATE_TABLE,
    VERSION_TABLE,
} from './shared/constants.ts'

/** A picture attachment's name, as Templater writes it: what a body names after `attachment:`. */
const PICTURE_NAME = /^templater-[0-9a-f]{16,64}\.(png|jpg)$/

/** The owners of pictures, with the bodies that can name them and the versions kept of those. */
const OWNERS = [
    { table: TEMPLATE_TABLE, versions: VERSION_TABLE, parent: 'template' },
    { table: PRESENTATION_TABLE, versions: PRESENTATION_VERSION_TABLE, parent: 'presentation' },
]

/** A picture uploaded this recently is kept whatever names it: its body may be saving now. */
const GRACE_DAYS = 1

/**
 * Deletes picture attachments no body uses any more.
 *
 * Pictures are attachments of the template or presentation they belong to,
 * named by their content. A logo that changes leaves the old one behind, and
 * nothing else ever deletes it, so templates collect them. This keeps a
 * picture while the record's published body, its draft, or any version
 * published within the retention period
 * (x_1040823_template.picture_retention_days, 90 by default) names it, and
 * deletes the rest. A version older than that can still be restored; its
 * pictures that are gone print as a problem, as a missing picture always has.
 *
 * Runs weekly as the scheduled job "Clean up Templater pictures".
 */
export function cleanUpPictures() {
    const retention = Math.max(1, parseInt(String(gs.getProperty(PICTURE_RETENTION_PROPERTY, '90')), 10) || 90)
    const keptSince = new GlideDateTime()
    keptSince.addDaysUTC(-retention)
    const graceSince = new GlideDateTime()
    graceSince.addDaysUTC(-GRACE_DAYS)

    let checked = 0
    let deleted = 0
    const attachments = new GlideSysAttachment()

    for (const owner of OWNERS) {
        // Each owner's pictures, grouped, so its bodies are read once however many it has.
        const byOwner: Record<string, { sysId: string; name: string; created: string }[]> = {}
        const pictures = new GlideRecord('sys_attachment')
        pictures.addQuery('table_name', owner.table)
        pictures.addQuery('file_name', 'STARTSWITH', PICTURE_PREFIX)
        pictures.query()
        while (pictures.next()) {
            const name = String(pictures.getValue('file_name'))
            if (!PICTURE_NAME.test(name)) continue
            const parent = String(pictures.getValue('table_sys_id'))
            ;(byOwner[parent] = byOwner[parent] || []).push({
                sysId: pictures.getUniqueValue(),
                name,
                created: String(pictures.getValue('sys_created_on')),
            })
        }

        for (const parent of Object.keys(byOwner)) {
            const named = bodiesOf(owner, parent, keptSince.getValue())
            for (const picture of byOwner[parent]!) {
                checked++
                if (picture.created >= graceSince.getValue()) continue
                // An owner that is gone (null) names nothing: its pictures go too.
                if (named !== null && named.indexOf('attachment:' + picture.name) !== -1) continue
                attachments.deleteAttachment(picture.sysId)
                deleted++
            }
        }
    }

    gs.info(
        '[Templater] Picture clean-up: ' +
            deleted +
            ' of ' +
            checked +
            ' pictures were no longer used and were deleted.'
    )
}

/**
 * Every body that can name a picture of this record, as one string: its
 * published body, its draft, and the versions published since `since`.
 * Null when the record no longer exists.
 */
function bodiesOf(owner: (typeof OWNERS)[number], sysId: string, since: string): string | null {
    const record = new GlideRecord(owner.table)
    if (!record.get(sysId)) return null
    const parts = [String(record.getValue('body') || ''), String(record.getValue('draft_body') || '')]
    const versions = new GlideRecord(owner.versions)
    versions.addQuery(owner.parent, sysId)
    versions.addQuery('sys_created_on', '>=', since)
    versions.query()
    while (versions.next()) parts.push(String(versions.getValue('body') || ''))
    return parts.join('\n')
}
