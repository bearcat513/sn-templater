/**
 * Reading a template body: parse, clamp, and store back as canonical JSON.
 *
 * Ported from the template half of cpq-vibes' src/lib/validate.ts, and it
 * keeps the original's posture: **drop, don't refuse**. An unrecognised block
 * is dropped (a template from a future version loses the block it cannot
 * draw, not the page); an unreadable image becomes an empty source; an empty
 * body is a brand-new template. The only hard failures are invalid JSON, a
 * non-object, and no blocks at all.
 *
 * The editor parses through this too, so a body written by hand against the
 * Table API opens with exactly the defaults it will be stored with.
 */
import { isStorablePicture } from "./image";
import { DEFAULT_MARGINS, PAGE_SIZES } from "./pdf";
import { FONT_FAMILIES, type FontFamily } from "./pdfFonts";
import {
  CALLOUT_TONES,
  CHART_KINDS,
  CHART_MEASURES,
  DEFAULT_PAGE,
  DEFAULT_RELATED_LIMIT,
  MAX_BLOCKS,
  MAX_RELATED_ROWS,
  defaultStyle,
  starterChart,
  starterTemplate,
  type BlockAlign,
  type BlockCondition,
  type ConditionTest,
  type CalloutTone,
  type ChartKind,
  type ChartMeasure,
  type ChartTemplate,
  type ListColumn,
  type ListStyle,
  type PdfBlock,
  type PdfHeader,
  type PdfStyle,
  type PdfTemplate,
  type PdfWatermark,
  type StarterField,
  type TemplateKind,
} from "./template";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export const invalid = (error: string): { ok: false; error: string } => ({ ok: false, error });
const valid = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

/** A template body is JSON that carries its own pictures, so it gets room for them. */
export const MAX_TEMPLATE_BODY_LENGTH = 3_000_000;
export const MAX_TEMPLATE_NAME_LENGTH = 100;

/* ------------------------------- scalars --------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const text = (value: unknown, max: number): string =>
  String(value ?? "")
    .trim()
    .slice(0, max);

/** Like `text`, but a template's prose keeps its own leading and trailing lines. */
const prose = (value: unknown, max: number): string => String(value ?? "").slice(0, max);

const number = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bounded = (value: unknown, fallback: number, min: number, max: number): number =>
  Math.min(Math.max(number(value, fallback), min), max);

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const color = (value: unknown, fallback: string): string => {
  const raw = text(value, 32);
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? (raw.startsWith("#") ? raw : `#${raw}`) : fallback;
};

/** An optional colour: absent stays absent, so "no fill" is expressible. */
const optionalColor = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = text(value, 32);
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? (raw.startsWith("#") ? raw : `#${raw}`) : undefined;
};

const align = (value: unknown): "left" | "center" | "right" | undefined =>
  value === "center" || value === "right" || value === "left" ? value : undefined;

/** A table or field name: what the platform allows in one, and nothing else. */
const identifier = (value: unknown, max = 80): string => text(value, max).replace(/[^A-Za-z0-9_.]/g, "");

/** An encoded query or sort — stored as written; the Table API is its validator. */
const query = (value: unknown): string => text(value, 4_000);

/** A record's sys_id: what a block or element names a chart template by. */
export const SYS_ID = /^[0-9a-f]{32}$/;
const sysId = (value: unknown): string => (SYS_ID.test(String(value ?? "")) ? String(value) : "");

/**
 * A picture, as a `data:` URL or a reference to an attachment holding one.
 * Anything a PDF reader could not be handed is dropped to "" rather than
 * refused; the editor refuses it when it is chosen, which is where the
 * message is useful.
 */
const imageSource = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) return "";
  return isStorablePicture(value.trim()) ? value.trim() : "";
};

/* --------------------------------- pieces -------------------------------- */

function readListColumns(raw: unknown): ListColumn[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 12)
    .map((entry): ListColumn | null => {
      const column = asRecord(entry);
      const field = identifier(column.field, 200);
      if (!field) return null;
      return {
        field,
        header: text(column.header, 60),
        width: bounded(column.width, 1, 0.1, 100),
        ...(align(column.align) ? { align: align(column.align) } : {}),
      };
    })
    .filter((column): column is ListColumn => column !== null);
}

function readStyle(raw: unknown, fontSize: number): PdfStyle {
  const input = asRecord(raw);
  const table = asRecord(input.table);
  const fallback = defaultStyle(fontSize);
  const headingFamily = FONT_FAMILIES.includes(input.headingFamily as FontFamily)
    ? (input.headingFamily as FontFamily)
    : undefined;

  return {
    lineHeight: bounded(input.lineHeight, fallback.lineHeight, 1, 3),
    paragraphSpacing: bounded(input.paragraphSpacing, fallback.paragraphSpacing, 0, 48),
    headingScale: bounded(input.headingScale, fallback.headingScale, 1, 4),
    ...(headingFamily ? { headingFamily } : {}),
    ...(input.headingUppercase === true ? { headingUppercase: true } : {}),
    ruleColor: color(input.ruleColor, fallback.ruleColor),
    table: {
      ...(optionalColor(table.headerFill) ? { headerFill: optionalColor(table.headerFill) } : {}),
      ...(optionalColor(table.headerColor) ? { headerColor: optionalColor(table.headerColor) } : {}),
      ...(table.headerUppercase === true ? { headerUppercase: true } : {}),
      ...(optionalColor(table.zebra) ? { zebra: optionalColor(table.zebra) } : {}),
      gridColor: color(table.gridColor, fallback.table.gridColor),
      rowLines: table.rowLines !== false,
      cellPadding: bounded(table.cellPadding, fallback.table.cellPadding, 1, 24),
    },
  };
}

function readWatermark(raw: unknown): PdfWatermark | undefined {
  const input = asRecord(raw);
  const body = text(input.text, 60);
  if (!body) return undefined;

  return {
    text: body,
    ...(input.uppercase === true ? { uppercase: true } : {}),
    ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
    ...(input.size !== undefined ? { size: bounded(input.size, 84, 8, 400) } : {}),
    ...(input.opacity !== undefined ? { opacity: bounded(input.opacity, 0.08, 0.01, 1) } : {}),
    ...(input.angle !== undefined ? { angle: bounded(input.angle, 45, -90, 90) } : {}),
  };
}

const CONDITION_TESTS: ConditionTest[] = ["empty", "notEmpty", "equals", "notEquals", "contains", "greater", "less"];

/** A block's condition. One with no value is no condition; an unknown test is `notEmpty`. */
function readCondition(raw: unknown): BlockCondition | undefined {
  const input = asRecord(raw);
  const value = text(input.value, 500);
  if (!value) return undefined;
  const test = oneOf<ConditionTest>(input.test, CONDITION_TESTS, "notEmpty");
  const to = text(input.to, 500);
  return { value, test, ...(to && test !== "empty" && test !== "notEmpty" ? { to } : {}) };
}

/** A block, and its condition if it has one. `nested` is true inside a repeat, where another repeat is not allowed. */
function readBlock(raw: unknown, nested = false): PdfBlock | null {
  const block = readOwnBlock(raw, nested);
  if (!block) return null;
  const when = readCondition(asRecord(raw).when);
  return when ? { ...block, when } : block;
}

function readOwnBlock(raw: unknown, nested: boolean): PdfBlock | null {
  const input = asRecord(raw);

  switch (input.type) {
    case "heading":
      return {
        type: "heading",
        text: prose(input.text, 2_000),
        ...(input.size !== undefined ? { size: bounded(input.size, 18, 6, 96) } : {}),
        ...(align(input.align) ? { align: align(input.align) } : {}),
        ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
        ...(input.spaceAfter !== undefined ? { spaceAfter: bounded(input.spaceAfter, 4, 0, 200) } : {}),
      };

    case "text":
      return {
        type: "text",
        text: prose(input.text, 20_000),
        ...(input.size !== undefined ? { size: bounded(input.size, 10, 5, 72) } : {}),
        ...(align(input.align) ? { align: align(input.align) } : {}),
        ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
        ...(input.bold === true ? { bold: true } : {}),
        ...(input.italic === true ? { italic: true } : {}),
        ...(input.spaceAfter !== undefined ? { spaceAfter: bounded(input.spaceAfter, 4, 0, 200) } : {}),
      };

    case "image":
      return {
        type: "image",
        source: imageSource(input.source),
        width: bounded(input.width, 140, 8, 900),
        ...(align(input.align) ? { align: align(input.align) } : {}),
        ...(text(input.caption, 300) ? { caption: text(input.caption, 300) } : {}),
        ...(input.spaceAfter !== undefined ? { spaceAfter: bounded(input.spaceAfter, 6, 0, 200) } : {}),
      };

    case "spacer":
      return { type: "spacer", height: bounded(input.height, 12, 0, 400) };

    case "divider":
      return {
        type: "divider",
        ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
        ...(input.thickness !== undefined ? { thickness: bounded(input.thickness, 0.75, 0.1, 8) } : {}),
      };

    case "columns": {
      const columns = (Array.isArray(input.columns) ? input.columns : []).slice(0, 4).map(entry => {
        const column = asRecord(entry);
        return {
          ...(text(column.heading, 120) ? { heading: text(column.heading, 120) } : {}),
          text: prose(column.text, 4_000),
          ...(align(column.align) ? { align: align(column.align) } : {}),
        };
      });
      return {
        type: "columns",
        ...(input.gap !== undefined ? { gap: bounded(input.gap, 16, 0, 120) } : {}),
        columns: columns.length ? columns : [{ text: "" }],
      };
    }

    case "fields":
      return {
        type: "fields",
        rows: (Array.isArray(input.rows) ? input.rows : []).slice(0, 60).map(entry => {
          const row = asRecord(entry);
          return { label: text(row.label, 120), value: prose(row.value, 2_000) };
        }),
      };

    case "relatedList":
      // A half-configured list is kept — the editor is where it gets finished,
      // and the renderer draws nothing for a list with no table yet.
      return {
        type: "relatedList",
        table: identifier(input.table),
        field: identifier(input.field),
        ...(query(input.query) ? { query: query(input.query) } : {}),
        ...(identifier(input.orderBy, 200)
          ? { orderBy: (String(input.orderBy).trim().startsWith("-") ? "-" : "") + identifier(input.orderBy, 200) }
          : {}),
        limit: Math.trunc(bounded(input.limit, DEFAULT_RELATED_LIMIT, 1, MAX_RELATED_ROWS)),
        ...(text(input.title, 200) ? { title: text(input.title, 200) } : {}),
        columns: readListColumns(input.columns),
        ...(text(input.emptyText, 200) ? { emptyText: text(input.emptyText, 200) } : {}),
        ...(optionalColor(input.headerFill) ? { headerFill: optionalColor(input.headerFill) } : {}),
        ...(optionalColor(input.zebra) ? { zebra: optionalColor(input.zebra) } : {}),
        ...(input.fontSize !== undefined ? { fontSize: bounded(input.fontSize, 9, 5, 24) } : {}),
      };

    case "stats":
      return {
        type: "stats",
        items: (Array.isArray(input.items) ? input.items : []).slice(0, 6).map(entry => {
          const item = asRecord(entry);
          return { label: text(item.label, 80), value: text(item.value, 300) };
        }),
        ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
      };

    case "chart": {
      const source = asRecord(input.related);
      const table = identifier(source.table);
      // Like a related list, a half-chosen source is kept for the editor to finish.
      const related =
        table || identifier(source.groupBy, 200)
          ? {
              table,
              field: identifier(source.field),
              ...(query(source.query) ? { query: query(source.query) } : {}),
              groupBy: identifier(source.groupBy, 200),
              ...(identifier(source.thenBy, 200) ? { thenBy: identifier(source.thenBy, 200) } : {}),
              ...(identifier(source.start, 200) ? { start: identifier(source.start, 200) } : {}),
              ...(identifier(source.end, 200) ? { end: identifier(source.end, 200) } : {}),
            }
          : undefined;
      const template = sysId(input.template);
      return {
        type: "chart",
        chart: oneOf<ChartKind>(
          input.chart,
          CHART_KINDS.map(entry => entry.kind),
          "column",
        ),
        ...(text(input.title, 200) ? { title: text(input.title, 200) } : {}),
        items: (Array.isArray(input.items) ? input.items : []).slice(0, 60).map(entry => {
          const item = asRecord(entry);
          return {
            label: text(item.label, 120),
            value: text(item.value, 300),
            ...(text(item.to, 120) ? { to: text(item.to, 120) } : {}),
            ...(text(item.start, 300) ? { start: text(item.start, 300) } : {}),
            ...(text(item.end, 300) ? { end: text(item.end, 300) } : {}),
          };
        }),
        ...(related ? { related } : {}),
        ...(template ? { template } : {}),
        height: bounded(input.height, 160, 40, 600),
        ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
        ...(input.showValues === true ? { showValues: true } : {}),
        ...(text(input.emptyText, 200) ? { emptyText: text(input.emptyText, 200) } : {}),
      };
    }

    case "signatures":
      return {
        type: "signatures",
        parties: (Array.isArray(input.parties) ? input.parties : []).slice(0, 4).map(entry => {
          const party = asRecord(entry);
          return {
            label: text(party.label, 120),
            ...(text(party.caption, 120) ? { caption: text(party.caption, 120) } : {}),
          };
        }),
      };

    case "reference": {
      const layout = input.layout === "plain" ? "plain" : "card";
      return {
        type: "reference",
        field: identifier(input.field),
        table: identifier(input.table),
        ...(text(input.title, 200) ? { title: text(input.title, 200) } : {}),
        rows: (Array.isArray(input.rows) ? input.rows : [])
          .slice(0, 16)
          .map(entry => {
            const row = asRecord(entry);
            return { label: text(row.label, 120), field: identifier(row.field, 200) };
          })
          .filter(row => row.field),
        layout,
        ...(input.link === true ? { link: true } : {}),
        ...(text(input.emptyText, 200) ? { emptyText: text(input.emptyText, 200) } : {}),
        ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
      };
    }

    case "code":
      return {
        type: "code",
        // Code is the one place whitespace is content: nothing is trimmed.
        code: prose(input.code, 20_000),
        ...(text(input.title, 80) ? { title: text(input.title, 80) } : {}),
        ...(input.size !== undefined ? { size: bounded(input.size, 9, 5, 24) } : {}),
        ...(input.lineNumbers === true ? { lineNumbers: true } : {}),
        ...(optionalColor(input.background) ? { background: optionalColor(input.background) } : {}),
        ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
        ...(input.spaceAfter !== undefined ? { spaceAfter: bounded(input.spaceAfter, 8, 0, 200) } : {}),
      };

    case "link":
      return {
        type: "link",
        text: prose(input.text, 500),
        url: text(input.url, 2_000),
        ...(input.size !== undefined ? { size: bounded(input.size, 10, 5, 72) } : {}),
        ...(align(input.align) ? { align: align(input.align) } : {}),
        ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
        ...(input.bold === true ? { bold: true } : {}),
        ...(input.spaceAfter !== undefined ? { spaceAfter: bounded(input.spaceAfter, 4, 0, 200) } : {}),
      };

    case "callout":
      return {
        type: "callout",
        tone: oneOf<CalloutTone>(
          input.tone,
          CALLOUT_TONES.map(entry => entry.tone),
          "info",
        ),
        ...(text(input.title, 200) ? { title: text(input.title, 200) } : {}),
        text: prose(input.text, 8_000),
        ...(optionalColor(input.color) ? { color: optionalColor(input.color) } : {}),
      };

    case "list":
      return {
        type: "list",
        style: oneOf<ListStyle>(input.style, ["bullet", "number", "check"], "bullet"),
        items: (Array.isArray(input.items) ? input.items : []).slice(0, 100).map(item => prose(item, 2_000)),
        ...(input.size !== undefined ? { size: bounded(input.size, 10, 5, 72) } : {}),
        ...(input.spaceAfter !== undefined ? { spaceAfter: bounded(input.spaceAfter, 4, 0, 200) } : {}),
      };

    case "table": {
      const columns = (Array.isArray(input.columns) ? input.columns : []).slice(0, 12).map(entry => {
        const column = asRecord(entry);
        const at: BlockAlign | undefined = align(column.align);
        return {
          header: text(column.header, 120),
          width: bounded(column.width, 1, 0.1, 100),
          ...(at ? { align: at } : {}),
        };
      });
      const width = Math.max(1, columns.length);
      return {
        type: "table",
        columns: columns.length ? columns : [{ header: "", width: 1 }],
        // Every row as wide as the header, so a cell cannot go missing in the middle of one.
        rows: (Array.isArray(input.rows) ? input.rows : []).slice(0, 200).map(entry => {
          const cells = Array.isArray(entry) ? entry : [];
          return Array.from({ length: width }, (_, index) => prose(cells[index], 2_000));
        }),
        ...(optionalColor(input.headerFill) ? { headerFill: optionalColor(input.headerFill) } : {}),
        ...(optionalColor(input.zebra) ? { zebra: optionalColor(input.zebra) } : {}),
        ...(input.fontSize !== undefined ? { fontSize: bounded(input.fontSize, 9, 5, 24) } : {}),
      };
    }

    case "repeat": {
      if (nested) return null;
      return {
        type: "repeat",
        table: identifier(input.table),
        field: identifier(input.field),
        ...(query(input.query) ? { query: query(input.query) } : {}),
        ...(identifier(input.orderBy, 200)
          ? {
              orderBy: (String(input.orderBy).trim().startsWith("-") ? "-" : "") + identifier(input.orderBy, 200),
            }
          : {}),
        limit: Math.trunc(bounded(input.limit, DEFAULT_RELATED_LIMIT, 1, MAX_RELATED_ROWS)),
        blocks: (Array.isArray(input.blocks) ? input.blocks : [])
          .slice(0, MAX_REPEAT_BLOCKS)
          .map(entry => readBlock(entry, true))
          .filter((block): block is PdfBlock => block !== null),
        ...(text(input.emptyText, 200) ? { emptyText: text(input.emptyText, 200) } : {}),
      };
    }

    case "pageBreak":
      return { type: "pageBreak" };

    default:
      return null;
  }
}

/** Most blocks inside one repeat. */
const MAX_REPEAT_BLOCKS = 40;

const readBlocks = (raw: unknown): PdfBlock[] =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_BLOCKS)
    .map(entry => readBlock(entry))
    .filter((block): block is PdfBlock => block !== null);

/* -------------------------------- the body ------------------------------- */

/**
 * Reads a template body — the JSON string the record stores, or an already
 * parsed object — into a template the renderer can draw without guessing.
 */
export function readTemplate(
  raw: unknown,
  kind: TemplateKind = "document",
  fields: StarterField[] = [],
): Validated<PdfTemplate> {
  let source: unknown = raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    // An empty body is a brand-new template, not an error.
    if (!trimmed) return valid(starterTemplate(kind, fields));
    if (trimmed.length > MAX_TEMPLATE_BODY_LENGTH) {
      return invalid(`A template body must be ${MAX_TEMPLATE_BODY_LENGTH.toLocaleString()} characters or fewer.`);
    }
    try {
      source = JSON.parse(trimmed);
    } catch {
      return invalid("A template's body must be valid JSON describing the document.");
    }
  }

  if (!isRecord(source)) return invalid("A template must be an object with `page` and `blocks`.");

  const page = asRecord(source.page);
  const margins = asRecord(page.margins);
  const blocks = readBlocks(source.blocks);
  if (!blocks.length) return invalid("A template needs at least one block.");

  const cover = readBlocks(source.cover);
  const footer = asRecord(source.footer);
  const header = asRecord(source.header);
  const fontSize = bounded(page.fontSize, DEFAULT_PAGE.fontSize, 6, 32);
  const watermark = readWatermark(source.watermark);
  const logo = imageSource(header.logo);
  const letterhead: PdfHeader = {
    ...(logo ? { logo } : {}),
    ...(header.logoWidth !== undefined ? { logoWidth: bounded(header.logoWidth, 110, 8, 400) } : {}),
    ...(header.logoAlign === "right" ? { logoAlign: "right" as const } : {}),
    ...(text(header.text, 500) ? { text: text(header.text, 500) } : {}),
    ...(optionalColor(header.color) ? { color: optionalColor(header.color) } : {}),
    ...(header.rule === true ? { rule: true } : {}),
    ...(header.firstPageOnly === true ? { firstPageOnly: true } : {}),
  };
  const background = optionalColor(page.background);

  return valid({
    // Absent stays absent: a template that has never had a letterhead does not
    // carry an empty one around for the rest of its life.
    ...(Object.keys(letterhead).length ? { header: letterhead } : {}),
    page: {
      size: oneOf(page.size, PAGE_SIZES, DEFAULT_PAGE.size),
      ...(page.landscape === true ? { landscape: true } : {}),
      margins: {
        top: bounded(margins.top, DEFAULT_MARGINS.top, 12, 200),
        right: bounded(margins.right, DEFAULT_MARGINS.right, 12, 200),
        bottom: bounded(margins.bottom, DEFAULT_MARGINS.bottom, 12, 200),
        left: bounded(margins.left, DEFAULT_MARGINS.left, 12, 200),
      },
      family: oneOf(page.family, FONT_FAMILIES, DEFAULT_PAGE.family),
      fontSize,
      textColor: color(page.textColor, DEFAULT_PAGE.textColor),
      mutedColor: color(page.mutedColor, DEFAULT_PAGE.mutedColor),
      accentColor: color(page.accentColor, DEFAULT_PAGE.accentColor),
      ...(background ? { background } : {}),
    },
    // Always stored: writing the style down is what stops the defaults
    // shifting under a template that already exists.
    style: readStyle(source.style, fontSize),
    ...(watermark ? { watermark } : {}),
    ...(cover.length ? { cover } : {}),
    blocks,
    footer: {
      text: text(footer.text, 300),
      showPageNumbers: footer.showPageNumbers !== false,
    },
  });
}

/** The canonical body a template is stored as. */
export const serializeTemplate = (template: PdfTemplate): string => {
  const read = readTemplate(template);
  return JSON.stringify(read.ok ? read.value : template);
};

/* ---------------------------- chart templates ---------------------------- */

/**
 * Reads a chart template's body. The same posture as a document's: an empty
 * body is a new chart, and anything unreadable in it falls back to the
 * starter's value rather than failing the whole chart.
 */
export function readChartTemplate(
  raw: unknown,
  fields: StarterField[] = [],
  tableLabel?: string,
): Validated<ChartTemplate> {
  let source: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return valid(starterChart(fields, tableLabel));
    try {
      source = JSON.parse(trimmed);
    } catch {
      return invalid("A chart's body must be valid JSON describing the chart.");
    }
  }
  if (!isRecord(source)) return invalid("A chart must be an object with a `chart` and a `groupBy`.");

  const measure = oneOf<ChartMeasure>(
    source.measure,
    CHART_MEASURES.map(entry => entry.measure),
    "count",
  );
  const field = identifier(source.field);
  return valid({
    version: 1,
    chart: oneOf<ChartKind>(
      source.chart,
      CHART_KINDS.map(entry => entry.kind),
      "column",
    ),
    ...(text(source.title, 200) ? { title: text(source.title, 200) } : {}),
    groupBy: identifier(source.groupBy),
    ...(identifier(source.thenBy) ? { thenBy: identifier(source.thenBy) } : {}),
    ...(identifier(source.start) ? { start: identifier(source.start) } : {}),
    ...(identifier(source.end) ? { end: identifier(source.end) } : {}),
    // A sum of nothing is a count: without a field there is only one thing to measure.
    measure: field ? measure : "count",
    ...(field && measure !== "count" ? { field } : {}),
    order: source.order === "field" ? "field" : "value",
    height: bounded(source.height, 200, 40, 600),
    ...(optionalColor(source.color) ? { color: optionalColor(source.color) } : {}),
    ...(source.showValues === true ? { showValues: true } : {}),
    ...(text(source.emptyText, 200) ? { emptyText: text(source.emptyText, 200) } : {}),
  });
}

export const serializeChartTemplate = (chart: ChartTemplate): string => {
  const read = readChartTemplate(chart);
  return JSON.stringify(read.ok ? read.value : chart);
};
