/**
 * The engine's data shapes: a template and its blocks, a chart template, and
 * what a render is handed and gives back. Types only — the defaults, starters
 * and logic that go with them live in ./template.ts and ./render.ts, which
 * re-export these so either place can be imported from.
 */
import type { LoadedChart } from "./chart";
import type { Margins, PageSize } from "./pdf";
import type { FontFamily } from "./pdfFonts";
import type { CustomSlide } from "./presentation";

/**
 * A chart is the third kind, and not like the other two: it draws no record.
 * It counts the records of its table that its filter matches, and is placed
 * by reference — in a document or deck as a block, on a custom slide as an
 * element — so changing it once changes it everywhere it is shown.
 */
export type TemplateKind = "document" | "deck" | "chart";

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
  /** Drawn only on the pages of records this holds for; absent is every page. */
  when?: Condition;
};

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
  /** Stamped only on the pages of records this holds for: DRAFT while `{{raw.state}}` is new. */
  when?: Condition;
};

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

export type ListStyle = "bullet" | "number" | "check";

export type ChartKind =
  | "column"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "funnel"
  | "stacked"
  | "heatmap"
  | "sankey"
  | "gantt";

/**
 * What a chart's figures are: one figure for each label; a figure for each
 * pair of labels — from and to, row and column, category and series; or a
 * span of time for each label.
 */
export type ChartShape = "single" | "pairs" | "spans";

/**
 * A chart of figures, laid out by ./chart.ts and drawn the same on paper and
 * on screen.
 *
 * Its figures are either written into the block — a label and a value each,
 * tokens and all, so `{{record.reassignment_count}}` can be a bar — or
 * counted from the records that reference this one, grouped by one of their
 * fields: an incident's tasks by state, a change's approvals by approver —
 * or they are a chart template's, placed here by reference.
 */
export type ChartBlock = {
  type: "chart";
  chart: ChartKind;
  /** Drawn above the chart. Tokens work, plus `{{list.count}}` when it counts related records. */
  title?: string;
  /**
   * Written figures. A value that does not fill to a number is left out. A
   * chart of pairs reads `to` as the second label; a Gantt chart reads
   * `start` and `end` as dates instead of a value.
   */
  items: ChartItem[];
  /** When set, the figures are counted from related records instead of `items`. */
  related?: ChartSource;
  /**
   * A chart template's sys_id. When set, the chart is that template's —
   * its records, its grouping and its look — drawn at this block's height,
   * under this block's title if it has one and the template's if not.
   */
  template?: string;
  /** The plot's height in points, title and legend aside. */
  height: number;
  /** The one series' colour. A pie or donut takes the categorical palette instead. */
  color?: string;
  /** Each figure printed beside its mark. */
  showValues?: boolean;
  /** What to print when there is nothing to chart. Empty prints nothing at all. */
  emptyText?: string;
};

/** One written figure, tokens and all. */
export type ChartItem = { label: string; value: string; to?: string; start?: string; end?: string };

/**
 * Records that reference this one, counted by the display value of one of
 * their fields — and of a second, for a chart of pairs — or, for a Gantt
 * chart, one bar each, named by `groupBy` and spanning `start` to `end`.
 */
export type ChartSource = {
  table: string;
  field: string;
  query?: string;
  groupBy: string;
  /** The second label of a pair. */
  thenBy?: string;
  /** A Gantt bar's date fields. */
  start?: string;
  end?: string;
};

/** What a chart template measures in each group: how many records, or a sum or average of a number field. */
export type ChartMeasure = "count" | "sum" | "avg" | "min" | "max";

/**
 * The body of a chart template.
 *
 * The records are the template's own table and filter — the record's
 * `table` and `query` columns, as a deck's are — grouped by one field and
 * measured in each group. The rest is the look, as a chart block has it.
 */
export type ChartTemplate = {
  version: 1;
  chart: ChartKind;
  /** Drawn above the chart. Tokens work: the deck's, and `{{list.count}}` for the records counted. */
  title?: string;
  /** A field on the table: one bar, point or slice per value of it — or, for a Gantt chart, what each record's bar is called. */
  groupBy: string;
  /** The second label of a pair, for a chart of pairs. */
  thenBy?: string;
  /** A Gantt bar's date fields: each record is one bar from `start` to `end`. */
  start?: string;
  end?: string;
  measure: ChartMeasure;
  /** The number field summed, averaged or compared; unused when counting. */
  field?: string;
  /** Largest first, or in the field's own order — a priority's, a state's — which suits a line. */
  order: "value" | "field";
  /** The plot's height in a document; on a slide the element's box decides. */
  height: number;
  color?: string;
  showValues?: boolean;
  emptyText?: string;
};

/**
 * When a block is drawn: a token-filled value tested against another. The
 * value is usually one token — `{{raw.priority}}`, `{{record.assigned_to}}` —
 * and the comparison ignores case and the spaces around either side.
 */
export type BlockCondition = {
  value: string;
  test: ConditionTest;
  /** What `equals`, `contains` and the number tests compare with. Tokens work. */
  to?: string;
};

export type ConditionTest = "empty" | "notEmpty" | "equals" | "notEquals" | "contains" | "greater" | "less";

/**
 * Several conditions at once: every one of them (`all`), or at least one
 * (`any`). Groups nest, at most two deep — "P1 and (unassigned or overdue)".
 */
export type ConditionGroup = { all: Condition[] } | { any: Condition[] };

/** A single comparison, or a group of them. */
export type Condition = BlockCondition | ConditionGroup;

/**
 * Its blocks, once for each record that references this one — a heading and
 * a callout per incident task, a slide per approval. Inside, `{{row.<field>}}`
 * is the row's display value, `{{row.raw.<field>}}` its stored value, and
 * `{{row.index}}` and `{{row.count}}` its place among them. The rows are
 * fetched like a related list's.
 */
export type RepeatBlock = {
  type: "repeat";
  table: string;
  field: string;
  query?: string;
  orderBy?: string;
  limit?: number;
  /**
   * Which of the fetched rows are drawn, tested with the row's own tokens —
   * `{{row.state}}`, `{{row.raw.priority}}` — as well as the record's. A
   * filter on top of `query`, for what an encoded query cannot say. The
   * rows left are what `{{row.index}}` and `{{row.count}}` count.
   */
  where?: Condition;
  /** Repeated per row. A repeat inside a repeat is not allowed. */
  blocks: PdfBlock[];
  /** Printed once when there are no rows. Empty prints nothing. */
  emptyText?: string;
};

export type PdfBlock = (
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
  | RepeatBlock
  | { type: "pageBreak" }
) & {
  /** Drawn only when this holds; absent is always. */
  when?: Condition;
};

export type BlockType = PdfBlock["type"];

export type PdfTemplate = {
  /** The body format's version (src/server/shared/schema.ts). Absent is 1. */
  version?: number;
  page: PdfPageSetup;
  style?: PdfStyle;
  header?: PdfHeader;
  watermark?: PdfWatermark;
  /**
   * Drawn once, before the first record: a title page for a document batch,
   * a title slide for a deck. Its tokens are the deck's, not a record's.
   */
  cover?: PdfBlock[];
  /** The cover is drawn only when this holds, tested with the batch's tokens. */
  coverWhen?: Condition;
  blocks: PdfBlock[];
  footer: {
    text: string;
    showPageNumbers: boolean;
  };
};

/** The fields of a table, as much of them as a starter template needs. */
export type StarterField = { name: string; label: string };

/* -------------------------------- rendering ------------------------------ */

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
  /**
   * The chart templates the template and its custom slides place, counted,
   * by sys_id. The same for every record: a chart template counts its own
   * table, not the record it is shown with.
   */
  charts?: Record<string, LoadedChart>;
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
  /** The job's chart templates, carried with each slide for the screen, which draws a slide at a time. */
  charts?: Record<string, LoadedChart>;
  /**
   * The template that draws it, when that is not the deck's own: a slide of a
   * template placed in the deck as a section. Its blocks, type, colours,
   * margins and furniture are that template's; the sheet stays the deck's.
   */
  template?: PdfTemplate;
};

export type PdfRenderResult = {
  bytes: Uint8Array;
  /** Tokens the template used that resolved to nothing. Rendered as blank. */
  unknownTokens: string[];
  /** Pictures and related lists that could not be drawn, each as a sentence. */
  problems: string[];
  pageCount: number;
};
