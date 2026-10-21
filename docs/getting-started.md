# Getting started

Templater turns ServiceNow records into formatted PDFs and slide decks. This guide takes you from a fresh checkout to a PDF of an incident and a deck you can present.

## 1. Install the app

You need Node 22.18 or later, the ServiceNow SDK (installed as a dev dependency), and an instance you can deploy to.

```bash
npm install
npx now-sdk auth --add <instance-url>   # once per instance
npm run build                           # regenerates the starter templates, then now-sdk build
npm run deploy                          # now-sdk install
```

The app installs into the `x_1040823_template` scope. It adds the **Templater** application menu, two tables (`x_1040823_template_template` and `x_1040823_template_presentation`), the `Templater` script include, and six [starter templates](../README.md#starter-templates).

For local work on the UI, `npm run dev` serves the app through `now-sdk run dev`.

## 2. Give people roles

| Role | Can |
| --- | --- |
| `x_1040823_template.user` | Open Templater, read every template, export and present. |
| `x_1040823_template.editor` | Everything above, and create, change and delete templates. Contains `user`. |

Admins can do everything. Templater reads records with the viewer's own session, so a template only shows fields and related rows that the person can already open.

## 3. Export a record with a starter template

1. Open any incident.
2. Under **Related Links**, click **Export with Templater**. The link only shows on tables that have an active template.
3. Templater opens the **Export to PDF** screen in a new tab. Pick **Incident report** if it isn't already chosen, then click **Make the PDF**.
4. Click **Download** to save the file, or **Attach to record** to attach it to the incident.

To export several records, select them in a list and choose **Export / present with Templater** from the **Actions on selected rows** menu. Each record starts on a new page of the same PDF.

## 4. Make your own template

1. Go to **Templater › Templates** and click **New PDF template** (or **New slide deck**).
2. In the **New template** dialog, pick a **table** and either start from its fields or pick a starter under **Start from** to get an editable copy. Click **Create and design**.
3. Templater opens the designer with a live preview on the right:
   - Add blocks such as headings, field lists, related lists, stats, callouts and tables from the block list.
   - Drag a token from the token panel into any text, for example `{{record.short_description}}` or `{{record.caller_id.email}}`.
   - Use the picker above the preview ("Preview with a … record") to preview against real data.
4. Click **Save**. The template is now offered for that table, and for every table that extends it.

A token that resolves to nothing renders blank, and the designer lists it so you can fix it.

## 5. Present a deck

1. Go to **Templater › Present a deck**.
2. Pick a deck template, for example **Major incident review**, and adjust the filter, sort and limit if you need to.
3. Click **Start presenting**. Use the arrow keys or click to advance. Press **N** for speaker notes, **G** for an overview of all slides, **F** for full screen, and **Esc** to leave.

To arrange slides, add custom slides, or place several templates in one deck, use **Build slides**. You can save the result as a presentation that redraws its record slides each time it opens. See [Presentations and the slide builder](../README.md#presentations-and-the-slide-builder).

## 6. Automate it

Everything above can also be done from a server script through the `Templater` script include:

```js
var templater = new x_1040823_template.Templater();
var url = templater.exportUrl('Incident report', current, { absolute: true });
```

[Generating a template from code](templates-from-code.md) shows how to create templates from a background script and from a UI action. The README's [Scripting](../README.md#scripting) section covers links and presentations.

## Troubleshooting

- **No "Export with Templater" link:** the viewer needs `x_1040823_template.user`, and an active, non-chart template must exist for the table or a table it extends.
- **Blank values in the PDF:** the viewer can't read that field, or the field is empty. The export screen lists every token that came out blank.
- **`?` in place of characters:** PDFs use the standard 14 fonts, so text outside Latin-1 can't be printed.
- **Anything else:** set the system property `x_1040823_template.debug` to `true`, reload, and open the developer tools with `` Ctrl+` ``. See [Debugging](../README.md#debugging).
