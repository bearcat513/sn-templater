import '@servicenow/sdk/global'
import { ScriptInclude } from '@servicenow/sdk/core'

/**
 * The API for server scripts: `new x_1040823_template.Templater()`. It finds
 * and creates templates, returns export and present links, and builds saved
 * presentations with custom slides. See the README's "Scripting" section.
 */
export const templater = ScriptInclude({
    $id: Now.ID['templater-script-include'],
    name: 'Templater',
    description:
        'Server-side API for Templater: find, create and copy templates, get links that export records to PDF, and build saved presentations (decks) with custom slides from a script.',
    accessibleFrom: 'public',
    callerAccess: 'tracking',
    script: Now.include('./templater.server.js'),
})
