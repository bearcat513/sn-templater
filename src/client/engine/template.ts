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
import { DEFAULT_MARGINS, type Margins, type PageSize } from "./pdf";
import type { FontFamily } from "./pdfFonts";

export type TemplateKind = "document" | "deck";

export const TEMPLATE_KINDS: TemplateKind[] = ["document", "deck"];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  document: "PDF document",
  deck: "Slide deck",
};

/* -------------------------------- the page ------------------------------- */

export type PdfPageSetup = {
  size: PageSize;
  /** Paper on its side. Ignored for the slide sizes, which already are. */
  landscape?: boolean;
  margins: Margins;
  family: FontFamily;
  /** Body size in points. Headings are relative to it unless one says otherwise. */
  fontSize: number;
  /** Body text. */
  textColor: string;
  /** Secondary text: labels, captions, the footer. */
  mutedColor: string;
  /** Headings, rules and emphasis. */
  accentColor: string;
  /** The sheet itself. Absent is white paper; a slide often wants more. */
  background?: string;
};

/**
 * The letterhead: a logo and a block of text in the top margin of every page.
 *
 * Page furniture rather than a block, because it belongs on every page and is
 * drawn after layout, when the page count is known.
 */
export type PdfHeader = {
  /** A base64 `data:` URL. See ./image.ts for what may go in one. */
  logo?: string;
  logoWidth?: number;
  logoAlign?: "left" | "right";
  /** Address, tagline — tokens work here too. */
  text?: string;
  color?: string;
  rule?: boolean;
  firstPageOnly?: boolean;
};

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

/** How the document is set, as opposed to what is on it. */
export type PdfStyle = {
  lineHeight: number;
  paragraphSpacing: number;
  headingScale: number;
  headingFamily?: FontFamily;
  headingUppercase?: boolean;
  ruleColor: string;
  table: PdfTableStyle;
};

export type PdfTableStyle = {
  headerFill?: string;
  headerColor?: string;
  headerUppercase?: boolean;
  zebra?: string;
  gridColor: string;
  rowLines: boolean;
  cellPadding: number;
};

/** A word stamped across every page: DRAFT, CONFIDENTIAL, `{{record.state}}`. */
export type PdfWatermark = {
  text: string;
  uppercase?: boolean;
  color?: string;
  size?: number;
  opacity?: number;
  angle?: number;
};

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

export type BlockAlign = "left" | "center" | "right";

/** A column of a related list: a field path on the related table. */
export type ListColumn = {
  /** A field on the related table; dot-walking works (`assigned_to.email`). */
  field: string;
  header: string;
  /** A share of the table's width, normalised across the columns. */
  width: number;
  align?: BlockAlign;
};

export type RelatedListBlock = {
  type: "relatedList";
  /** The related table, e.g. `task_sla`. */
  table: string;
  /** The reference field on it that points back at the record, e.g. `task`. */
  field: string;
  /** Extra encoded query, ANDed on: `active=true`. */
  query?: string;
  /** A field to sort by; a leading `-` sorts descending. */
  orderBy?: string;
  /** Rows at most. The rest are counted in `{{list.count}}` but not drawn. */
  limit?: number;
  /** Drawn above the table. Tokens work, plus `{{list.count}}`. */
  title?: string;
  columns: ListColumn[];
  /** What to print when nothing matches. Empty prints nothing at all. */
  emptyText?: string;
  headerFill?: string;
  zebra?: string;
  fontSize?: number;
};

/**
 * A record that one of this record's reference fields points at — the caller,
 * the configuration item, the assignment group — as a card of its fields.
 *
 * Its values are dot-walked tokens (`{{record.caller_id.email}}`), so the
 * loader fetches them with the record itself and nothing is read twice.
 */
export type ReferenceBlock = {
  type: "reference";
  /** The reference field on this record, e.g. `caller_id`. */
  field: string;
  /** The table it refers to, e.g. `sys_user`. Used for the link to it. */
  table: string;
  /** Drawn at the top of the card. Tokens work. Absent is no title. */
  title?: string;
  /** Fields of the referenced record: a path on *its* table, and a label. */
  rows: { label: string; field: string }[];
  /** A boxed card, or label and value lines like a field list. */
  layout?: "card" | "plain";
  /** Makes the title a link to the referenced record on the instance. */
  link?: boolean;
  /** What to print when the field is empty. Empty prints nothing at all. */
  emptyText?: string;
  /** The card's edge and title. Absent is the page's accent. */
  color?: string;
};

/** A box of preformatted text — a script, a payload, a log line — in a fixed-width face. */
export type CodeBlock = {
  type: "code";
  /** Kept exactly as written: spaces, tabs and blank lines included. Tokens work. */
  code: string;
  /** A small label above the code: a language, a file name. */
  title?: string;
  size?: number;
  lineNumbers?: boolean;
  /** The box. Absent is a light grey. */
  background?: string;
  color?: string;
  spaceAfter?: number;
};

export type CalloutTone = "info" | "success" | "warning" | "critical" | "neutral";

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

export type ListStyle = "bullet" | "number" | "check";

export type ChartKind = "column" | "bar" | "line" | "pie" | "donut";

export const CHART_KINDS: { kind: ChartKind; label: string }[] = [
  { kind: "column", label: "Column" },
  { kind: "bar", label: "Bar" },
  { kind: "line", label: "Line" },
  { kind: "pie", label: "Pie" },
  { kind: "donut", label: "Donut" },
];

/**
 * A chart of figures, laid out by ./chart.ts and drawn the same on paper and
 * on screen.
 *
 * Its figures are either written into the block — a label and a value each,
 * tokens and all, so `{{record.reassignment_count}}` can be a bar — or
 * counted from the records that reference this one, grouped by one of their
 * fields: an incident's tasks by state, a change's approvals by approver.
 */
export type ChartBlock = {
  type: "chart";
  chart: ChartKind;
  /** Drawn above the chart. Tokens work, plus `{{list.count}}` when it counts related records. */
  title?: string;
  /** Written figures. A value that does not fill to a number is left out. */
  items: { label: string; value: string }[];
  /** When set, the figures are counted from related records instead of `items`. */
  related?: ChartSource;
  /** The plot's height in points, title and legend aside. */
  height: number;
  /** The one series' colour. A pie or donut takes the categorical palette instead. */
  color?: string;
  /** Each figure printed beside its mark. */
  showValues?: boolean;
  /** What to print when there is nothing to chart. Empty prints nothing at all. */
  emptyText?: string;
};

/** Records that reference this one, counted by the display value of one of their fields. */
export type ChartSource = {
  table: string;
  field: string;
  query?: string;
  groupBy: string;
};

export type PdfBlock =
  | { type: "heading"; text: string; size?: number; align?: BlockAlign; color?: string; spaceAfter?: number }
  | {
      type: "text";
      text: string;
      size?: number;
      align?: BlockAlign;
      color?: string;
      bold?: boolean;
      italic?: boolean;
      spaceAfter?: number;
    }
  | { type: "spacer"; height: number }
  | { type: "divider"; color?: string; thickness?: number }
  | {
      type: "image";
      source: string;
      width: number;
      align?: BlockAlign;
      caption?: string;
      spaceAfter?: number;
    }
  | { type: "columns"; gap?: number; columns: { heading?: string; text: string; align?: BlockAlign }[] }
  | { type: "fields"; rows: { label: string; value: string }[] }
  | RelatedListBlock
  | { type: "stats"; items: { label: string; value: string }[]; color?: string }
  | { type: "signatures"; parties: { label: string; caption?: string }[] }
  | ReferenceBlock
  | CodeBlock
  | ChartBlock
  | {
      type: "link";
      /** What is read. Tokens work. Empty uses the address itself. */
      text: string;
      /** Where it goes: a web address, mail or phone, or a path on this instance. Tokens work. */
      url: string;
      size?: number;
      align?: BlockAlign;
      color?: string;
      bold?: boolean;
      spaceAfter?: number;
    }
  | {
      type: "callout";
      tone: CalloutTone;
      title?: string;
      text: string;
      /** Overrides the tone's own colour for the edge and title. */
      color?: string;
    }
  | {
      type: "list";
      style: ListStyle;
      /** One entry each. An entry whose value runs over several lines is that many entries. */
      items: string[];
      size?: number;
      spaceAfter?: number;
    }
  | {
      type: "table";
      columns: { header: string; width: number; align?: BlockAlign }[];
      /** Cells, row by row. Tokens work in each. */
      rows: string[][];
      headerFill?: string;
      zebra?: string;
      fontSize?: number;
    }
  | { type: "pageBreak" };

export type BlockType = PdfBlock["type"];

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
  { type: "signatures", label: "Signatures", description: "Ruled areas for names and dates" },
  { type: "divider", label: "Divider", description: "A horizontal rule" },
  { type: "spacer", label: "Spacer", description: "Vertical space" },
  { type: "pageBreak", label: "Page break", description: "Start the next page" },
];

export const MAX_BLOCKS = 200;
export const MAX_RELATED_ROWS = 500;
export const DEFAULT_RELATED_LIMIT = 50;

export type PdfTemplate = {
  page: PdfPageSetup;
  style?: PdfStyle;
  header?: PdfHeader;
  watermark?: PdfWatermark;
  /**
   * Drawn once, before the first record: a title page for a document batch,
   * a title slide for a deck. Its tokens are the deck's, not a record's.
   */
  cover?: PdfBlock[];
  blocks: PdfBlock[];
  footer: {
    text: string;
    showPageNumbers: boolean;
  };
};

/* -------------------------------- starters ------------------------------- */

/** The fields of a table, as much of them as a starter template needs. */
export type StarterField = { name: string; label: string };

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
  const chosen: StarterField[] = PREFERRED_FIELDS.map(name => byName.get(name)).filter(
    (field): field is StarterField => Boolean(field),
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
    case "pageBreak":
      return { type: "pageBreak" };
  }
}

/** The token a reference block reads one of its rows from. */
export const referenceToken = (block: Pick<ReferenceBlock, "field">, path: string): string =>
  `{{record.${block.field}.${path}}}`;

/** Every string in a template that tokens can live in, for collecting them. */
export function templateStrings(template: PdfTemplate): string[] {
  const out: string[] = [template.footer.text, template.header?.text ?? "", template.watermark?.text ?? ""];
  for (const block of [...template.blocks, ...(template.cover ?? [])]) out.push(...blockStrings(block));
  return out.filter(Boolean);
}

export function blockStrings(block: PdfBlock): string[] {
  switch (block.type) {
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
        ...(block.related ? [] : block.items.flatMap(item => [item.label, item.value])),
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
  limit: MAX_RELATED_ROWS,
  columns: [{ field: source.groupBy, header: source.groupBy, width: 1 }],
});

/** Every related-list block — and every chart counting related records — cover and body alike. */
export const relatedBlocks = (template: PdfTemplate): RelatedListBlock[] =>
  [...template.blocks, ...(template.cover ?? [])]
    .map(block => (block.type === "chart" && block.related?.groupBy ? chartRelatedList(block.related) : block))
    .filter(
      (block): block is RelatedListBlock => block.type === "relatedList" && Boolean(block.table && block.field),
    );
