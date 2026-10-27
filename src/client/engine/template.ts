/**
 * Templates — a document described as data.
 *
 * Ported from the cpq-vibes PDF template format (src/lib/pdfTemplate.ts). A
 * template is page setup, a house style, optional page furniture (letterhead,
 * watermark, footer) and an ordered list of blocks. Every string in it runs
 * through the token vocabulary, so `{{record.short_description}}` means the
 * same thing in a heading, a footer and a slide.
 *
 * ## One block language, two kinds
 *
 * A **document** template renders one record — its fields and its related
 * lists — as a PDF; given several records, each starts on a fresh page of the
 * same file. A **deck** template renders each record as a slide, and can be
 * presented in the browser or exported as a PDF with one slide per page.
 *
 * The two kinds differ only in their defaults (paper, starter blocks) and in
 * where they are used. Nothing in the renderer knows which one it is drawing,
 * which is what keeps the second kind from being a copy of the first with the
 * nouns changed.
 *
 * ## What changed from the original
 *
 * The cpq-vibes vocabularies were closed lists — a quote's fields, an
 * invoice's fields. Here the record can be any table on the instance, so the
 * vocabulary is the table's own schema (see ./vocabulary.ts), the line-item
 * table became a `relatedList` block that names any table referencing the
 * record, and the totals block — a quote's arithmetic — gave way to `stats`,
 * a row of large figures that suits a slide.
 */
import {
  MAX_BLOCKS as SHARED_MAX_BLOCKS,
  MAX_RELATED_ROWS as SHARED_MAX_RELATED_ROWS,
} from "../../server/shared/constants";
import { DEFAULT_MARGINS } from "./pdf";
export type {
  BlockCondition,
  Condition,
  ConditionGroup,
  ConditionTest,
  RepeatBlock,
  TemplateKind,
  PdfPageSetup,
  PdfHeader,
  PdfStyle,
  PdfTableStyle,
  PdfWatermark,
  BlockAlign,
  ListColumn,
  RelatedListBlock,
  ReferenceBlock,
  CodeBlock,
  CalloutTone,
  ListStyle,
  ChartKind,
  ChartShape,
  ChartBlock,
  ChartItem,
  ChartSource,
  ChartMeasure,
  ChartTemplate,
  PdfBlock,
  BlockType,
  PdfTemplate,
  StarterField,
} from "./types";
import type {
  Condition,
  RepeatBlock,
  TemplateKind,
  PdfPageSetup,
  PdfStyle,
  PdfTableStyle,
  RelatedListBlock,
  ReferenceBlock,
  CalloutTone,
  ChartKind,
  ChartShape,
  ChartSource,
  ChartMeasure,
  ChartTemplate,
  PdfBlock,
  BlockType,
  PdfTemplate,
  StarterField,
} from "./types";

export const TEMPLATE_KINDS: TemplateKind[] = ["document", "deck", "chart"];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  document: "PDF document",
  deck: "Slide deck",
  chart: "Chart",
};

/* -------------------------------- the page ------------------------------- */

export const DEFAULT_PAGE: PdfPageSetup = {
  size: "A4",
  margins: { ...DEFAULT_MARGINS },
  family: "helvetica",
  fontSize: 10,
  textColor: "#18181b",
  mutedColor: "#71717a",
  accentColor: "#18181b",
};

/* -------------------------------- the style ------------------------------ */

export const DEFAULT_TABLE_STYLE: PdfTableStyle = {
  gridColor: "#e4e4e7",
  rowLines: true,
  cellPadding: 5,
};

/**
 * The style a template gets when it does not carry one.
 *
 * `headingScale` reproduces the original renderer's "body plus nine points" —
 * a step, not a ratio — so it depends on the body size it is computed for.
 */
export function defaultStyle(fontSize: number = DEFAULT_PAGE.fontSize): PdfStyle {
  const size = fontSize > 0 ? fontSize : DEFAULT_PAGE.fontSize;
  return {
    lineHeight: 1.35,
    paragraphSpacing: 4,
    headingScale: Math.round(((size + 9) / size) * 1000) / 1000,
    ruleColor: "#d4d4d8",
    table: { ...DEFAULT_TABLE_STYLE },
  };
}

/* -------------------------------- blocks --------------------------------- */

export const CALLOUT_TONES: { tone: CalloutTone; label: string; color: string; fill: string }[] = [
  { tone: "info", label: "Info", color: "#2563eb", fill: "#eff6ff" },
  { tone: "success", label: "Success", color: "#16a34a", fill: "#f0fdf4" },
  { tone: "warning", label: "Warning", color: "#d97706", fill: "#fffbeb" },
  { tone: "critical", label: "Critical", color: "#dc2626", fill: "#fef2f2" },
  { tone: "neutral", label: "Neutral", color: "#52525b", fill: "#f4f4f5" },
];

export const calloutColors = (tone: CalloutTone | undefined, color?: string): { color: string; fill: string } => {
  const found = CALLOUT_TONES.find(entry => entry.tone === tone) ?? CALLOUT_TONES[0]!;
  return { color: color ?? found.color, fill: found.fill };
};

export const CHART_KINDS: {
  kind: ChartKind;
  label: string;
  shape: ChartShape;
  /** What a pair's two labels are called, for a chart of pairs. */
  axes?: [string, string];
}[] = [
  { kind: "column", label: "Column", shape: "single" },
  { kind: "bar", label: "Bar", shape: "single" },
  { kind: "line", label: "Line", shape: "single" },
  { kind: "area", label: "Area", shape: "single" },
  { kind: "pie", label: "Pie", shape: "single" },
  { kind: "donut", label: "Donut", shape: "single" },
  { kind: "funnel", label: "Funnel", shape: "single" },
  { kind: "stacked", label: "Stacked column", shape: "pairs", axes: ["Column", "Stack"] },
  { kind: "heatmap", label: "Heatmap", shape: "pairs", axes: ["Row", "Column"] },
  { kind: "sankey", label: "Sankey", shape: "pairs", axes: ["From", "To"] },
  { kind: "gantt", label: "Gantt", shape: "spans" },
];

export const chartShape = (kind: ChartKind): ChartShape =>
  CHART_KINDS.find(entry => entry.kind === kind)?.shape ?? "single";

/** What a chart of pairs calls its two labels. */
export const chartAxes = (kind: ChartKind): [string, string] =>
  CHART_KINDS.find(entry => entry.kind === kind)?.axes ?? ["Label", "Then by"];

/** The kinds that take their colours from the categorical palette rather than one series colour. */
export const paletteChart = (kind: ChartKind): boolean =>
  kind === "pie" || kind === "donut" || kind === "stacked" || kind === "sankey";

/* ---------------------------- chart templates ---------------------------- */

export const CHART_MEASURES: { measure: ChartMeasure; label: string }[] = [
  { measure: "count", label: "Number of records" },
  { measure: "sum", label: "Total" },
  { measure: "avg", label: "Average" },
  { measure: "min", label: "Lowest" },
  { measure: "max", label: "Highest" },
];

/** The field types a Gantt bar can start or end at. */
export const DATE_TYPES = new Set([
  "glide_date",
  "glide_date_time",
  "due_date",
  "date",
  "datetime",
  "calendar_date_time",
]);

/** What a Gantt bar is named by, and where it starts and ends, in order of preference. */
const SPAN_NAMES = ["short_description", "name", "number"];
const SPAN_STARTS = ["planned_start_date", "start_date", "work_start", "expected_start", "opened_at", "sys_created_on"];
const SPAN_ENDS = ["planned_end_date", "end_date", "work_end", "due_date", "closed_at", "sys_updated_on"];

type ChartFieldChoice = { groupBy: string; thenBy?: string; start?: string; end?: string };

/**
 * The fields a chart starts with when it becomes a chart of another kind: the
 * ones it has where they suit the new kind, and otherwise the likeliest the
 * table has — a pair's second grouping, or a Gantt bar's name and dates.
 */
export function chartFieldsFor(
  kind: ChartKind,
  from: ChartKind,
  current: ChartFieldChoice,
  fields: { name: string; type?: string }[],
  displayField = "",
): ChartFieldChoice {
  const has = (name?: string) => Boolean(name && fields.some(field => field.name === name));
  const first = (names: string[]) => names.find(has);
  const shape = chartShape(kind);
  const was = chartShape(from);
  if (shape === "spans") {
    const dates = fields.filter(field => DATE_TYPES.has(field.type ?? "")).map(field => field.name);
    const start = has(current.start) ? current.start : (first(SPAN_STARTS) ?? dates[0]);
    const end = has(current.end) ? current.end : (first(SPAN_ENDS) ?? dates.find(name => name !== start));
    const groupBy =
      was === "spans" && has(current.groupBy)
        ? current.groupBy
        : (first([displayField, ...SPAN_NAMES]) ?? current.groupBy);
    return { groupBy, ...(start ? { start } : {}), ...(end ? { end } : {}) };
  }
  // A Gantt bar's name is no grouping: back to one that is.
  const groupBy = was === "spans" ? (first(STARTER_GROUPS) ?? current.groupBy) : current.groupBy;
  if (shape === "single") return { groupBy };
  const thenBy =
    has(current.thenBy) && current.thenBy !== groupBy
      ? current.thenBy
      : first(STARTER_GROUPS.filter(name => name !== groupBy));
  return { groupBy, ...(thenBy ? { thenBy } : {}) };
}

/** The fields a new chart groups by, in order of preference: the ones every task table has. */
const STARTER_GROUPS = ["state", "priority", "category", "assignment_group", "active"];

/**
 * A new chart template: a column per state, or per whatever the table has
 * that reads like one. The title names the table in words rather than as
 * `{{table.label}}`, which on a deck's slide is the deck's table, not this one.
 */
export function starterChart(fields: StarterField[] = [], tableLabel = "Records"): ChartTemplate {
  const groupBy = STARTER_GROUPS.find(name => fields.some(field => field.name === name)) ?? fields[0]?.name ?? "";
  const label = fields.find(field => field.name === groupBy)?.label ?? groupBy;
  return {
    version: 1,
    chart: "column",
    title: label ? `${tableLabel} by ${label.toLowerCase()} ({{list.count}})` : "",
    groupBy,
    measure: "count",
    order: "value",
    height: 200,
    showValues: true,
    emptyText: "Nothing to chart.",
  };
}

export const BLOCK_TYPES: { type: BlockType; label: string; description: string }[] = [
  { type: "heading", label: "Heading", description: "A title line, larger than the body" },
  { type: "text", label: "Text", description: "A paragraph, wrapped to the page" },
  { type: "fields", label: "Field list", description: "Label and value pairs, one per line" },
  { type: "columns", label: "Columns", description: "Side-by-side panels of text" },
  { type: "relatedList", label: "Related list", description: "Records that reference this one, as a table" },
  { type: "stats", label: "Stats", description: "A row of large figures — good on a slide" },
  { type: "chart", label: "Chart", description: "Bars, a line or a pie — of your figures or of related records" },
  { type: "reference", label: "Reference record", description: "Fields of a record this one points at, as a card" },
  { type: "list", label: "List", description: "Bulleted, numbered or checkbox items" },
  { type: "table", label: "Table", description: "A grid of your own rows and columns" },
  { type: "callout", label: "Callout", description: "A tinted box for a note, a warning or a summary" },
  { type: "code", label: "Code", description: "Preformatted text in a fixed-width face — a script, a payload" },
  { type: "link", label: "Link", description: "Text that opens a web page, an email or the record" },
  { type: "image", label: "Image", description: "A picture in the flow — a logo, a diagram" },
  { type: "repeat", label: "Repeat", description: "Blocks of your own, once for each related record" },
  { type: "signatures", label: "Signatures", description: "Ruled areas for names and dates" },
  { type: "divider", label: "Divider", description: "A horizontal rule" },
  { type: "spacer", label: "Spacer", description: "Vertical space" },
  { type: "pageBreak", label: "Page break", description: "Start the next page" },
];

export const MAX_BLOCKS = SHARED_MAX_BLOCKS;
export const MAX_RELATED_ROWS = SHARED_MAX_RELATED_ROWS;
export const DEFAULT_RELATED_LIMIT = 50;

/* -------------------------------- starters ------------------------------- */

/** Fields people expect near the top of a record, in the order they expect them. */
const PREFERRED_FIELDS = [
  "number",
  "name",
  "short_description",
  "state",
  "priority",
  "category",
  "caller_id",
  "requested_for",
  "opened_by",
  "opened_at",
  "assignment_group",
  "assigned_to",
  "due_date",
  "sys_updated_on",
];

/** Fields that make for noise rather than a document. */
const SKIPPED = /^(sys_(?!updated_on|created_on|created_by)|description$|comments$|work_notes|.*_list$|close_notes$)/;

/** Picks the fields a fresh template opens on — the ones a reader looks for first. */
export function pickStarterFields(fields: StarterField[], count: number): StarterField[] {
  const byName = new Map(fields.map(field => [field.name, field]));
  const chosen: StarterField[] = PREFERRED_FIELDS.map(name => byName.get(name)).filter((field): field is StarterField =>
    Boolean(field),
  );
  for (const field of fields) {
    if (chosen.length >= count) break;
    if (!chosen.includes(field) && !SKIPPED.test(field.name)) chosen.push(field);
  }
  return chosen.slice(0, count);
}

/** The token that names a record's identity: its number if it has one. */
const identityToken = (fields: StarterField[]): string =>
  fields.some(field => field.name === "number")
    ? "{{record.number}}"
    : fields.some(field => field.name === "name")
      ? "{{record.name}}"
      : "{{record.sys_id}}";

/**
 * What a brand-new template starts as: a complete document, not a blank page.
 *
 * Built against the target table's schema when it is known, so the first
 * template for `incident` opens on an incident's fields rather than on
 * placeholders that would all render blank.
 */
export function starterTemplate(kind: TemplateKind, fields: StarterField[] = []): PdfTemplate {
  return kind === "deck" ? starterDeck(fields) : starterDocument(fields);
}

function starterDocument(fields: StarterField[]): PdfTemplate {
  const identity = identityToken(fields);
  const has = (name: string) => fields.some(field => field.name === name);
  const rows = pickStarterFields(fields, 10)
    .filter(field => field.name !== "short_description")
    .map(field => ({ label: field.label, value: `{{record.${field.name}}}` }));

  const blocks: PdfBlock[] = [
    { type: "heading", text: `{{table.label}} ${identity}`, size: 20 },
    ...(has("short_description")
      ? [{ type: "text", text: "{{record.short_description}}", size: 12, color: "#3f3f46" } as PdfBlock]
      : []),
    { type: "divider" },
    { type: "spacer", height: 4 },
    { type: "fields", rows: rows.length ? rows : [{ label: "Record", value: identity }] },
  ];

  if (has("description")) {
    blocks.push(
      { type: "spacer", height: 8 },
      { type: "heading", text: "Description", size: 12 },
      { type: "text", text: "{{record.description}}" },
    );
  }

  return {
    page: { ...DEFAULT_PAGE, margins: { ...DEFAULT_MARGINS } },
    style: defaultStyle(DEFAULT_PAGE.fontSize),
    blocks,
    footer: { text: `${identity} · {{now.date}}`, showPageNumbers: true },
  };
}

/**
 * A deck starts on a slide, not on paper: 16:9, large type, generous margins,
 * one record per slide, and a title slide in front of them.
 */
function starterDeck(fields: StarterField[]): PdfTemplate {
  const identity = identityToken(fields);
  const has = (name: string) => fields.some(field => field.name === name);
  const picked = pickStarterFields(fields, 9).filter(
    field => !["number", "name", "short_description"].includes(field.name),
  );
  const stats = picked.slice(0, 3);
  const rest = picked.slice(3, 7);

  return {
    page: {
      ...DEFAULT_PAGE,
      size: "Slide16x9",
      margins: { top: 48, right: 56, bottom: 44, left: 56 },
      fontSize: 16,
      textColor: "#1f2937",
      mutedColor: "#6b7280",
      accentColor: "#1d4ed8",
      background: "#ffffff",
    },
    style: { ...defaultStyle(16), headingScale: 2, paragraphSpacing: 8 },
    cover: [
      { type: "spacer", height: 120 },
      { type: "heading", text: "{{deck.title}}", size: 44, align: "left" },
      { type: "text", text: "{{deck.count}} records from {{table.label}} · {{now.date}}", color: "#6b7280", size: 18 },
      { type: "spacer", height: 24 },
      { type: "divider", color: "#1d4ed8", thickness: 3 },
      { type: "text", text: "Prepared by {{user.name}}", color: "#6b7280", size: 14 },
    ],
    blocks: [
      { type: "text", text: `${identity}`, color: "#1d4ed8", bold: true, size: 14, spaceAfter: 2 },
      {
        type: "heading",
        text: has("short_description") ? "{{record.short_description}}" : identity,
        size: 30,
        spaceAfter: 18,
      },
      ...(stats.length
        ? [
            {
              type: "stats",
              items: stats.map(field => ({ label: field.label, value: `{{record.${field.name}}}` })),
            } as PdfBlock,
            { type: "spacer", height: 18 } as PdfBlock,
          ]
        : []),
      ...(rest.length
        ? [
            {
              type: "fields",
              rows: rest.map(field => ({ label: field.label, value: `{{record.${field.name}}}` })),
            } as PdfBlock,
          ]
        : []),
    ],
    footer: { text: "{{deck.title}} · {{deck.index}} / {{deck.count}}", showPageNumbers: false },
  };
}

/**
 * What a presentation built from nothing is drawn on: a deck's slide — its
 * size, type, colours and margins — with no record blocks, title slide or
 * furniture of its own.
 */
export function blankDeck(): PdfTemplate {
  const { page, style } = starterDeck([]);
  return { page, style, blocks: [], footer: { text: "", showPageNumbers: false } };
}

/* --------------------------------- blanks -------------------------------- */

/** What each block type starts as when it is added to a template. */
export function blankBlock(type: BlockType, kind: TemplateKind = "document"): PdfBlock {
  const deck = kind === "deck";

  switch (type) {
    case "heading":
      return { type: "heading", text: "{{record.number}}", size: deck ? 30 : 18 };
    case "text":
      return { type: "text", text: "" };
    case "image":
      return { type: "image", source: "", width: 140 };
    case "spacer":
      return { type: "spacer", height: 12 };
    case "divider":
      return { type: "divider" };
    case "columns":
      return {
        type: "columns",
        columns: [
          { heading: "LEFT", text: "{{record.short_description}}" },
          { heading: "RIGHT", text: "{{record.state}}" },
        ],
      };
    case "fields":
      return { type: "fields", rows: [{ label: "Number", value: "{{record.number}}" }] };
    case "relatedList":
      return {
        type: "relatedList",
        table: "",
        field: "",
        title: "",
        limit: DEFAULT_RELATED_LIMIT,
        columns: [],
        emptyText: "No records.",
        headerFill: "#f4f4f5",
      };
    case "stats":
      return {
        type: "stats",
        items: [
          { label: "State", value: "{{record.state}}" },
          { label: "Priority", value: "{{record.priority}}" },
        ],
      };
    case "chart":
      return {
        type: "chart",
        chart: "column",
        title: "",
        items: [
          { label: "Reassignments", value: "{{record.reassignment_count}}" },
          { label: "Reopens", value: "{{record.reopen_count}}" },
        ],
        height: deck ? 220 : 160,
        showValues: true,
        emptyText: "Nothing to chart.",
      };
    case "signatures":
      return {
        type: "signatures",
        parties: [
          { label: "Prepared by", caption: "Name, title and date" },
          { label: "Approved by", caption: "Name, title and date" },
        ],
      };
    case "reference":
      return { type: "reference", field: "", table: "", rows: [], layout: "card", link: true, emptyText: "" };
    case "code":
      return { type: "code", code: "{{record.description}}", title: "", lineNumbers: false };
    case "link":
      return { type: "link", text: "Open {{record.number}} in ServiceNow", url: "{{url.record}}" };
    case "callout":
      return { type: "callout", tone: "info", title: "Note", text: "{{record.short_description}}" };
    case "list":
      return { type: "list", style: "bullet", items: ["{{record.short_description}}", "{{record.state}}"] };
    case "table":
      return {
        type: "table",
        columns: [
          { header: "Item", width: 2 },
          { header: "Value", width: 3 },
        ],
        rows: [
          ["Number", "{{record.number}}"],
          ["State", "{{record.state}}"],
        ],
        headerFill: "#f4f4f5",
      };
    case "repeat":
      return {
        type: "repeat",
        table: "",
        field: "",
        limit: DEFAULT_RELATED_LIMIT,
        blocks: [
          { type: "heading", text: "{{row.index}}. {{row.number}} {{row.short_description}}", size: deck ? 22 : 12 },
          { type: "fields", rows: [{ label: "State", value: "{{row.state}}" }] },
        ],
        emptyText: "",
      };
    case "pageBreak":
      return { type: "pageBreak" };
  }
}

/** The token a reference block reads one of its rows from. */
export const referenceToken = (block: Pick<ReferenceBlock, "field">, path: string): string =>
  `{{record.${block.field}.${path}}}`;

/** Every string in a template that tokens can live in, for collecting them. */
export function templateStrings(template: PdfTemplate): string[] {
  const out: string[] = [
    template.footer.text,
    template.header?.text ?? "",
    template.watermark?.text ?? "",
    ...conditionStrings(template.header?.when),
    ...conditionStrings(template.watermark?.when),
  ];
  for (const block of [...template.blocks, ...(template.cover ?? [])]) out.push(...blockStrings(block));
  return out.filter(Boolean);
}

/**
 * The strings a condition fills in, groups and all. The cover's condition is
 * left out of `templateStrings`: it is tested with the batch's tokens, which
 * are never fetched with a record.
 */
export function conditionStrings(condition: Condition | undefined): string[] {
  if (!condition) return [];
  if ("all" in condition) return condition.all.flatMap(conditionStrings);
  if ("any" in condition) return condition.any.flatMap(conditionStrings);
  return [condition.value, condition.to ?? ""];
}

export function blockStrings(block: PdfBlock): string[] {
  return [...conditionStrings(block.when), ...ownStrings(block)];
}

/** Tokens that belong to a repeat's row, filled by the repeat itself rather than from the record. */
const ROW_TOKEN = /\{\{\s*row\.[^}]*\}\}/g;

function ownStrings(block: PdfBlock): string[] {
  switch (block.type) {
    case "repeat":
      // The record's own tokens inside are fetched with the record; the rows' are the repeat's.
      return [
        block.emptyText ?? "",
        ...[...conditionStrings(block.where), ...block.blocks.flatMap(blockStrings)].map(text =>
          text.replace(ROW_TOKEN, ""),
        ),
      ];
    case "heading":
    case "text":
      return [block.text];
    case "image":
      return [block.caption ?? ""];
    case "columns":
      return block.columns.flatMap(column => [column.heading ?? "", column.text]);
    case "fields":
      return block.rows.flatMap(row => [row.label, row.value]);
    case "relatedList":
      return [block.title ?? "", block.emptyText ?? "", ...block.columns.map(column => column.header)];
    case "stats":
      return block.items.flatMap(item => [item.label, item.value]);
    case "signatures":
      return block.parties.flatMap(party => [party.label, party.caption ?? ""]);
    case "reference":
      // Its own tokens, so the loader fetches the dot-walked fields and the stored sys_id.
      return block.field
        ? [
            block.title ?? "",
            block.emptyText ?? "",
            `{{raw.${block.field}}}`,
            ...(block.link ? ["{{url.instance}}"] : []),
            ...block.rows.flatMap(row => [row.label, row.field ? referenceToken(block, row.field) : ""]),
          ]
        : [];
    case "code":
      return [block.code, block.title ?? ""];
    case "chart":
      return [
        block.title ?? "",
        block.emptyText ?? "",
        ...(block.related || block.template
          ? []
          : block.items.flatMap(item => [item.label, item.value, item.to ?? "", item.start ?? "", item.end ?? ""])),
      ];
    case "link":
      return [block.text, block.url];
    case "callout":
      return [block.title ?? "", block.text];
    case "list":
      return block.items;
    case "table":
      return [...block.columns.map(column => column.header), ...block.rows.flat()];
    default:
      return [];
  }
}

/**
 * The identity of the rows a related-list block draws.
 *
 * Two blocks that ask for the same rows share one fetch, and a change to a
 * block's columns or query is a different key — which is how the editor knows
 * to fetch again rather than draw stale rows.
 */
export function relatedKey(block: RelatedListBlock): string {
  return JSON.stringify([
    block.table,
    block.field,
    block.query ?? "",
    block.orderBy ?? "",
    block.limit ?? DEFAULT_RELATED_LIMIT,
    [...new Set(block.columns.map(column => column.field))].sort(),
  ]);
}

/**
 * The rows a chart counts, asked for as a related list of one column: so they
 * are fetched, shared and keyed exactly as a list's rows are.
 */
export const chartRelatedList = (source: ChartSource): RelatedListBlock => ({
  type: "relatedList",
  table: source.table,
  field: source.field,
  ...(source.query ? { query: source.query } : {}),
  ...(source.start ? { orderBy: source.start } : {}),
  limit: MAX_RELATED_ROWS,
  columns: [...new Set([source.groupBy, source.thenBy, source.start, source.end])]
    .filter((field): field is string => Boolean(field))
    .map(field => ({ field, header: field, width: 1 })),
});

/** Every related-list block — and every chart counting related records — cover and body alike. */
export const relatedBlocks = (template: PdfTemplate): RelatedListBlock[] =>
  [...template.blocks, ...(template.cover ?? [])]
    .flatMap(block => (block.type === "repeat" ? [block, ...block.blocks] : [block]))
    .map(block =>
      block.type === "chart" && block.related?.groupBy
        ? chartRelatedList(block.related)
        : block.type === "repeat"
          ? repeatRelatedList(block)
          : block,
    )
    .filter((block): block is RelatedListBlock => block.type === "relatedList" && Boolean(block.table && block.field));

/** The chart templates a template places, cover and body alike, each once. */
export const chartTemplateIds = (template: PdfTemplate): string[] => [
  ...new Set(
    [...template.blocks, ...(template.cover ?? [])].flatMap(block =>
      block.type === "chart" && block.template ? [block.template] : [],
    ),
  ),
];

/** The fields of a row a repeat's blocks use: `{{row.x}}` and `{{row.raw.x}}`, not `{{row.index}}` or `{{row.count}}`. */
export function rowFields(block: RepeatBlock): string[] {
  const fields = new Set<string>();
  for (const text of [...conditionStrings(block.where), ...block.blocks.flatMap(blockStrings)]) {
    for (const match of text.matchAll(/\{\{\s*row\.(?:raw\.)?([A-Za-z_][A-Za-z0-9_.]*)/g)) {
      if (match[1] !== "index" && match[1] !== "count") fields.add(match[1]!);
    }
  }
  return [...fields].sort();
}

/** The rows a repeat draws its blocks for, asked for as a related list — so they are fetched and keyed alike. */
export const repeatRelatedList = (block: RepeatBlock): RelatedListBlock => ({
  type: "relatedList",
  table: block.table,
  field: block.field,
  ...(block.query ? { query: block.query } : {}),
  ...(block.orderBy ? { orderBy: block.orderBy } : {}),
  limit: block.limit ?? DEFAULT_RELATED_LIMIT,
  columns: rowFields(block).map(field => ({ field, header: field, width: 1 })),
});
