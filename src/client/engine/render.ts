/**
 * Draws a template against records, as a PDF.
 *
 * Ported from cpq-vibes' `renderPdfDocument` (src/lib/pdfTemplate.ts). It is
 * pure — no I/O, no clock beyond what the caller passes in — so the editor's
 * live preview and the file a person downloads are the same bytes. A template
 * editor whose preview can disagree with the file is worse than no preview.
 *
 * The one structural change from the original is that a render takes a *list*
 * of records. A document of one record is the common case; a batch export is
 * the same template once per record, each starting a fresh page; a deck is the
 * same again on slide-sized paper. Page furniture — letterhead, watermark,
 * footer — is resolved per page against the record that owns it, so a footer
 * reading `{{record.number}}` is right on every page of a fifty-record file.
 */
import { chartData, layoutChart, type ChartScene, type ChartStyle } from "./chart";
import { renderCustomSlide } from "./freeform";
import { decodeImage, imageBox, type EmbeddableImage } from "./image";
import { recordUrl, safeUrl } from "./links";
import { PdfDocument, DEFAULT_MARGINS, type TableCell, type TableColumn } from "./pdf";
import { measureText, type FontFamily } from "./pdfFonts";
import type { CustomSlide } from "./presentation";
import { fillTokens } from "./tokens";
import {
  DEFAULT_PAGE,
  blockStrings,
  calloutColors,
  defaultStyle,
  referenceToken,
  relatedKey,
  templateStrings,
  type BlockAlign,
  type ChartBlock,
  type CodeBlock,
  type PdfBlock,
  type PdfHeader,
  type PdfPageSetup,
  type PdfStyle,
  type PdfTemplate,
  type ReferenceBlock,
  type RelatedListBlock,
} from "./template";

/* -------------------------------- sources -------------------------------- */

/** The rows behind one related-list block, for one record. */
export type RelatedRows = {
  /** One map per row: field path to display value. */
  rows: Record<string, string>[];
  /** Rows that matched, which may be more than were fetched. */
  total: number;
  /** Why the rows could not be read, when they could not. */
  error?: string;
};

/** One record, as the renderer sees it: strings, and nothing it could compute with. */
export type RecordSource = {
  /** What the editor calls the record — its number, usually. */
  label: string;
  /** Every token value: record.*, raw.*, and the context tokens. */
  values: Record<string, string>;
  /** Related-list rows, by `relatedKey(block)`. */
  related: Record<string, RelatedRows>;
};

export type RenderJob = {
  /** The file's own metadata. */
  title: string;
  author: string;
  subject: string;
  records: RecordSource[];
  /** Token values for the cover, which belongs to the batch rather than a record. */
  coverValues: Record<string, string>;
};

/**
 * One slide of an arranged deck, as the renderer needs it: a run of the
 * template's blocks against a record, or a custom slide. `slides/paginate.ts`
 * makes these; a presentation puts them in its own order.
 */
export type SlideSource = {
  /** -1 for the cover, a record's index, or below -1 for a custom slide. */
  owner: number;
  blocks: PdfBlock[];
  custom?: CustomSlide;
  values: Record<string, string>;
  related: Record<string, RelatedRows>;
};

export type PdfRenderResult = {
  bytes: Uint8Array;
  /** Tokens the template used that resolved to nothing. Rendered as blank. */
  unknownTokens: string[];
  /** Pictures and related lists that could not be drawn, each as a sentence. */
  problems: string[];
  pageCount: number;
};

/* ------------------------------- rendering ------------------------------- */

const alignOf = (align: BlockAlign | undefined): "left" | "center" | "right" => align ?? "left";

/** The page setup a template resolves to, defaults filled in. */
export function resolvePage(template: PdfTemplate): PdfPageSetup {
  return { ...DEFAULT_PAGE, ...template.page, margins: { ...DEFAULT_MARGINS, ...template.page?.margins } };
}

/** The style a template resolves to, defaults filled in. */
export function resolveStyle(template: PdfTemplate, fontSize: number): PdfStyle {
  const fallback = defaultStyle(fontSize);
  return { ...fallback, ...template.style, table: { ...fallback.table, ...template.style?.table } };
}

type PictureResolver = (source: string, what: string) => EmbeddableImage | null;

type RenderContext = {
  document: PdfDocument;
  page: PdfPageSetup;
  style: PdfStyle;
  fill: (text: string, extra?: Record<string, string>) => string;
  /** The section's own values, for what is looked up rather than filled — a sys_id, the instance. */
  values: Record<string, string>;
  related: Record<string, RelatedRows>;
  picture: PictureResolver;
  problems: Set<string>;
};

/**
 * Draws a template against a batch of records.
 *
 * The cover, when the template has one, is drawn first against the batch's
 * values; then each record, each starting on its own page. A batch with no
 * records still produces a file — one page saying so — because an empty
 * download with no explanation is the least useful thing this could do.
 */
export function renderPdfDocument(template: PdfTemplate, job: RenderJob): PdfRenderResult {
  const sections: SlideSource[] = [];
  if (template.cover?.length) {
    sections.push({ owner: -1, blocks: template.cover, values: job.coverValues, related: {} });
  }
  job.records.forEach((record, index) =>
    sections.push({ owner: index, blocks: template.blocks, values: record.values, related: record.related }),
  );
  return renderSections(template, job, sections, "No records matched.");
}

/**
 * Draws an arranged deck: each slide on its own page, in the order given.
 *
 * What a presentation exports — its own running order, hidden slides already
 * left out, custom slides drawn where they were slotted in. A record slide
 * that holds more than a page flows onto the next, as it does in a document.
 */
export function renderPdfSlides(template: PdfTemplate, job: RenderJob, slides: SlideSource[]): PdfRenderResult {
  return renderSections(template, job, slides, "No slides to show.");
}

/** What each page of the file is, for the furniture drawn over it once they all exist. */
type PageInfo = {
  owner: number;
  values: Record<string, string>;
  /** Letterhead, watermark and footer. A custom slide has them only when asked. */
  furniture: boolean;
  background?: string;
};

function renderSections(
  template: PdfTemplate,
  job: RenderJob,
  sections: SlideSource[],
  emptyText: string,
): PdfRenderResult {
  const page = resolvePage(template);
  const style = resolveStyle(template, page.fontSize);
  const unknown = new Set<string>();
  const problems = new Set<string>();

  /*
   * Decoded once per render however many pages use a picture. A failure is
   * cached as its own message, so a second block with the same broken picture
   * is reported against that block and the first is not reported twice.
   */
  const pictures = new Map<string, EmbeddableImage | string>();
  const picture: PictureResolver = (source, what) => {
    if (!source) return null;
    let entry = pictures.get(source);
    if (entry === undefined) {
      const decoded = decodeImage(source);
      entry = decoded.ok ? decoded.image : decoded.error;
      pictures.set(source, entry);
    }
    if (typeof entry === "string") {
      problems.add(`${what}: ${entry}`);
      return null;
    }
    return entry;
  };

  const document = new PdfDocument({
    size: page.size,
    landscape: page.landscape,
    margins: page.margins,
    family: page.family,
    fontSize: page.fontSize,
    color: page.textColor,
    title: job.title,
    author: job.author,
    subject: job.subject,
  });

  const filler =
    (values: Record<string, string>) =>
    (text: string, extra?: Record<string, string>): string =>
      fillTokens(text, extra ? { ...values, ...extra } : values, unknown);

  /* --- the flow: a section per slide (or per record), each on a fresh page --- */

  // What each page belongs to: the cover (-1), a record, or a custom slide.
  const pages: PageInfo[] = [];
  const claim = (info: PageInfo) => {
    while (pages.length < document.pageCount) pages.push(info);
  };
  let started = false;

  for (const section of sections) {
    if (started) document.addPage();
    started = true;
    const fill = filler(section.values);
    if (section.custom) {
      renderCustomSlide(section.custom, {
        document,
        family: page.family,
        fill,
        picture,
        base: section.values["url.instance"],
      });
    } else {
      const context: RenderContext = {
        document,
        page,
        style,
        fill,
        values: section.values,
        related: section.related,
        picture,
        problems,
      };
      for (const block of section.blocks) renderBlock(block, context);
    }
    claim({
      owner: section.owner,
      values: section.values,
      furniture: !section.custom || section.custom.furniture === true,
      background: section.custom?.background ?? page.background,
    });
  }

  if (!started) {
    document.text(emptyText, { color: page.mutedColor, size: page.fontSize + 2 });
    claim({ owner: -1, values: job.coverValues, furniture: true, background: page.background });
  }

  /* --- page furniture, once every page exists --- */

  const infoOn = (pageNumber: number): PageInfo => pages[pageNumber - 1] ?? pages[0]!;
  const owners = pages.map(info => info.owner);
  const fillOn = (pageNumber: number, text: string) => filler(infoOn(pageNumber).values)(text);
  const furnished = (pageNumber: number) => infoOn(pageNumber).furniture;

  // Registered before the background: the later of two "beneath" overlays is
  // drawn under the earlier, and the paper has to be under everything.
  if (template.watermark?.text) {
    const watermark = template.watermark;
    document.onEachPage(
      (doc, current) => {
        if (!furnished(current)) return;
        const text = fillOn(current, watermark.text);
        doc.drawWatermark(watermark.uppercase ? text.toUpperCase() : text, {
          color: watermark.color ?? page.accentColor,
          size: watermark.size,
          opacity: watermark.opacity,
          angle: watermark.angle,
          family: page.family,
        });
      },
      { beneath: true },
    );
  }

  // White paper needs no drawing; any other sheet — the template's, or a custom slide's own — does.
  const painted = (color: string | undefined): color is string => Boolean(color) && !/^#?f{3}(f{3})?$/i.test(color!);
  if (pages.some(info => painted(info.background))) {
    document.onEachPage(
      (doc, current) => {
        const background = infoOn(current).background;
        if (painted(background)) doc.drawRect(0, 0, doc.width, doc.height, background);
      },
      { beneath: true },
    );
  }

  // "First page only" means the first page of each record's section: a batch
  // of letters is letterheaded on every letter, not only on the first.
  const sectionStart = (pageNumber: number) =>
    pageNumber === 1 || owners[pageNumber - 1] !== owners[pageNumber - 2];
  renderHeader(template.header, { document, page, fillOn, picture, sectionStart, furnished });

  const showPageNumbers = template.footer?.showPageNumbers !== false;
  if (template.footer?.text || showPageNumbers) {
    document.onEachPage((doc, current) => {
      if (!furnished(current)) return;
      const y = doc.y;
      const size = Math.max(6, page.fontSize - 2);
      const text = template.footer?.text ? fillOn(current, template.footer.text) : "";
      if (text) doc.drawTextAt(text, doc.left, y, { size, color: page.mutedColor });

      if (showPageNumbers) {
        // Numbered within the record's own section, so a batch of fifty
        // incidents reads "Page 1 of 2" on each rather than "Page 37 of 100" —
        // counted rather than subtracted, because an arranged deck can put a
        // custom slide between a record's two pages.
        const owner = owners[current - 1];
        const number = owners.slice(0, current).filter(entry => entry === owner).length;
        const count = owners.filter(entry => entry === owner).length;
        const label = `Page ${number} of ${count}`;
        doc.drawTextAt(label, doc.left + doc.contentWidth - measureText(label, page.family, size), y, {
          size,
          color: page.mutedColor,
        });
      }
    });
  }

  const bytes = document.toBytes();
  return {
    bytes,
    unknownTokens: [...unknown].sort(),
    problems: [...problems].sort(),
    pageCount: document.pageCount,
  };
}

/* ------------------------------ the letterhead --------------------------- */

/** Space kept between the letterhead and the first line of content. */
const HEADER_GAP = 20;

/**
 * Draws the letterhead into the top margin of every page.
 *
 * Both halves are bottom-aligned to the same line, so a tall logo and a
 * three-line address sit on a common baseline rather than drifting apart. The
 * text is filled per page, against whichever record owns it.
 */
function renderHeader(
  header: PdfHeader | undefined,
  context: {
    document: PdfDocument;
    page: PdfPageSetup;
    fillOn: (page: number, text: string) => string;
    picture: PictureResolver;
    sectionStart: (page: number) => boolean;
    furnished: (page: number) => boolean;
  },
): void {
  const { document, page } = context;
  if (!header) return;

  const logo = header.logo ? context.picture(header.logo, "The letterhead logo") : null;
  if (!logo && !header.text && !header.rule) return;

  const band = Math.max(0, page.margins.top - HEADER_GAP);
  const baseline = page.margins.top - HEADER_GAP;
  const logoOnLeft = header.logoAlign !== "right";
  const size = Math.max(6, page.fontSize - 1.5);
  const lineHeight = size * 1.35;

  let logoWidth = 0;
  let logoHeight = 0;
  if (logo) {
    const box = imageBox(logo, Math.min(header.logoWidth ?? 110, document.contentWidth));
    const scale = box.height > band && band > 0 ? band / box.height : 1;
    logoWidth = box.width * scale;
    logoHeight = box.height * scale;
  }

  document.onEachPage((doc, current) => {
    if (!context.furnished(current)) return;
    if (header.firstPageOnly && !context.sectionStart(current)) return;

    if (logo && logoHeight > 0) {
      const x = logoOnLeft ? doc.left : doc.left + doc.contentWidth - logoWidth;
      doc.drawImageAt(logo, x, baseline - logoHeight, logoWidth, logoHeight);
    }

    const text = header.text ? context.fillOn(current, header.text) : "";
    const lines = text ? text.split("\n") : [];
    const textHeight = lines.length * lineHeight;
    lines.forEach((line, index) => {
      const width = measureText(line, page.family, size);
      const x = logoOnLeft ? doc.left + doc.contentWidth - width : doc.left;
      doc.drawTextAt(line, x, baseline - textHeight + index * lineHeight, {
        size,
        color: header.color ?? page.mutedColor,
      });
    });

    if (header.rule) {
      doc.drawRule(baseline + HEADER_GAP / 3, { color: page.accentColor, thickness: 0.75 });
    }
  });
}

/* --------------------------------- blocks -------------------------------- */

function renderBlock(block: PdfBlock, context: RenderContext): void {
  const { document, page, style, fill } = context;

  switch (block.type) {
    case "heading": {
      const text = fill(block.text);
      document.text(style.headingUppercase ? text.toUpperCase() : text, {
        size: block.size ?? page.fontSize * style.headingScale,
        bold: true,
        color: block.color ?? page.accentColor,
        align: alignOf(block.align),
        spaceAfter: block.spaceAfter ?? style.paragraphSpacing,
        ...(style.headingFamily ? { family: style.headingFamily } : {}),
        lineHeight: Math.max(1, style.lineHeight - 0.1),
      });
      break;
    }

    case "text": {
      document.text(fill(block.text), {
        size: block.size ?? page.fontSize,
        bold: block.bold,
        italic: block.italic,
        color: block.color ?? page.textColor,
        align: alignOf(block.align),
        spaceAfter: block.spaceAfter ?? style.paragraphSpacing,
        lineHeight: style.lineHeight,
      });
      break;
    }

    case "image": {
      const image = context.picture(block.source, "An image block");
      if (!image) break;

      document.image(image, {
        width: block.width || 120,
        align: alignOf(block.align),
        spaceAfter: block.caption ? 2 : (block.spaceAfter ?? 6),
      });

      if (block.caption) {
        document.text(fill(block.caption), {
          size: page.fontSize - 2,
          color: page.mutedColor,
          align: alignOf(block.align),
          spaceAfter: block.spaceAfter ?? 6,
          lineHeight: style.lineHeight,
        });
      }
      break;
    }

    case "spacer": {
      document.moveDown(Math.max(0, Math.min(block.height, 400)));
      break;
    }

    case "divider": {
      document.rule({ color: block.color ?? style.ruleColor, thickness: block.thickness ?? 0.75 });
      break;
    }

    case "columns": {
      const columns = block.columns.length ? block.columns : [{ text: "" }];
      const gap = block.gap ?? 16;
      const width = (document.contentWidth - gap * (columns.length - 1)) / columns.length;
      const top = document.y;
      let tallest = 0;

      columns.forEach((column, index) => {
        const x = document.left + index * (width + gap);
        document.y = top;

        if (column.heading) {
          document.text(
            fill(column.heading),
            { size: page.fontSize - 1.5, bold: true, color: page.mutedColor, align: alignOf(column.align), spaceAfter: 2 },
            { x, width },
          );
        }

        document.text(
          fill(column.text),
          { size: page.fontSize, color: page.textColor, align: alignOf(column.align), lineHeight: style.lineHeight },
          { x, width },
        );

        tallest = Math.max(tallest, document.y - top);
      });

      // Every column started at the same y, so the block ends below the
      // longest of them rather than below whichever was drawn last.
      document.y = top + tallest;
      document.moveDown(6);
      break;
    }

    case "fields": {
      const rows = block.rows.filter(row => row.label || row.value);
      if (!rows.length) break;

      const labelWidth = Math.min(160, document.contentWidth * 0.35);
      const valueWidth = document.contentWidth - labelWidth;

      for (const row of rows) {
        const minimum = page.fontSize * 1.5;
        document.ensureRoom(minimum);
        const y = document.y;

        document.drawTextAt(fill(row.label), document.left, y, { size: page.fontSize, color: page.mutedColor });

        // Through `text` rather than `drawTextAt`: a value can be a whole
        // description, and drawn as one string its lines would run together.
        document.y = y;
        document.text(
          fill(row.value),
          { size: page.fontSize, color: page.textColor, lineHeight: style.lineHeight },
          { x: document.left + labelWidth, width: valueWidth },
        );

        document.y = Math.max(document.y, y + minimum);
      }
      document.moveDown(4);
      break;
    }

    case "relatedList": {
      renderRelatedList(block, context);
      break;
    }

    case "stats": {
      const items = block.items.slice(0, 6);
      if (!items.length) break;

      const gap = 16;
      const width = (document.contentWidth - gap * (items.length - 1)) / items.length;
      const labelSize = Math.max(6, page.fontSize * 0.75);
      const valueSize = page.fontSize * 1.9;
      const accent = block.color ?? page.accentColor;

      // A row of figures is read across, so it moves as one.
      document.ensureRoom(10 + labelSize * 1.6 + valueSize * 1.3);
      const top = document.y;
      let tallest = 0;

      items.forEach((item, index) => {
        const x = document.left + index * (width + gap);
        document.drawRule(top, { color: accent, thickness: 2, from: x, to: x + width });
        document.y = top + 8;
        document.text(
          fill(item.label).toUpperCase(),
          { size: labelSize, bold: true, color: page.mutedColor, spaceAfter: 3 },
          { x, width },
        );
        document.text(
          fill(item.value),
          { size: valueSize, bold: true, color: page.textColor, lineHeight: 1.15 },
          { x, width },
        );
        tallest = Math.max(tallest, document.y - top);
      });

      document.y = top + tallest;
      document.moveDown(10);
      break;
    }

    case "signatures": {
      const parties = block.parties.length ? block.parties : [{ label: "Signature" }];
      const gap = 24;
      const width = (document.contentWidth - gap * (parties.length - 1)) / parties.length;

      // A signature block split across a page break is useless, so it moves
      // whole or not at all.
      document.ensureRoom(58);
      document.moveDown(18);
      const top = document.y;

      parties.forEach((party, index) => {
        const x = document.left + index * (width + gap);
        document.drawRule(top, { color: style.ruleColor, thickness: 0.75, from: x, to: x + width });
        document.drawTextAt(fill(party.label), x, top + 5, { size: page.fontSize - 1, color: page.textColor });
        if (party.caption) {
          document.drawTextAt(fill(party.caption), x, top + 5 + page.fontSize * 1.4, {
            size: page.fontSize - 2,
            color: page.mutedColor,
          });
        }
      });

      document.y = top + 34;
      break;
    }

    case "reference": {
      renderReference(block, context);
      break;
    }

    case "code": {
      renderCode(block, context);
      break;
    }

    case "chart": {
      renderChart(block, context);
      break;
    }

    case "link": {
      const address = fill(block.url);
      const label = fill(block.text);
      const shown = label.trim() ? label : address;
      if (!shown.trim()) break;
      const url = safeUrl(address, context.values["url.instance"]);
      if (address.trim() && !url) {
        context.problems.add(`A link to “${address.slice(0, 80)}” is not a web, mail or phone address, so it prints as text`);
      }
      document.text(shown, {
        size: block.size ?? page.fontSize,
        bold: block.bold,
        color: block.color ?? page.accentColor,
        align: alignOf(block.align),
        spaceAfter: block.spaceAfter ?? style.paragraphSpacing,
        lineHeight: style.lineHeight,
        underline: Boolean(url),
        ...(url ? { link: url } : {}),
      });
      break;
    }

    case "callout": {
      renderCallout(block, context);
      break;
    }

    case "list": {
      const size = block.size ?? page.fontSize;
      // An entry that fills to several lines — a multi-line field — is that many entries.
      const entries = block.items
        .flatMap(item => fill(item).split(/\r?\n/))
        .map(entry => entry.trim())
        .filter(Boolean);
      if (!entries.length) break;

      const indent = listIndent(block.style, size, entries.length);
      const width = document.contentWidth - indent;
      const lineHeight = size * style.lineHeight;
      const textStyle = { size, color: page.textColor, lineHeight: style.lineHeight, spaceAfter: size * 0.25 };

      entries.forEach((entry, index) => {
        // The marker and its entry's first lines move to the next page together.
        const height = document.text(entry, textStyle, { x: document.left + indent, width, draw: false });
        document.ensureRoom(Math.min(height, lineHeight * 2));
        const y = document.y;
        const x = document.left;
        if (block.style === "number") {
          const label = `${index + 1}.`;
          document.drawTextAt(label, x + indent - size * 0.45 - measureText(label, page.family, size), y, {
            size,
            color: page.mutedColor,
          });
        } else if (block.style === "check") {
          const box = size * 0.72;
          document.drawShape("roundRect", x + size * 0.05, y + size * 0.12, box, box, {
            stroke: page.mutedColor,
            strokeWidth: 0.75,
            radius: box * 0.18,
          });
        } else {
          document.drawTextAt("•", x + size * 0.15, y, { size, color: page.accentColor });
        }
        document.text(entry, textStyle, { x: x + indent, width });
      });
      document.moveDown(block.spaceAfter ?? style.paragraphSpacing);
      break;
    }

    case "table": {
      const size = block.fontSize ?? page.fontSize - 0.5;
      const columns: TableColumn[] = block.columns.map(column => {
        const header = fill(column.header);
        return {
          header: style.table.headerUppercase ? header.toUpperCase() : header,
          width: column.width,
          align: alignOf(column.align),
        };
      });
      const rows: TableCell[][] = block.rows.map(row =>
        block.columns.map((_, index) => ({ text: fill(row[index] ?? ""), color: page.textColor })),
      );
      if (!rows.length && !columns.some(column => column.header.trim())) break;
      // A header alone at the foot of a page says nothing.
      document.ensureRoom((size * 1.35 + style.table.cellPadding * 2) * Math.min(2, rows.length + 1));
      document.table({
        columns,
        rows,
        fontSize: size,
        headerFill: block.headerFill ?? style.table.headerFill,
        headerColor: style.table.headerColor ?? page.mutedColor,
        zebra: block.zebra ?? style.table.zebra,
        gridColor: style.table.gridColor,
        rowLines: style.table.rowLines,
        cellPadding: style.table.cellPadding,
      });
      document.moveDown(8);
      break;
    }

    case "pageBreak": {
      document.addPage();
      break;
    }
  }
}

/** How far a list's entries sit in from its markers: wide enough for the longest number. */
export const listIndent = (style: "bullet" | "number" | "check", size: number, count: number): number =>
  style === "number" ? size * (String(count).length * 0.6 + 1.1) : size * 1.3;

/* ------------------------------ reference card ---------------------------- */

/** Space inside a card or a callout, and the width of the coloured edge down its left side. */
export const CARD_PADDING = 10;
export const CARD_EDGE = 3;

/** The address a reference block's title links to, or null when it should not link. */
export function referenceLink(block: ReferenceBlock, values: Record<string, string>): string | null {
  if (!block.link || !block.table) return null;
  const sysId = values[`raw.${block.field}`] ?? "";
  const base = values["url.instance"];
  return base && /^[0-9a-f]{32}$/i.test(sysId) ? recordUrl(base, block.table, sysId) : null;
}

/**
 * A reference record: the fields of the record one of this record's
 * reference fields points at, as a card — or, laid out plain, as a field list
 * under a title. An empty reference prints its empty text, or nothing.
 */
function renderReference(block: ReferenceBlock, context: RenderContext): void {
  const { document, page, style, fill } = context;
  if (!block.field) return;

  const sysId = context.values[`raw.${block.field}`] ?? "";
  if (!sysId.trim()) {
    if (block.emptyText) {
      document.text(fill(block.emptyText), { size: page.fontSize - 0.5, italic: true, color: page.mutedColor, spaceAfter: 6 });
    }
    return;
  }

  const accent = block.color ?? page.accentColor;
  const url = referenceLink(block, context.values);
  const title = block.title ? fill(block.title) : "";
  const rows = block.rows.map(row => ({ label: fill(row.label), value: fill(referenceToken(block, row.field)) }));
  const titleStyle = {
    size: page.fontSize + 1,
    bold: true,
    color: accent,
    spaceAfter: rows.length ? 4 : 0,
    lineHeight: style.lineHeight,
    underline: Boolean(url),
    ...(url ? { link: url } : {}),
    ...(style.headingFamily ? { family: style.headingFamily } : {}),
  };

  if (block.layout === "plain") {
    if (title) document.text(title, titleStyle);
    renderBlock({ type: "fields", rows: rows.map(row => ({ label: row.label, value: row.value })) }, context);
    document.moveDown(4);
    return;
  }

  const x = document.left + CARD_EDGE + CARD_PADDING;
  const width = document.contentWidth - CARD_EDGE - CARD_PADDING * 2;
  const labelWidth = Math.min(140, width * 0.38);
  const valueWidth = width - labelWidth;
  const bodyStyle = { size: page.fontSize, color: page.textColor, lineHeight: style.lineHeight };
  const labelStyle = { ...bodyStyle, color: page.mutedColor };
  const rowGap = 2;

  const titleHeight = title ? document.text(title, titleStyle, { x, width, draw: false }) : 0;
  const heights = rows.map(row =>
    Math.max(
      document.text(row.label, labelStyle, { x, width: labelWidth - 6, draw: false }),
      document.text(row.value || " ", bodyStyle, { x: x + labelWidth, width: valueWidth, draw: false }),
    ),
  );
  const height = CARD_PADDING * 2 + titleHeight + heights.reduce((sum, each) => sum + each + rowGap, 0);

  // Taller than a page, a box cannot hold it: draw it plain instead.
  if (height > document.contentBottom - document.margins.top) {
    renderReference({ ...block, layout: "plain" }, context);
    return;
  }

  document.ensureRoom(height);
  const top = document.y;
  document.drawShape("rect", document.left, top, document.contentWidth, height, {
    fill: "#fafafa",
    stroke: style.table.gridColor,
    strokeWidth: 0.75,
  });
  document.drawRect(document.left, top, CARD_EDGE, height, accent);

  document.y = top + CARD_PADDING;
  if (title) document.text(title, titleStyle, { x, width });
  rows.forEach((row, index) => {
    const y = document.y;
    document.text(row.label, labelStyle, { x, width: labelWidth - 6 });
    document.y = y;
    document.text(row.value, bodyStyle, { x: x + labelWidth, width: valueWidth });
    document.y = y + heights[index]! + rowGap;
  });
  document.y = top + height;
  document.moveDown(10);
}

/* ---------------------------------- code --------------------------------- */

/** The fixed-width face code is set in, on paper and on screen. */
export const CODE_FAMILY: FontFamily = "courier";

/** Courier's every glyph is 600/1000 em, which is what lets code be broken by count. */
const CODE_ADVANCE = 0.6;

export const CODE_LINE_HEIGHT = 1.4;
export const CODE_PADDING = 8;
export const DEFAULT_CODE_BACKGROUND = "#f4f4f5";

/** Code as the lines it is drawn in: tabs as four spaces, nothing trimmed but the trailing blank lines. */
export const codeLines = (code: string): string[] =>
  code.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/\n+$/, "").split("\n");

/**
 * A code block: a tinted box of fixed-width lines, broken where they run past
 * the box rather than at spaces — code's spaces are content. A block longer
 * than the page continues in a box of its own on the next.
 */
function renderCode(block: CodeBlock, context: RenderContext): void {
  const { document, page, fill } = context;
  const source = fill(block.code);
  const title = block.title ? fill(block.title) : "";
  if (!source.trim() && !title.trim()) return;

  const size = block.size ?? Math.max(6, page.fontSize - 1);
  const lineHeight = size * CODE_LINE_HEIGHT;
  const charWidth = size * CODE_ADVANCE;
  const raw = codeLines(source);
  const gutter = block.lineNumbers ? String(raw.length).length + 2 : 0;
  const perLine = Math.max(8, Math.floor((document.contentWidth - CODE_PADDING * 2) / charWidth) - gutter);
  const color = block.color ?? "#18181b";
  const background = block.background ?? DEFAULT_CODE_BACKGROUND;

  const lines: { number?: number; text: string }[] = [];
  raw.forEach((line, index) => {
    if (!line.length) lines.push({ number: index + 1, text: "" });
    for (let at = 0; at < line.length; at += perLine) {
      lines.push({ number: at === 0 ? index + 1 : undefined, text: line.slice(at, at + perLine) });
    }
  });

  const header = title ? size * 1.6 : 0;
  document.ensureRoom(CODE_PADDING * 2 + header + lineHeight * Math.min(3, lines.length));

  let next = 0;
  let first = true;
  do {
    if (!first) document.addPage();
    const top = document.y;
    const heading = first ? header : 0;
    const fit = Math.max(1, Math.floor((document.contentBottom - top - CODE_PADDING * 2 - heading) / lineHeight));
    const run = lines.slice(next, next + fit);
    const height = CODE_PADDING * 2 + heading + run.length * lineHeight;

    document.drawShape("roundRect", document.left, top, document.contentWidth, height, { fill: background, radius: 4 });
    if (heading) {
      document.drawTextAt(title, document.left + CODE_PADDING, top + CODE_PADDING, {
        size: Math.max(6, size - 1),
        bold: true,
        color: page.mutedColor,
      });
    }
    run.forEach((line, index) => {
      const y = top + CODE_PADDING + heading + index * lineHeight + (lineHeight - size) / 2;
      if (gutter && line.number !== undefined) {
        document.drawTextAt(String(line.number).padStart(gutter - 2), document.left + CODE_PADDING, y, {
          family: CODE_FAMILY,
          size,
          color: page.mutedColor,
        });
      }
      document.drawTextAt(line.text, document.left + CODE_PADDING + gutter * charWidth, y, {
        family: CODE_FAMILY,
        size,
        color,
      });
    });

    document.y = top + height;
    next += run.length;
    first = false;
  } while (next < lines.length);

  document.moveDown(block.spaceAfter ?? 8);
}

/* ---------------------------------- chart -------------------------------- */

/** The inks and sheet a page gives its charts. */
export const chartStyle = (page: PdfPageSetup, surface = page.background ?? "#ffffff"): ChartStyle => ({
  family: page.family,
  fontSize: page.fontSize,
  textColor: page.textColor,
  mutedColor: page.mutedColor,
  surface,
});

/**
 * A chart: a title like a related list's, the plot laid out by ./chart.ts,
 * and a note under it when it shows less than everything. It moves to the
 * next page whole — half a chart answers nothing.
 */
function renderChart(block: ChartBlock, context: RenderContext): void {
  const { document, page, style, fill } = context;
  const data = chartData(block, text => fill(text), context.related);
  if (data.error) context.problems.add(`Chart of ${block.related?.table}: ${data.error}`);

  const extra = data.count === undefined ? undefined : { "list.count": String(data.count) };
  const title = block.title ? fill(block.title, extra) : "";
  const titleStyle = {
    size: page.fontSize + 2,
    bold: true,
    color: page.accentColor,
    spaceAfter: 6,
    ...(style.headingFamily ? { family: style.headingFamily } : {}),
  };
  const heading = style.headingUppercase ? title.toUpperCase() : title;

  if (!data.points.length) {
    const empty = block.emptyText ? fill(block.emptyText, extra) : "";
    if (!empty) return;
    if (heading) document.text(heading, titleStyle);
    document.text(empty, { size: page.fontSize - 0.5, italic: true, color: page.mutedColor, spaceAfter: 6 });
    return;
  }

  const scene = layoutChart(block, data.points, document.contentWidth, chartStyle(page));
  const titleHeight = heading ? document.text(heading, titleStyle, { draw: false }) : 0;
  document.ensureRoom(titleHeight + scene.height);
  if (heading) document.text(heading, titleStyle);
  const top = document.y;
  drawChart(document, scene, document.left, top);
  document.y = top + scene.height;
  if (data.note) {
    document.moveDown(4);
    document.text(data.note, { size: Math.max(6, page.fontSize - 2), color: page.mutedColor });
  }
  document.moveDown(10);
}

/** A laid-out chart's marks, through the writer's own primitives, with its top-left at (x, y). */
export function drawChart(document: PdfDocument, scene: ChartScene, x: number, y: number): void {
  const at = ([px, py]: [number, number]): [number, number] => [x + px, y + py];
  for (const mark of scene.marks) {
    switch (mark.kind) {
      case "shape":
        document.withOpacity(mark.opacity, () =>
          document.drawPath(mark.points.map(at), { fill: mark.fill, stroke: mark.stroke, strokeWidth: mark.strokeWidth }),
        );
        break;
      case "polyline":
        // Segment by segment: round caps make the joins.
        for (let index = 1; index < mark.points.length; index++) {
          const [x1, y1] = at(mark.points[index - 1]!);
          const [x2, y2] = at(mark.points[index]!);
          document.drawLine(x1, y1, x2, y2, { color: mark.color, thickness: mark.width });
        }
        break;
      case "rule":
        document.drawLine(x + mark.x1, y + mark.y1, x + mark.x2, y + mark.y2, { color: mark.color, thickness: mark.width });
        break;
      case "dot": {
        const ring = mark.r + 2;
        document.drawShape("ellipse", x + mark.cx - ring, y + mark.cy - ring, ring * 2, ring * 2, { fill: mark.ring });
        document.drawShape("ellipse", x + mark.cx - mark.r, y + mark.cy - mark.r, mark.r * 2, mark.r * 2, { fill: mark.fill });
        break;
      }
      case "text":
        document.drawTextAt(mark.text, x + mark.x, y + mark.y, { size: mark.size, color: mark.color, bold: mark.bold });
        break;
    }
  }
}

/* --------------------------------- callout ------------------------------- */

/**
 * A callout: a tinted box with a coloured edge, a bold title and its text.
 * One longer than a page cannot be boxed, so it flows under a rule in its
 * colour instead.
 */
function renderCallout(block: Extract<PdfBlock, { type: "callout" }>, context: RenderContext): void {
  const { document, page, style, fill } = context;
  const { color, fill: tint } = calloutColors(block.tone, block.color);
  const title = block.title ? fill(block.title) : "";
  const body = fill(block.text);
  if (!title.trim() && !body.trim()) return;

  const x = document.left + CARD_EDGE + CARD_PADDING;
  const width = document.contentWidth - CARD_EDGE - CARD_PADDING * 2;
  const titleStyle = { size: page.fontSize, bold: true, color, spaceAfter: body.trim() ? 2 : 0, lineHeight: style.lineHeight };
  const bodyStyle = { size: page.fontSize, color: page.textColor, lineHeight: style.lineHeight };
  const titleHeight = title ? document.text(title, titleStyle, { x, width, draw: false }) : 0;
  const bodyHeight = body.trim() ? document.text(body, bodyStyle, { x, width, draw: false }) : 0;
  const height = CARD_PADDING * 2 + titleHeight + bodyHeight;

  if (height > document.contentBottom - document.margins.top) {
    document.rule({ color, thickness: 2, spaceBefore: 0, spaceAfter: 4 });
    if (title) document.text(title, titleStyle);
    if (bodyHeight) document.text(body, bodyStyle);
    document.moveDown(8);
    return;
  }

  document.ensureRoom(height);
  const top = document.y;
  document.drawRect(document.left, top, document.contentWidth, height, tint);
  document.drawRect(document.left, top, CARD_EDGE, height, color);
  document.y = top + CARD_PADDING;
  if (title) document.text(title, titleStyle, { x, width });
  if (bodyHeight) document.text(body, bodyStyle, { x, width });
  document.y = top + height;
  document.moveDown(8);
}

/**
 * A related list: an optional title, then the rows as a table.
 *
 * The rows were fetched before the render — this function never reaches the
 * network — under `relatedKey(block)`. A block whose rows are missing draws
 * its empty text, and a block whose fetch failed is reported rather than
 * failing the document: a PDF missing one list can still be read.
 */
function renderRelatedList(block: RelatedListBlock, context: RenderContext): void {
  const { document, page, style, fill } = context;
  if (!block.table || !block.field) return;

  const data = context.related[relatedKey(block)];
  if (data?.error) context.problems.add(`Related list ${block.table}.${block.field}: ${data.error}`);

  const rows = data?.rows ?? [];
  const extra = { "list.count": String(data?.total ?? rows.length) };

  // The title keeps with what it introduces — the header and a first row, or
  // the empty text — so a page never ends on "Approvals (4)" and nothing else.
  const titleHeight = block.title ? (page.fontSize + 2) * 1.35 + 4 : 0;
  const size = block.fontSize ?? page.fontSize - 0.5;
  const rowHeight = size * 1.35 + style.table.cellPadding * 2;
  const following = rows.length && block.columns.length ? rowHeight * 2 : block.emptyText ? size * 1.35 + 6 : 0;
  if (titleHeight && following) document.ensureRoom(titleHeight + following);

  if (block.title) {
    const title = fill(block.title, extra);
    document.text(style.headingUppercase ? title.toUpperCase() : title, {
      size: page.fontSize + 2,
      bold: true,
      color: page.accentColor,
      spaceAfter: 4,
      ...(style.headingFamily ? { family: style.headingFamily } : {}),
    });
  }

  if (!rows.length || !block.columns.length) {
    if (block.emptyText) {
      document.text(fill(block.emptyText, extra), { size: page.fontSize - 0.5, italic: true, color: page.mutedColor, spaceAfter: 6 });
    }
    return;
  }

  const columns: TableColumn[] = block.columns.map(column => {
    const header = fill(column.header, extra);
    return {
      header: style.table.headerUppercase ? header.toUpperCase() : header,
      width: column.width,
      align: alignOf(column.align),
    };
  });

  const cells: TableCell[][] = rows.map(row =>
    block.columns.map(column => ({ text: row[column.field] ?? "", color: page.textColor })),
  );

  document.table({
    columns,
    rows: cells,
    fontSize: block.fontSize ?? page.fontSize - 0.5,
    headerFill: block.headerFill ?? style.table.headerFill,
    headerColor: style.table.headerColor ?? page.mutedColor,
    zebra: block.zebra ?? style.table.zebra,
    gridColor: style.table.gridColor,
    rowLines: style.table.rowLines,
    cellPadding: style.table.cellPadding,
  });

  document.moveDown(8);
}

/**
 * The tokens a template uses that a job has no value for — the same answer a
 * render gives, without drawing anything. For the slide preview, which never
 * builds a PDF.
 */
export function unknownTokens(template: PdfTemplate, job: RenderJob): string[] {
  const unknown = new Set<string>();
  const sample = job.records[0]?.values ?? job.coverValues;
  const check = (text: string, values: Record<string, string>) =>
    fillTokens(text, { ...values, "list.count": "" }, unknown);

  for (const text of templateStrings({ ...template, cover: [] })) check(text, sample);
  for (const block of template.cover ?? []) for (const text of blockStrings(block)) check(text, job.coverValues);
  return [...unknown].sort();
}
