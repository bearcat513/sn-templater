import '@servicenow/sdk/global'
import { BusinessRule } from '@servicenow/sdk/core'
import { numberTemplateVersion } from '../../server/template-versions'

/**
 * Keeps a template's published history: each time its body changes — the
 * designer publishing, a script updating it, a body pasted in on the form —
 * the version number goes up and the new body is kept as a version row.
 * Also keeps `has_draft` in step with the draft body.
 */
BusinessRule({
    $id: Now.ID['template-versions'],
    name: 'Number template versions',
    table: 'x_1040823_template_template',
    when: 'before',
    action: ['insert', 'update'],
    order: 100,
    script: numberTemplateVersion,
    description: 'Numbers each published body of a template and keeps it as a template version.',
})
