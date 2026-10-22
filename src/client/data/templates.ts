import type { PdfTemplate, StarterField } from '../engine/template'
import { readTemplate, type Validated } from '../engine/validate'
import { TEMPLATE_TABLE, type TemplateRecord } from '../services/templates'
import { openPictures } from './pictures'

/**
 * A template's body, read and with its pictures in it: the published body,
 * which is what exports, decks and presentations draw, or — for the designer
 * — the unpublished draft when there is one.
 */
export async function openTemplate(
    record: TemplateRecord,
    fields: StarterField[],
    which: 'published' | 'draft' = 'published'
): Promise<Validated<PdfTemplate>> {
    const raw = which === 'draft' && record.draftBody ? record.draftBody : (record.body ?? '')
    const read = readTemplate(raw, record.kind, fields)
    if (!read.ok) return read
    return { ok: true, value: await openPictures(read.value, TEMPLATE_TABLE, record.sysId) }
}
