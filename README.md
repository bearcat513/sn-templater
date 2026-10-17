# Templater

A ServiceNow SDK app for turning records into **formatted PDFs**, including their related lists, and into **slide decks** that can be presented in the browser or exported as PDF.

The templating engine is ported from [cpq-vibes](https://github.com/bearcat513/cpq-vibes): a hand-written PDF 1.7 writer, a JSON block language, and `{{token}}` substitution. It has no runtime dependencies. The UI uses only React and components written in this repo, with no UI or component libraries.

## How it works

- A **template** is a record on `x_1040823_template_template` with three parts:
  - `kind`: `document` or `deck`
  - `table`: the table it's for. Tables that extend it can use it too.
  - `body`: the canonical JSON describing the document.
- **Rendering happens in the browser.** The live preview and the downloaded file come from the same pure renderer (`src/client/engine/render.ts`), so the preview can't disagree with the file.
- **Data is read with the viewer's own session** through the Table API. A template can only show fields and related rows that its reader can already open.

### Tokens

| Token | Value |
| --- | --- |
| `{{record.<field>}}` | Display value. Dot-walks: `{{record.caller_id.email}}` |
| `{{raw.<field>}}` | Stored value (sys_id, choice value) |
| `{{table.label}}`, `{{table.name}}` | The record's table |
| `{{now.date}}`, `{{now.datetime}}` | When it was rendered, in the user's format |
| `{{user.name}}`, `{{user.email}}` | Who rendered it |
| `{{deck.title}}`, `{{deck.count}}`, `{{deck.index}}` | The batch |
| `{{list.count}}` | In a related list title: the number of rows matched |

A token that resolves to nothing renders blank, and the designer and the export screen both report it.

### Blocks

Heading, text, field list, columns, **related list**, stats, image, signatures, divider, spacer, and page break. Page-level features are the letterhead (logo plus text), a watermark, a footer with per-record page numbers, an optional cover page or title slide, and a house style.

## Starter templates

The app installs six ready-made templates, written against each table's base-system fields:

| Template | Kind | Table | Related lists |
| --- | --- | --- | --- |
| Incident report | PDF | `incident` | Incident tasks, SLAs, affected CIs, child incidents |
| Major incident review | Deck (dark) | `incident`, open P1 and P2 | Open incident tasks |
| Change request | PDF, with sign-off lines | `change_request` | Change tasks, approvals, affected CIs, impacted services |
| CAB review | Deck | `change_request`, approval requested | Approvals |
| Problem report | PDF | `problem` | Problem tasks, duplicate problems |
| Requested item | PDF | `sc_req_item` | Catalog tasks, approvals |

They also show in the **New template** dialog under "Start from", which creates an editable copy.

- **Source:** `src/client/engine/gallery.ts` is the only place they are defined, typed against the template language.
- **Generated files:** `npm run starters` (and `npm run build`, which runs it first) writes `src/fluent/templates/starters.now.ts` and one JSON body per template. Don't edit those by hand. The script needs Node 22.18 or later; on older Node it keeps the last generated files.
- **Customising:** the installed starters are app records, so each deploy resets them to the gallery. To customise one on the instance, duplicate it first.
- **Removing:** taking a template out of the gallery removes its record from the build, but not from instances where it's already installed.

## Layout

```
src/client/engine/     pure engine (pdf.ts, pdfFonts.ts, image.ts, imageFile.ts are ported verbatim)
  template.ts          block language, starters
  gallery.ts           the ready-made templates (source of the installed starters)
  render.ts            PDF renderer: many records, cover, per-page furniture
  validate.ts          drop-don't-refuse body reader
  vocabulary.ts        tokens to field paths and values
src/client/data/       loader: fetches only the fields and related lists a template uses
src/client/slides/     HTML renderer of the same template, and the presenter
src/client/designer/   template designer (token panel, blocks, live preview)
src/client/views/      Templates, Editor, Export, Present
src/client/ui/         custom components (no UI libraries)
src/server/            scripted REST: /schema/{table}, /tables, /me
src/fluent/            table, roles, ACLs, REST API, UI page, menu, UI actions
src/fluent/templates/  GENERATED starter template records (npm run starters)
scripts/               build-starters.mjs
```

## Roles

- `x_1040823_template.user`: use templates to export and present.
- `x_1040823_template.editor`: also create and change templates. Contains `user`.

## Entry points

- **Templater** application menu: Templates, Export to PDF, Present a deck.
- **Export with Templater**: a related link on any form, shown only where an active template applies.
- **Export / present with Templater**: a list action on selected rows.

## Debugging

Set the system property `x_1040823_template.debug` to `true` to turn on the developer tools. It is off by default, and only admins can change it.

- **In the page:** a bug button in the bottom-left corner opens a panel docked to the bottom of the window. `` Ctrl+` `` also opens and closes it. It has three tabs:
  - **Console:** app log lines (`http`, `loader`, `render`, `editor`, `route`, `toast`…), `console.*` calls, uncaught errors and unhandled rejections. You can filter by level and text, and click a line to open its data.
  - **Network:** every request the app makes, with status, size, total time and server time, plus headers, payload and response. The session token is redacted.
  - **State:** the current session, route, the template being edited, and the loaded export job or deck.
- The download button saves everything recorded as one JSON file you can attach to a bug report. While debugging is on, `window.templater` in the browser's own console exposes the logger and the recorded data.
- **On the server:** the scripted REST routes write their timings to the system log (`[Templater] … took Nms`) and send a `Server-Timing` header, which appears as the Network tab's Server column.
- The property is read when the page loads, so reload after changing it. Turned off, the page sends nothing extra and logs nothing.
- In code, use `log.info/warn/error/debug(source, message, data)` and `log.time(…)` from `src/client/debug/log.ts`, and `useInspect(name, value)` to show a value in the State tab.

The property is an app record, so each deploy resets it to `false`.

## Build and deploy

```bash
npm run build
npm run deploy
```

## Limits

- PDFs use the standard 14 fonts (WinAnsi), so text outside Latin-1 prints as `?`.
- Images must be PNG or JPEG. The picker flattens and re-encodes anything else in the browser.
- One render covers at most 500 records, and each related list at most 500 rows.
