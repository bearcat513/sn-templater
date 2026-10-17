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

## Presentations and the slide builder

A **presentation** is a deck you arrange and save. It is a record on `x_1040823_template_presentation` with these parts:

- the deck template it is built on
- which records get slides: a filter, a sort order and a limit
- a title
- a `body`: the custom slides and the running order, as JSON

Record slides are not stored. They are drawn from the template each time the presentation opens, against whatever the filter matches then. That means a presentation saved once shows this week's records next week.

To open the **slide builder**, use **Build slides** on the Present page, or **Edit** on a saved presentation. You can also open it from inside the presenter.

- **Arranging:** drag slides in the left-hand list to reorder them, or hide a slide so it is left out of the show and the PDF. Record slides can be moved and hidden; to change what is on one, edit the template.
- **Custom slides:** the **+** between any two slides inserts a custom slide there. Layouts are Blank, Title slide, Title and content, Section header, Two content and Title only. A custom slide uses the deck's page size, colours and fonts. Its prompts ("Click to add title") show only while editing.
- **Building a slide:**
  - Insert text boxes, shapes (rectangle, rounded rectangle, ellipse, triangle), lines, arrows and pictures. You can also drop a picture onto the slide.
  - Drag to move. Edges and centres snap to the slide and to each other; hold Alt to move freely.
  - Resize from the handles. Shift keeps proportions; a picture keeps them unless you hold Shift.
  - Drag either end of a line.
  - Double-click a shape to type in it.
- **Formatting:**
  - Text: font, size, bold, italic, underline, colour, horizontal and vertical alignment, bullets and line spacing.
  - Shapes and lines: fill, outline and weight, opacity, dashes and arrowheads.
  - Arranging elements: bring forward, send backward, align to the slide or to each other, distribute evenly.
  - Slides: a background and an optional letterhead, watermark and footer per slide.
- **Keys:**
  - Ctrl+Z / Ctrl+Y undo and redo. Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste, also between slides. Ctrl+D duplicates, and Ctrl+A selects everything on the slide.
  - Delete removes. The arrow keys nudge (with Shift, by 10). Enter types in the selected shape, and Ctrl+B / I / U format it.
  - Page Up / Page Down change slides. F5 presents from the start; Shift+F5 presents from the current slide. Ctrl+S saves.
- **Tokens:** a custom slide's text can use `{{deck.title}}`, `{{deck.count}}`, `{{table.label}}`, `{{now.date}}`, `{{user.name}}`, `{{slide.number}}` and `{{slide.count}}`. Slide numbers count only the slides that are shown.

**Running order:** the order is saved as slide keys (`cover:1`, `record:<sys_id>:1`, `custom:<id>`), not as positions. A record that no longer matches the filter drops out. A record that starts to match is placed among the other record slides, after the record it follows in the filter's own order.

**Who can change one:** every Templater user can open and present any presentation, and save their own. Only the author or a Templater editor can change or delete one. Anyone else gets **Save a copy**. Deleting a deck template keeps its presentations: their custom slides stay and can be moved onto another deck.

The presenter and the PDF export use the presentation's own order and leave hidden slides out. Custom slides are drawn by the same geometry on screen (`src/client/slides/Freeform.tsx`) and in the PDF (`src/client/engine/freeform.ts`).

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
  render.ts            PDF renderer: many records, cover, per-page furniture; arranged decks
  presentation.ts      saved presentations: custom slides, running order, layouts
  freeform.ts          custom slides into the PDF, and the geometry the screen shares
  validate.ts          drop-don't-refuse body reader
  vocabulary.ts        tokens to field paths and values
src/client/data/       loader: fetches only the fields and related lists a template uses
src/client/slides/     HTML renderer of the same template, custom slides, and the presenter
src/client/designer/   template designer (token panel, blocks, live preview)
src/client/builder/    slide builder: canvas, slide list, ribbon, inspector, undo
src/client/views/      Templates, Editor, Export, Present, Builder
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

- **Templater** application menu: Templates, Export to PDF, Present a deck (with saved presentations).
- `x_1040823_template_templater.do?view=present&presentation=<sys_id>` presents a saved presentation directly. "Copy link to present" on the Present page gives this link.
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
- A presentation can have up to 200 custom slides of up to 120 elements each. Its body, pictures included, can be up to 3,000,000 characters.
- Text on custom slides is not rotated, and shapes have no gradients or shadows. On screen, text wraps by the browser's font metrics and in the PDF by the standard 14 fonts' metrics, so a line can break a word earlier or later in one than in the other.
