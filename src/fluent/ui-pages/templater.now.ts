import '@servicenow/sdk/global'
import { UiPage } from '@servicenow/sdk/core'
import templaterPage from '../../client/index.html'

/** The Templater app: template designer, PDF export and slide presenter. */
export const templaterUiPage = UiPage({
    $id: Now.ID['templater-page'],
    endpoint: 'x_1040823_template_templater.do',
    description: 'Templater — design templates, export records to PDF and present them as slides.',
    category: 'general',
    html: templaterPage,
    direct: true,
})
