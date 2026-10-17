import '@servicenow/sdk/global'
import { UiAction } from '@servicenow/sdk/core'
import { templaterUser } from '../security/roles.now'

/*
 * Two ways into Templater from the platform UI, on every table — each shown
 * only where an active template applies (see TemplaterUtils.hasTemplatesFor).
 */

/** Form: a related link that opens this record in the export view. */
UiAction({
    $id: Now.ID['templater-form-export'],
    table: 'global',
    name: 'Export with Templater',
    actionName: 'x_1040823_template_export',
    hint: 'Export this record to PDF using a Templater template',
    showUpdate: true,
    showInsert: false,
    condition: 'new x_1040823_template.TemplaterUtils().hasTemplatesFor(current.getTableName())',
    roles: [templaterUser],
    form: {
        showLink: true,
        showContextMenu: true,
        showButton: false,
    },
    client: {
        isClient: true,
        isUi16Compatible: true,
        onClick: 'openTemplaterForRecord()',
    },
    script: `function openTemplaterForRecord() {
    var url = 'x_1040823_template_templater.do?view=export' +
        '&table=' + encodeURIComponent(g_form.getTableName()) +
        '&sys_id=' + encodeURIComponent(g_form.getUniqueValue());
    g_navigation.open(url, '_blank');
}`,
    order: 900,
})

/** List: "Actions on selected rows" — export the checked records, or present them as a deck. */
UiAction({
    $id: Now.ID['templater-list-export'],
    table: 'global',
    name: 'Export / present with Templater',
    actionName: 'x_1040823_template_export_list',
    hint: 'Export the selected records to PDF, or present them as slides',
    condition: 'new x_1040823_template.TemplaterUtils().hasTemplatesFor(current.getTableName())',
    roles: [templaterUser],
    list: {
        showListChoice: true,
        showButton: false,
        showContextMenu: false,
    },
    client: {
        isClient: true,
        isUi16Compatible: true,
        onClick: 'openTemplaterForSelection()',
    },
    script: `function openTemplaterForSelection() {
    var checked = g_list.getChecked();
    if (!checked) return;
    var url = 'x_1040823_template_templater.do?view=export' +
        '&table=' + encodeURIComponent(g_list.getTableName()) +
        '&query=' + encodeURIComponent('sys_idIN' + checked);
    g_navigation.open(url, '_blank');
}`,
    order: 900,
})
