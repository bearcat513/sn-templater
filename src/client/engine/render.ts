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
import { decodeImage, imageBox, type EmbeddableImage } from "./image";
import { PdfDocument, DEFAULT_MARGINS, type TableCell, type TableColumn } from "./pdf";
import { measureText } from "./pdfFonts";
import { fillTokens } from "./tokens";
import {
  DEFAULT_PAGE,
  blockStrings,
  defaultStyle,
  relatedKey,
  templateStrings,
  type BlockAlign,
  type PdfBlock,
  type PdfHeader,
  type PdfPageSetup,
  type PdfStyle,
  type PdfTemplate,
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

  /* --- the flow: cover, then a section per record --- */

  // Which section each page belongs to: -1 is the cover, otherwise a record.
  const owners: number[] = [];
  const claim = (owner: number) => {
    while (owners.length < document.pageCount) owners.push(owner);
  };
  let started = false;

  const section = (blocks: PdfBlock[], values: Record<string, string>, related: Record<string, RelatedRows>) => {
    if (started) document.addPage();
    started = true;
    const context: RenderContext = { document, page, style, fill: filler(values), related, picture, problems };
    for (const block of blocks) renderBlock(block, context);
  };

  if (template.cover?.length) {
    section(template.cover, job.coverValues, {});
    claim(-1);
  }

  job.records.forEach((record, index) => {
    section(template.blocks, record.values, record.related);
    claim(index);
  });

  if (!started) {
    document.text("No records matched.", { color: page.mutedColor, size: page.fontSize + 2 });
    claim(-1);
  }

  /* --- page furniture, once every page exists --- */

  const valuesOn = (pageNumber: number): Record<string, string> => {
    const owner = owners[pageNumber - 1] ?? -1;
    return owner === -1 ? job.coverValues : (job.records[owner]?.values ?? job.coverValues);
  };
  const fillOn = (pageNumber: number, text: string) => filler(valuesOn(pageNumber))(text);

  // Registered before the background: the later of two "beneath" overlays is
  // drawn under the earlier, and the paper has to be under everything.
  if (template.watermark?.text) {
    const watermark = template.watermark;
    document.onEachPage(
      (doc, current) => {
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

  if (page.background && !/^#?f{3}(f{3})?$/i.test(page.background)) {
    const background = page.background;
    document.onEachPage(doc => doc.drawRect(0, 0, doc.width, doc.height, background), { beneath: true });
  }

  // "First page only" means the first page of each record's section: a batch
  // of letters is letterheaded on every letter, not only on the first.
  const sectionStart = (pageNumber: number) =>
    pageNumber === 1 || owners[pageNumber - 1] !== owners[pageNumber - 2];
  renderHeader(template.header, { document, page, fillOn, picture, sectionStart });

  const showPageNumbers = template.footer?.showPageNumbers !== false;
  if (template.footer?.text || showPageNumbers) {
    document.onEachPage((doc, current) => {
      const y = doc.y;
      const size = Math.max(6, page.fontSize - 2);
      const text = template.footer?.text ? fillOn(current, template.footer.text) : "";
      if (text) doc.drawTextAt(text, doc.left, y, { size, color: page.mutedColor });

      if (showPageNumbers) {
        // Numbered within the record's own section, so a batch of fifty
        // incidents reads "Page 1 of 2" on each rather than "Page 37 of 100".
        const owner = owners[current - 1];
        const first = owners.indexOf(owner!);
        const count = owners.filter(entry => entry === owner).length;
        const label = `Page ${current - first} of ${count}`;
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

    case "pageBreak": {
      document.addPage();
      break;
    }
  }
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
