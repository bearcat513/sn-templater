import '@servicenow/sdk/global'
import { ScriptInclude } from '@servicenow/sdk/core'

export const templaterUtils = ScriptInclude({
    $id: Now.ID['templater-utils'],
    name: 'TemplaterUtils',
    description: 'Helpers for the Templater UI actions: whether any template applies to a table.',
    accessibleFrom: 'public',
    callerAccess: 'tracking',
    script: Now.include('./templater-utils.server.js'),
})
