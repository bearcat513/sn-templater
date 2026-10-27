import '@servicenow/sdk/global'
import { BusinessRule } from '@servicenow/sdk/core'
import { numberPresentationVersion, numberTemplateVersion } from '../../server/template-versions'

/**
 * Keeps a template's published history: each time its body changes — the
 * designer publishing, a script updating it, a body pasted in on the form —
 * the version number goes up and the new body is kept as a version row.
 * Also keeps `has_draft` in step with the draft body, and refuses a body or
 * draft the designer could not read.
 */
BusinessRule({
    $id: Now.ID['template-versions'],
    name: 'Number template versions',
    table: 'x_1040823_template_template',
    when: 'before',
    action: ['insert', 'update'],
    order: 100,
    script: numberTemplateVersion,
    description:
        'Refuses a template body the designer could not read, then numbers each published body and keeps it as a template version.',
})

/** The same for a presentation: its published body numbered and kept, and an unreadable one refused. */
BusinessRule({
    $id: Now.ID['presentation-versions'],
    name: 'Number presentation versions',
    table: 'x_1040823_template_presentation',
    when: 'before',
    action: ['insert', 'update'],
    order: 100,
    script: numberPresentationVersion,
    description:
        'Refuses a presentation body the slide builder could not read, then numbers each published body and keeps it as a presentation version.',
})
