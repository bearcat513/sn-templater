# Recommendations

A review of Templater, first written against ≈33k lines across `src/` and 13 commits, and since updated with what was implemented. The app is broad — documents, decks, charts, a slide builder, a script include, starter templates — and the code is careful and well commented. Most of what follows is about making that breadth safer to change and easier to use, rather than adding more surface.

Each item is tagged **[S]**, **[M]** or **[L]** for rough effort, and items within a section are ordered by how much I'd prioritise them.

**Status key:** ✅ done · 🟡 partly done · ⏭️ skipped by decision · ⬜ not started

## Status at a glance

| Section | Done | Partly | Skipped | Not started |
| --- | --- | --- | --- | --- |
| 1. UI / UX | 1.1–1.10 | — | — | — |
| 2. Code / project structure | 2.1, 2.2, 2.4 | 2.3, 2.5 | — | 2.6–2.10 |
| 3. Core functionality | 3.1–3.4 | — | — | 3.5–3.9 |
| 4. Net new functionality | 4.2, 4.4, 4.5 | 4.1 | 4.3 | 4.6–4.11 |
| 5. New recommendations | — | — | — | 5.1–5.16 |

**Verified locally:** `npm run check` (Prettier, ESLint, both typechecks, 114 Vitest tests) and `npm run build` pass. A generated Greek/Cyrillic/Polish PDF was checked with pypdf (strict parse and text extraction) and fontTools (subset validity).

**Not yet verified on an instance:** nothing below has been deployed. See [5.1](#5-new-recommendations) for what to test first.

---

## 1. UI / UX

1. ✅ **Warn before overwriting someone else's changes [M].** Saves were a plain `PATCH` with no check that the record was unchanged since it was opened, so two editors on the same template silently lost work.
   - **Done:** templates, charts and presentations read `sys_mod_count` on load and check it before saving (`assertUnchanged` in `services/http.ts`). On a mismatch, `ui/ConflictModal.tsx` offers *Load theirs*, *Save mine over theirs* or *Save mine as a copy*.
2. ✅ **Autosave drafts locally [S].** A crash, an expired session or a closed laptop lost everything the `beforeunload` guard didn't catch.
   - **Done:** `data/localDrafts.ts` and `hooks/useLocalDraft.ts` keep unsaved work in `localStorage`, keyed by record sys_id. The template, chart and presentation editors offer it back on the next open, and clear it on save or deliberate discard. Storage failures are logged and ignored.
3. ✅ **Make the session-expiry path recoverable [S].** A 401 used to say "reload the page", which threw away unsaved edits.
   - **Done:** a 401 first tries a fresh session token read from the page's own HTML. Failing that, `ui/SessionExpired.tsx` asks the person to sign in in another tab and choose *Try again*. The waiting request (a save, an export) is then sent again, with nothing on screen lost.
4. ✅ **Template list: sort, group and preview [M].**
   - **Done:** sort by name, recently changed or table; group by table (both remembered in the browser). Each card has a thumbnail of the first page or slide, drawn lazily as it scrolls into view and cached per version (`views/TemplateThumbnail.tsx`). Cards also show draft and version badges.
5. ✅ **Show *where* a chart template is used [S].**
   - **Done:** `TemplateService.chartUsages` searches template bodies, drafts and presentation bodies for the chart's sys_id. The list appears in the chart designer, in the publish dialog and in the delete confirmation.
6. ✅ **First-run guidance in the designer [M].**
   - **Done:** a dismissible *Getting started* checklist (`designer/GettingStarted.tsx`) ticks itself off as the template gains fields, a related list and a previewed record. The token panel has clickable examples and the full formatter list.
7. ✅ **Accessibility pass [M].**
   - **Done:**
     - Alt+↑/↓ moves the focused slide or section in the sorter, with a live announcement.
     - Canvas elements are focusable with Tab and selected on keyboard focus.
     - `:focus-visible` outlines everywhere.
     - Failure toasts use `role="alert"`, and field errors are announced.
     - The fallback colours for subtle and positive text were darkened to meet WCAG AA (4.5:1) on every surface they sit on.
   - **Not covered:** contrast under the instance's own Horizon themes (light and dark), which supply most of the colours. See 5.13.
8. ✅ **Responsive limits should be explicit [S].**
   - **Done:** below 1100px (builder) and 900px (designer), the editor is hidden and `ui/NarrowNotice.tsx` explains why, with buttons for what still works (present, PDF, settings, export).
9. ✅ **Export progress and cancellation [S].**
   - **Done:** a determinate progress bar ("Reading related lists — 120 of 480") with phases and a *Cancel* button wired to the loader's `AbortSignal` (`ui/Progress.tsx`).
10. ✅ **Unify the "problems" surface [S].**
    - **Done:** `ui/ProblemsPanel.tsx` groups blank tokens, things not drawn as asked, and records left out. It is used in the export view and the designer preview.

---

## 2. Code / project structure

1. ✅ **Add automated tests, starting with the pure engine [M].**
   - **Done:** Vitest, with 114 tests under `src/client/engine/__tests__/`. They cover:
     - tokens and formatters, links, the validator and vocabulary
     - running-order merging, chart layout and block expansion
     - version diffs and Unicode fonts
     - golden renders of all six starters (the text drawn plus a layout fingerprint)
   - **Not done:** property-based tests of the running order, and tests outside the engine. See 5.6.
2. ✅ **Add `typecheck`, `lint` and `format` scripts, and CI [S].**
   - **Done:**
     - `npm run typecheck|lint|format|format:check|test|check`.
     - ESLint 9 with typescript-eslint and the React hooks rules. They immediately found a real crash: `ChartFields` called hooks conditionally when switching to a chart template.
     - Prettier configs matching the two existing house styles (app and engine).
     - `.github/workflows/ci.yml`, which runs the checks plus `now-sdk build --frozenKeys`.
   - **Note:** formatting was applied once across the codebase, which accounts for much of the diff.
3. 🟡 **Break up the largest views [M].**
   - **Done:** `BuilderView.tsx` went from ~1,600 to ~930 lines. Its dialogs, section panels, `Fit`, section loading (`useSectionDecks`), slide-editing state (`useSlideEditor`) and keyboard handling (`useBuilderKeys`) now live in `builder/`.
   - **Remaining:** a reducer-based builder state, and splitting `Inspector.tsx`, `SlideView.tsx` and `SlideCanvas.tsx`. See 5.7.
4. ✅ **Split the engine's largest files by concern [M].**
   - **Done:** `chart.ts` is now a dispatcher over `chart/data.ts`, `chart/shared.ts` and one file per kind; the golden renders were byte-identical before and after. Template and render types moved to `engine/types.ts`, and both modules re-export them.
5. 🟡 **Pick one package manager [S].**
   - **Done:** Bun is the installer (`bun.lock`, CI uses `bun install --frozen-lockfile`) and the README says so.
   - **Remaining:** scripts are still invoked as `npm run …`, and there is no `engines` field (the starters script needs Node ≥ 22.18).
6. ⬜ **Validate bodies with a shared schema [M].** `validate.ts` hand-reads JSON on the client, and `templater.server.js` accepts bodies from scripts unchecked. Define the body shape once (e.g. a JSON Schema generated from `engine/types.ts`) and use it in both places. This is now more pressing: scripts can store `when` conditions and `repeat` blocks the server never checks.
7. ⬜ **Version the body format [S].** Add a `version` field to template and presentation bodies and a migration step in `validate.ts`. The block language grew this round (conditions, repeats, picture references) without one.
8. ⬜ **Write meaningful commit messages and tag releases [S].** Every commit is titled `.`. Adopt conventional commits and bump the `0.0.1` version on each deploy.
9. ⬜ **Port the server script include to TypeScript [M].** `templater.server.js` is ~1,170 lines of untyped JS; the new Flow action scripts (`src/fluent/actions/scripts/`) add three more untyped files. Both are excluded from Prettier and ESLint today.
10. ⬜ **Centralise constants [S].** Role names, table names and limits are still repeated across client, server, Fluent and action scripts. This round added more: the version table name, the email route path, and the picture prefix.

---

## 3. Core functionality

1. ✅ **Unicode text in PDFs [L].**
   - **Done:** Noto Sans (four styles, SIL OFL) is embedded as a CID font with a ToUnicode map.
     - Text the standard fonts can set stays in them, and only the rest uses the embedded subset.
     - The TrueType reader and subsetter (`engine/fonts/truetype.ts`) are written in-repo, keeping the single-dependency rule.
     - Fonts load lazily as separate chunks, only when a render needs them.
   - **Remaining:** CJK and other scripts, and serif/monospace faces. See 5.9.
2. ✅ **Store pictures as attachments, not data URLs [M].**
   - **Done:** pictures are attachments named by a hash of their content and referenced as `attachment:templater-<hash>.png`. They are swapped back into the body when it is read (`data/pictures.ts`) and uploaded once when it is saved.
     - Old data-URL bodies still work and migrate on their next save.
     - The client's *Duplicate* and the script include's `copyTemplate` copy the attachments too.
   - **Remaining:** cleanup of attachments no longer used by any version. See 5.4.
3. ✅ **Template version history and restore [M].**
   - **Done:**
     - A new `x_1040823_template_version` table, filled by the business rule *Number template versions* whenever `body` changes (designer, script or form).
     - A *History* tab that describes what changed between any version and the editor (`engine/diff.ts`), and restores a version into the editor.
     - Editor-only read ACL.
4. ✅ **Draft vs. published templates [M].**
   - **Done:** *Save* writes `draft_body` and *Publish* moves it to `body`, with an optional note kept on the version. A template unpublished since creation publishes on its first save. *Discard unpublished changes* drops the draft. Exports, decks and presentations always use the published body.
   - Chart templates follow the same model.
5. ⬜ **Server-side rendering for unattended use [L].** Still the largest gap. It blocks scheduled reports (4.3), batch emailing (5.3) and a *Render to attachment* Flow action. The engine is pure TypeScript and, with the fonts now loadable as modules, is a reasonable candidate for bundling as a server module.
6. ⬜ **Raise or stream the 500-record limit [M].** Unchanged. Exports can now be cancelled, which makes the cap less painful but doesn't lift it.
7. ⬜ **Cache schema and chart counts per session [S].** Unchanged. Thumbnails add one template read per visible card; they are cached in memory only (see 5.12).
8. 🟡 **Locale-aware numbers and dates [S].**
   - **Done:** the new `number` and `date` token formatters use `Intl` in the reader's locale.
   - **Remaining:** chart axis labels and stat blocks still use fixed formats, and the browser's time zone is used rather than the user's ServiceNow time zone. See 5.10.
9. ⬜ **Harden the related-list query path [S].** Unchanged. Repeat blocks reuse the related-list loader and so inherit its parent-link check, but template-level and chart filters still lack it.

---

## 4. Net new functionality

1. 🟡 **Send / attach from the export view [M].**
   - **Done:** a single-record export can be attached to its record (once, even if clicked twice). *Email…* attaches it if needed and sends a link to the attachment through a new scripted REST route (`POST /email`). The route checks that the sender can read the record and that the attachment is that record's.
   - **Decision:** link only, no file in the email.
   - **Remaining:** batch exports have no record to attach to, so they cannot be emailed yet (see 5.3).
2. ✅ **Flow Designer actions [M].**
   - **Done:** three actions in a *Templater* category, built on the script include:
     - *Get Templater export link*
     - *Create Templater presentation*
     - *Add slide to Templater presentation*
   - *Render template to attachment* waits on 3.5.
3. ⏭️ **Scheduled decks and reports [M].** Skipped by decision until server-side rendering (3.5) exists.
4. ✅ **Conditional and repeating blocks [M].**
   - **Done:**
     - Any block can carry *Show only when…* (empty, not empty, is, is not, contains, more than, less than; case-insensitive, tokens on both sides).
     - A new **Repeat** block draws its own blocks once per related record, with `{{row.<field>}}`, `{{row.raw.<field>}}`, `{{row.index}}` and `{{row.count}}`.
     - Expansion is a pure pre-pass (`engine/expand.ts`) used by the PDF renderer, the screen renderer and slide pagination, so a page break inside a repeat gives a slide per row.
     - Row values cannot inject tokens.
5. ✅ **Computed tokens / formatters [S].**
   - **Done:** `upper`, `lower`, `title`, `trim`, `default`, `truncate`, `date`, `number`, `duration` and `yesno`, chainable left to right. The first formatter reads the field's stored value where that helps.
6. ⬜ **Import and export templates as files [S].** The designer's JSON card already copies, downloads and pastes a body. What is missing is metadata (name, table, kind, filter) and bundling pictures into the file.
7. ⬜ **Export to other formats [L].** PPTX for decks, DOCX/HTML for documents.
8. ⬜ **Collaboration on presentations [M].** Comments on slides, sharing with named users or groups, and a "follow along" presenter link.
9. ⬜ **More starter templates and a template gallery page [S].** HR cases, CSM cases, knowledge articles and CMDB CIs. The new thumbnails make a browsable gallery page cheap.
10. ⬜ **Usage analytics for template owners [S].** Exports and presentations per template.
11. ⬜ **Digital signatures / approval capture [L].** Stamping real approvals into change and CAB packs.

---

## 5. New recommendations

These come out of the work above: things it made possible, things it left unfinished, and risks it introduced.

1. **Test the new server-side pieces on an instance before relying on them [S].** In order of risk:
   - **Session token refresh:** the pattern `g_ck = '…'` in the UI page's HTML is an assumption. If it doesn't match, recovery falls back to "reload the page".
   - **Font chunks:** that they load through dynamic `import()` from `/uxasset`.
   - **Email:** that `GlideEmailOutbound` sends from the scoped REST route.
   - **Business rule:** that *Number template versions* fires on Table API PATCHes and not on app install.
   - **Presentation pictures:** that authors who aren't editors can attach pictures to their own presentations (the `sys_attachment` create ACL).
   - **Flow actions:** run each of the three in a test flow.
2. **Add ATF tests for the server side [M].** The Vitest suite covers only the browser engine. Add ATF tests for:
   - the version business rule (version numbers, `has_draft`, the note being cleared)
   - the `/email` route's refusals (an unreadable record, a foreign attachment, bad addresses)
   - the template, version and presentation ACLs
   - the Flow actions
   Run them from CI with `now-sdk cicd`.
3. **Email batch exports through a delivery record [M].** A batch PDF has no record to attach to. A small `x_1040823_template_delivery` table (sender, recipients, template, query, sent on) can hold the attachment, with its own read ACL. That makes batch emails possible and gives an audit trail of what was sent.
4. **Clean up unused picture attachments [S].** Pictures are never deleted, so templates whose logos change accumulate attachments. A weekly scheduled job could delete `templater-*` attachments that no body, draft or version still names. Pictures named only by versions older than a retention limit could go too.
5. **Make the conflict check atomic [S].** The `sys_mod_count` comparison is a separate GET before the PATCH, leaving a request-long window. A scripted REST route that compares and writes in one transaction (or a before-update business rule given the expected count) would close it.
6. **Test the UI, not only the engine [M].** Add component tests (Vitest with jsdom and Testing Library) for:
   - the publish/draft flow
   - restoring a local draft
   - the conflict and session dialogs
   - keyboard reordering
   Add a few Playwright smoke tests against a PDI for export, present and save.
7. **Finish the builder refactor [M].** Remaining from 2.3:
   - Move presentation body changes into a reducer whose actions are `builder/operations.ts`, which makes undo testable.
   - Extract saving and loading into `useBuilderPersistence`.
   - Split `Inspector.tsx` (~990 lines), `SlideView.tsx` and `SlideCanvas.tsx` by element type.
8. **Keep local drafts small [S].** Local copies are stored with pictures inlined as data URLs, so a presentation with large images can exceed the browser's storage quota; that is caught, and the copy is skipped. Storing the draft with `attachment:` references (pictures already uploaded) or IndexedDB would keep the safety net for picture-heavy decks.
9. **Widen font coverage [L].**
   - Add Noto Serif and Noto Sans Mono, so `times` and `courier` templates keep their look for non-Latin text.
   - Optionally add CJK (large; load per script).
   - Basic kerning from the `kern`/`GPOS` tables would improve the look of embedded text.
   - Strip source maps from the font chunks; they currently ship ~575 KB of maps each.
10. **Use the user's ServiceNow time zone and locale [S].** The `date` formatter and charts use the browser's time zone and locale. `/me` could return the user's time zone, date format and language, and formatters could use them, so a PDF made from a laptop in another time zone still matches the instance.
11. **Richer conditions [S].** Conditions are single comparisons. Allow *all of* / *any of* groups, conditions on whole sections (cover, letterhead, watermark), and a condition on a repeat's rows (a filter in addition to the encoded query).
12. **Thumbnails that last [S].**
    - Cache rendered thumbnails across sessions, keyed by sys_id and version, e.g. in IndexedDB.
    - Give chart templates thumbnails from their last count.
    - Add a "preview larger" on hover.
13. **Accessibility follow-ups [M].**
    - Check contrast under the instance's Horizon light and dark themes.
    - Add screen-reader text for slide thumbnails and chart marks (a data table alternative).
    - Make the canvas's resize handles operable from the keyboard; resizing is inspector-only today.
14. **Drafts and versions for presentations [M].** Presentations still save straight over themselves. The same draft/publish model, with history, would protect decks that others present from a shared link.
15. **Let scripts work with drafts [S].** The script include and Flow actions only see published bodies. Add `getDraft`, `publish(template, note)` and `versions(template)`, so automations can stage and publish changes the way the designer does.
16. **Server-side protection of the template body [S].** `body` can still be edited on the form or through the Table API by editors, bypassing the validator. A before business rule that rejects unreadable JSON — or better, the shared schema from 2.6 — would stop a hand edit from breaking every export.
