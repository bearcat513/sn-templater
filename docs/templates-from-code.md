# Generating a template from code

The designer is the usual way to make a template, but a template is just a record with a JSON body, so a script can make one too. That is useful when you want to:

- set up the same templates on every instance from a fix script
- make a template for each of many tables in one pass
- let people make a starter template for a table with one click

This guide explains the body format, then shows two examples: a **background script** that creates or updates a template, and a **UI action** that creates one for any table from its dictionary.

## What a template is

A template is a record on `x_1040823_template_template`:

| Field | createTemplate key | Notes |
| --- | --- | --- |
| `name` | `name` | Required. Scripts find templates by name, preferring active ones. |
| `kind` | `kind` | `document` (the default), `deck` or `chart`. |
| `table` | `table` | Required. Tables that extend it can use the template too. |
| `description` | `description` | |
| `active` | `active` | Defaults to true. Only active templates are offered. |
| `query` | `query` | Encoded query: which records a deck or batch export starts from. |
| `order_by` | `orderBy` | A field. A leading `-` sorts descending. |
| `record_limit` | `limit` | At most 500. |
| `body` | `body` | The document as JSON: an object or a string. |

### The body

Only `blocks` is required. Anything you leave out gets the same default the designer would give it, and the designer writes those defaults back the first time the template is saved.

```js
{
    page: {                       // optional
        size: 'A4',               // A4, Letter, Legal, Slide16x9, Slide4x3
        margins: { top: 56, right: 48, bottom: 56, left: 48 },
        family: 'helvetica',      // helvetica, times, courier
        fontSize: 10,
        textColor: '#18181b',
        mutedColor: '#71717a',
        accentColor: '#1d4ed8',
    },
    header: { text: 'ACME IT', rule: true },          // optional letterhead
    watermark: { text: 'DRAFT', opacity: 0.08 },      // optional
    cover: [ /* blocks */ ],                          // optional title page or slide
    blocks: [ /* blocks, drawn once per record */ ],  // required, at least one
    footer: { text: '{{record.number}}', showPageNumbers: true },
}
```

Every string goes through [token substitution](../README.md#tokens), so `{{record.short_description}}` works in a heading, a table cell or the footer.

The block types and their main keys:

| `type` | Keys |
| --- | --- |
| `heading` | `text`, `size`, `align`, `color`, `spaceAfter` |
| `text` | `text`, `size`, `align`, `color`, `bold`, `italic`, `spaceAfter` |
| `fields` | `rows: [{ label, value }]` |
| `columns` | `columns: [{ heading, text, align }]`, `gap` |
| `stats` | `items: [{ label, value }]`, `color` |
| `relatedList` | `table`, `field` (the reference back to this record), `query`, `orderBy`, `limit`, `title`, `columns: [{ field, header, width, align }]`, `emptyText` |
| `reference` | `field`, `table`, `title`, `rows: [{ label, field }]`, `layout` (`card` or `plain`), `link`, `emptyText` |
| `callout` | `tone` (`info`, `success`, `warning`, `critical`, `neutral`), `title`, `text` |
| `list` | `style` (`bullet`, `number`, `check`), `items` |
| `table` | `columns: [{ header, width, align }]`, `rows: [[cell, …]]` |
| `code` | `code`, `title`, `lineNumbers` |
| `link` | `text`, `url` |
| `image` | `source` (PNG or JPEG `data:` URL; the designer stores it as an `attachment:templater-….png` reference to an attachment on the template), `width`, `align`, `caption` |
| `signatures` | `parties: [{ label, caption }]` |
| `chart` | See [Charts](../README.md#charts). The easiest way to get one is to make it in the designer and copy its JSON. |
| `divider`, `spacer`, `pageBreak` | `divider`: `color`, `thickness`. `spacer`: `height`. |

Column `width`s are shares, not points: they are scaled to fill the table.

> **Tip:** the fastest way to get a body right is to build it once in the designer and copy it. Open the template's record on `x_1040823_template_template` and copy the **Body** field, or call `getTemplate(name).body` in a script.

The browser reads every body leniently. It drops a block it doesn't recognise and clamps values that are out of range, so a typo usually means a missing block, not an error. The server only checks that the body is valid JSON. A body with no blocks saves without complaint but won't open, so check your template in the designer after a script creates it.

## Example 1: a background script

This script creates a **Change summary** PDF template for `change_request`. If a template by that name already exists, the script updates it instead, so you can run it again after changing the body.

Run it from **System Definition › Scripts - Background**. Use the `x_1040823_template` scope or global: the `Templater` script include is public either way.

```js
(function () {
    var templater = new x_1040823_template.Templater();
    var NAME = 'Change summary';

    var body = {
        page: { size: 'A4', accentColor: '#1d4ed8' },
        blocks: [
            { type: 'text', text: 'CHANGE SUMMARY', size: 8.5, bold: true, color: '#1d4ed8', spaceAfter: 3 },
            { type: 'heading', text: '{{record.number}}: {{record.short_description}}', size: 18 },
            { type: 'text', text: 'Requested by {{record.requested_by}} · {{record.type}} change', color: '#71717a', spaceAfter: 12 },
            {
                type: 'stats',
                items: [
                    { label: 'State', value: '{{record.state}}' },
                    { label: 'Risk', value: '{{record.risk}}' },
                    { label: 'Impact', value: '{{record.impact}}' },
                ],
            },
            {
                type: 'fields',
                rows: [
                    { label: 'Planned start', value: '{{record.start_date}}' },
                    { label: 'Planned end', value: '{{record.end_date}}' },
                    { label: 'Assignment group', value: '{{record.assignment_group}}' },
                    { label: 'Assigned to', value: '{{record.assigned_to}}' },
                    { label: 'Configuration item', value: '{{record.cmdb_ci}}' },
                ],
            },
            {
                type: 'reference',
                field: 'requested_by',
                table: 'sys_user',
                title: 'Requester',
                layout: 'card',
                link: true,
                rows: [
                    { label: 'Email', field: 'email' },
                    { label: 'Phone', field: 'phone' },
                    { label: 'Department', field: 'department' },
                ],
                emptyText: 'No requester.',
            },
            { type: 'heading', text: 'Implementation plan', size: 12, spaceAfter: 6 },
            { type: 'text', text: '{{record.implementation_plan}}', spaceAfter: 8 },
            { type: 'callout', tone: 'warning', title: 'Backout plan', text: '{{record.backout_plan}}' },
            {
                type: 'relatedList',
                title: 'Change tasks ({{list.count}})',
                table: 'change_task',
                field: 'change_request',
                orderBy: 'number',
                limit: 50,
                columns: [
                    { field: 'number', header: 'Number', width: 18 },
                    { field: 'short_description', header: 'Short description', width: 46 },
                    { field: 'state', header: 'State', width: 16 },
                    { field: 'assigned_to', header: 'Assigned to', width: 20 },
                ],
                emptyText: 'No change tasks.',
            },
            { type: 'signatures', parties: [{ label: 'Change manager' }, { label: 'Service owner' }] },
        ],
        footer: { text: '{{record.number}} · Printed {{now.datetime}} by {{user.name}}', showPageNumbers: true },
    };

    var spec = {
        name: NAME,
        table: 'change_request',
        kind: 'document',
        description: 'One-page summary of a change, its plans, tasks and sign-off.',
        query: 'active=true',
        orderBy: '-sys_updated_on',
        limit: 50,
        body: body,
    };

    try {
        var existing = templater.getTemplate(NAME);
        var sysId = existing ? templater.updateTemplate(existing.sys_id, spec) : templater.createTemplate(spec);
        gs.info((existing ? 'Updated' : 'Created') + ' "' + NAME + '": ' + sysId);
        gs.info('Design it: ' + gs.getProperty('glide.servlet.uri') + 'x_1040823_template_templater.do?view=edit&id=' + sysId);
    } catch (e) {
        gs.error('Could not save "' + NAME + '": ' + e.message);
    }
})();
```

What to notice:

- **`getTemplate` returns `null`** when nothing matches, so the script can create or update without a separate query.
- **`body` is a plain object.** The script include turns it into JSON. You can also pass a string, which must be valid JSON.
- **Errors are thrown**, not returned, with a message that starts with the method's name, for example `Templater.createTemplate: there is no table called "change_requests".`
- **Scripts write with `GlideRecord`** and so skip ACLs. To make the script respect the current user's roles, use `new x_1040823_template.Templater({ secure: true })`. Creating a template then needs `x_1040823_template.editor`.

### Making a deck instead

Set `kind: 'deck'` and use a slide size. The `cover` blocks become the title slide, and each record gets one slide drawn from `blocks`:

```js
templater.createTemplate({
    name: 'Open changes deck',
    table: 'change_request',
    kind: 'deck',
    query: 'active=true',
    orderBy: 'start_date',
    limit: 20,
    body: {
        page: { size: 'Slide16x9', fontSize: 16, accentColor: '#1d4ed8', margins: { top: 48, right: 56, bottom: 44, left: 56 } },
        cover: [
            { type: 'spacer', height: 120 },
            { type: 'heading', text: '{{deck.title}}', size: 44 },
            { type: 'text', text: '{{deck.count}} changes · {{now.date}}', color: '#6b7280', size: 18 },
        ],
        blocks: [
            { type: 'text', text: '{{record.number}}', color: '#1d4ed8', bold: true, size: 14, spaceAfter: 2 },
            { type: 'heading', text: '{{record.short_description}}', size: 28 },
            { type: 'stats', items: [
                { label: 'Risk', value: '{{record.risk}}' },
                { label: 'Starts', value: '{{record.start_date}}' },
                { label: 'Group', value: '{{record.assignment_group}}' },
            ] },
        ],
        footer: { text: '{{deck.title}}', showPageNumbers: true },
    },
});
```

## Example 2: a UI action that makes a starter template

This UI action adds a **Create Templater template** button to the form of any table in **System Definition › Tables** (`sys_db_object`). Clicking it reads the table's dictionary, including the fields it inherits, and builds a document template from them. It then opens the new template in the designer.

Add it to the app as a Fluent file, for example `src/fluent/ui-actions/create-template.now.ts`, next to [`open-templater.now.ts`](../src/fluent/ui-actions/open-templater.now.ts):

```ts
import '@servicenow/sdk/global'
import { UiAction } from '@servicenow/sdk/core'
import { templaterEditor } from '../security/roles.now'

/** Tables form: builds a document template from the table's own fields and opens it in the designer. */
UiAction({
    $id: Now.ID['templater-create-from-table'],
    table: 'sys_db_object',
    name: 'Create Templater template',
    actionName: 'x_1040823_template_create_from_table',
    hint: 'Make a PDF template for this table from its fields, then open it in Templater',
    showUpdate: true,
    showInsert: false,
    condition: "gs.hasRole('x_1040823_template.editor')",
    roles: [templaterEditor],
    form: {
        showButton: true,
        showLink: false,
        showContextMenu: false,
    },
    script: Now.include('./create-template.server.js'),
    order: 900,
})
```

And the server script, `src/fluent/ui-actions/create-template.server.js`:

```js
(function () {
    var MAX_FIELDS = 12;
    // Types that don't read well as one line in a field list.
    var SKIP_TYPES = ['collection', 'journal', 'journal_input', 'journal_list', 'html', 'user_image', 'password', 'password2', 'script', 'script_plain', 'conditions'];

    var table = String(current.getValue('name'));
    var label = String(current.getValue('label') || table);

    // The table and the tables it extends, so an incident also gets task's fields.
    var tables = new GlideTableHierarchy(table).getTables();
    var dictionary = new GlideRecord('sys_dictionary');
    dictionary.addQuery('name', 'IN', tables.join(','));
    dictionary.addQuery('element', '!=', '');
    dictionary.addQuery('element', 'NOT LIKE', 'sys_%');
    dictionary.addQuery('internal_type', 'NOT IN', SKIP_TYPES.join(','));
    dictionary.addQuery('active', true);
    dictionary.orderBy('column_label');
    dictionary.query();

    var seen = {};
    var rows = [];
    var hasNumber = false;
    var hasDescription = false;
    while (dictionary.next() && rows.length < MAX_FIELDS) {
        var element = String(dictionary.getValue('element'));
        if (seen[element]) continue;
        seen[element] = true;
        if (element === 'number') hasNumber = true;
        if (element === 'description') {
            hasDescription = true;
            continue; // gets a block of its own below
        }
        rows.push({ label: String(dictionary.getValue('column_label') || element), value: '{{record.' + element + '}}' });
    }

    var identity = hasNumber ? '{{record.number}}' : '{{table.label}}';
    var blocks = [
        { type: 'heading', text: '{{table.label}} ' + identity, size: 20 },
        { type: 'divider' },
        { type: 'fields', rows: rows.length ? rows : [{ label: 'Record', value: identity }] },
    ];
    if (hasDescription) {
        blocks.push({ type: 'spacer', height: 8 });
        blocks.push({ type: 'heading', text: 'Description', size: 12 });
        blocks.push({ type: 'text', text: '{{record.description}}' });
    }

    try {
        var templater = new x_1040823_template.Templater({ secure: true });
        var sysId = templater.createTemplate({
            name: label + ' summary',
            table: table,
            kind: 'document',
            description: 'Generated from the ' + label + ' table\'s fields.',
            body: {
                blocks: blocks,
                footer: { text: identity + ' · {{now.date}}', showPageNumbers: true },
            },
        });
        gs.addInfoMessage('Created the "' + label + ' summary" template. Change it in the designer, then save.');
        action.setRedirectURL('x_1040823_template_templater.do?view=edit&id=' + sysId);
    } catch (e) {
        gs.addErrorMessage(e.message);
        action.setRedirectURL(current);
    }
})();
```

Build and deploy (`npm run build && npm run deploy`), then open any table in **System Definition › Tables** and click **Create Templater template**.

What to notice:

- **`{ secure: true }`** makes the insert go through the template table's ACLs as the person who clicked. The button's `roles` and `condition` already limit it to editors, so the ACLs are a second check.
- **`action.setRedirectURL`** opens the designer on the new record (`?view=edit&id=<sys_id>`), and the person carries on from there.
- **The tokens are plain field names** (`{{record.priority}}`), so the PDF shows display values: a choice's label and a reference's display field.
- **Even simpler:** if you leave `body` out, `createTemplate` saves an empty body, and the designer fills in a starter from the table's fields when the template is first opened. That is the same starter the **New template** dialog gives you. Generate the body yourself, as above, when you want to choose the fields.

### Without the SDK

To add the same button directly on an instance, create a UI action on `sys_db_object` with **Form button** and **Show update** checked, set **Condition** to `gs.hasRole('x_1040823_template.editor')`, and paste the server script into **Script**. It works from global or any scope, because the `Templater` script include is public.

## Next steps

- Give the template a letterhead, a watermark or a cover in the designer. Those are easier to set visually than in JSON.
- Link to the generated template from a business rule or a notification with `exportUrl`. See [PDF links](../README.md#pdf-links).
- Build decks from a scheduled job with `templater.deck(...)`. See [Presentations](../README.md#presentations).
