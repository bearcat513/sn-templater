/**
 * Presentations — a deck, saved, with slides of its own.
 *
 * A deck template draws one slide per record (and a title slide in front of
 * them). A presentation is a deck someone has *arranged*: the records it was
 * built from, the order its slides go in, slides hidden from the show, and
 * custom slides slotted in anywhere — blank slides people lay out themselves,
 * the way they would in PowerPoint, with text boxes, shapes, lines and
 * pictures placed where they like.
 *
 * ## The order is keys, not positions
 *
 * The record slides are drawn again every time the presentation opens, from
 * whatever its filter matches *now*. So the saved order names each slide by
 * what it is — `record:<sys_id>:<part>`, `cover:<part>`, `custom:<id>` —
 * rather than by where it was. A record that no longer matches drops out; a
 * record that has started to match is placed after the record it follows in
 * the filter's own order, so new rows land where the author would expect
 * rather than in a heap at the end.
 *
 * ## A custom slide is absolute
 *
 * The template's blocks flow down the page; a custom slide's elements do not.
 * Each has a box in points on the sheet — the same points the PDF writer and
 * the HTML sheet use — so a text box placed in the corner is in the corner of
 * the exported page too. Tokens work in a custom slide's text, filled with the
 * deck's values (`{{deck.title}}`, `{{now.date}}`, `{{slide.number}}`).
 *
 * ## What only the screen shows
 *
 * Build steps (an element appearing on a click), transitions between slides
 * and speaker notes belong to presenting. The PDF draws every element and
 * none of the rest — it is the handout, not the show.
 */
import { isEmbeddableImage } from "./image";
import { FONT_FAMILIES, type FontFamily } from "./pdfFonts";
import { CHART_KINDS, type ChartKind, type PdfPageSetup } from "./template";

/* --------------------------------- elements ------------------------------ */

export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

/** Text inside a shape or a text box. */
export type ElementText = {
  text: string;
  /** Points. */
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align: TextAlign;
  valign: VerticalAlign;
  /** Absent is the template's body face. */
  family?: FontFamily;
  /** Each paragraph becomes a bulleted item. */
  bullets?: boolean;
  lineHeight?: number;
  /** Shown while the text is empty, in the builder only: "Click to add title". */
  placeholder?: string;
  /** Code: every space kept, and lines broken anywhere rather than between words. */
  code?: boolean;
};

/** How an element arrives when the presenter clicks on. */
export type BuildEffect = "appear" | "fade" | "fly" | "zoom";

export const BUILD_EFFECTS: { effect: BuildEffect; label: string }[] = [
  { effect: "appear", label: "Appear" },
  { effect: "fade", label: "Fade in" },
  { effect: "fly", label: "Fly in" },
  { effect: "zoom", label: "Zoom in" },
];

type ElementBox = {
  id: string;
  /** Top-left corner and size, in points on the sheet. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0–1; absent is opaque. */
  opacity?: number;
  /** Degrees clockwise about the box's centre. A line has none: its ends say where it goes. */
  rotation?: number;
  /** Clicking the element opens this, in the presenter and in the PDF. Tokens work. */
  link?: string;
  /** Held back until a click while presenting; `order` is its place in the sequence. */
  build?: { effect: BuildEffect; order: number };
};

export type ShapeKind =
  | "rect"
  | "roundRect"
  | "ellipse"
  | "triangle"
  | "rightTriangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "parallelogram"
  | "trapezoid"
  | "chevron"
  | "arrow"
  | "star";

export const SHAPE_KINDS: { shape: ShapeKind; label: string }[] = [
  { shape: "rect", label: "Rectangle" },
  { shape: "roundRect", label: "Rounded rectangle" },
  { shape: "ellipse", label: "Ellipse" },
  { shape: "triangle", label: "Triangle" },
  { shape: "rightTriangle", label: "Right triangle" },
  { shape: "diamond", label: "Diamond" },
  { shape: "pentagon", label: "Pentagon" },
  { shape: "hexagon", label: "Hexagon" },
  { shape: "parallelogram", label: "Parallelogram" },
  { shape: "trapezoid", label: "Trapezoid" },
  { shape: "chevron", label: "Chevron" },
  { shape: "arrow", label: "Block arrow" },
  { shape: "star", label: "Star" },
];

/**
 * A shape with text in it. A text box is a rectangle with no fill and no
 * outline — exactly as PowerPoint treats one — so there is one element, not
 * two that would drift apart.
 */
export type ShapeElement = ElementBox &
  ElementText & {
    type: "shape";
    shape: ShapeKind;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  };

/**
 * A straight line across its box: top-left to bottom-right, or bottom-left to
 * top-right when flipped. Kept as a box so moving, nudging and aligning treat
 * it like everything else.
 */
export type LineElement = ElementBox & {
  type: "line";
  stroke: string;
  strokeWidth: number;
  flip?: boolean;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  dashed?: boolean;
};

/** A picture stretched to its box. Inserted at its own proportions, and resized keeping them. */
export type ImageElement = ElementBox & {
  type: "image";
  /** A PNG or JPEG `data:` URL — see ./image.ts. */
  source: string;
  stroke?: string;
  strokeWidth?: number;
};

/**
 * A table: a grid of cells with text in them. Its rows share its height
 * equally and its columns share its width by `columns`, so resizing the box
 * resizes the grid — as a PowerPoint table's does.
 */
export type TableElement = ElementBox & {
  type: "table";
  /** Cells, row by row; every row as long as the first. Tokens work. */
  rows: string[][];
  /** Width shares, one per column. Absent is equal columns. */
  columns?: number[];
  /** Set the first row as a header: bold, on `headerFill`. */
  header: boolean;
  size: number;
  color: string;
  family?: FontFamily;
  align: TextAlign;
  headerFill?: string;
  headerColor?: string;
  /** Every other body row. */
  banded?: string;
  /** Body cells. */
  fill?: string;
  /** The grid's lines. Absent is no lines. */
  border?: string;
};

/**
 * A chart template, placed on the slide: the template's own records, grouping
 * and look, laid out to fill the box — title, plot and all. It is a reference,
 * so the chart on the slide is whatever the template counts when the
 * presentation opens.
 */
export type ChartElement = ElementBox & {
  type: "chart";
  /** The chart template's sys_id. */
  template: string;
  /** Its name when it was placed: what the builder calls it before it has loaded, or once it is gone. */
  name?: string;
  /** Leave out the chart's title, when the slide has one of its own. */
  hideTitle?: boolean;
  /*
   * What this slide changes about the template's look. Each is absent for the
   * template's own; none changes what is counted.
   */
  /** Drawn as another kind of the same shape — a column chart as a bar, a pie or a line. */
  chart?: ChartKind;
  /** The title in place of the template's. Tokens work, `{{list.count}}` too. */
  title?: string;
  /** The one series' colour. */
  color?: string;
  /** Each figure printed beside its mark, or not, whatever the template says. */
  showValues?: boolean;
  /** The chart's text size in points; absent is the slide's body size. */
  size?: number;
  /** A card behind the chart, inset from its edges, and its outline. */
  fill?: string;
  stroke?: string;
  /** Leave out the sentence under a chart that shows less than every record. */
  hideNote?: boolean;
};

/** The look a chart element can change, which the format painter carries from one chart to another. */
export const CHART_LOOK_KEYS = ["hideTitle", "color", "showValues", "size", "fill", "stroke", "hideNote"] as const;

export type SlideElement = ShapeElement | LineElement | ImageElement | TableElement | ChartElement;

export const MAX_TABLE_ROWS = 20;
export const MAX_TABLE_COLUMNS = 10;

export type CustomSlide = {
  id: string;
  /** What the slide sorter calls it. Absent is the first line of its text. */
  name?: string;
  /** Absent is the template's own background. */
  background?: string;
  /** Draw the template's letterhead, watermark and footer on it too. */
  furniture?: boolean;
  /** Back to front. */
  elements: SlideElement[];
};

/* ----------------------------------- body -------------------------------- */

/** One place in the running order. */
export type SlideEntry = { key: string; hidden?: boolean };

/** How one slide gives way to the next in the presenter. */
export type Transition = "none" | "fade" | "push" | "wipe" | "zoom";

export const TRANSITIONS: { transition: Transition; label: string }[] = [
  { transition: "none", label: "None" },
  { transition: "fade", label: "Fade" },
  { transition: "push", label: "Push" },
  { transition: "wipe", label: "Wipe" },
  { transition: "zoom", label: "Zoom" },
];

/** What a slide carries besides what is on it: notes for the speaker, and how it comes in. */
export type SlideOptions = { notes?: string; transition?: Transition };

export type PresentationBody = {
  version: 1;
  slides: CustomSlide[];
  order: SlideEntry[];
  /** How every slide comes in, unless it says otherwise. Absent is a fade. */
  transition?: Transition;
  /**
   * By slide key, like the running order, so a record slide — drawn again
   * each time — keeps its notes for as long as the record is in the deck.
   */
  options?: Record<string, SlideOptions>;
};

export const DEFAULT_TRANSITION: Transition = "fade";
export const MAX_NOTES_LENGTH = 5000;

export const EMPTY_BODY: PresentationBody = { version: 1, slides: [], order: [] };

export const MAX_CUSTOM_SLIDES = 200;
export const MAX_ELEMENTS = 120;
export const MAX_PRESENTATION_BODY_LENGTH = 3_000_000;

export const customKey = (id: string): string => `custom:${id}`;
export const isCustomKey = (key: string): boolean => key.startsWith("custom:");

/** A short random id: unique within a presentation, which is all it has to be. */
export function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------- reading -------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const num = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
};

const HEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const optionalColor = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !HEX.test(value.trim())) return undefined;
  const raw = value.trim();
  return raw.startsWith("#") ? raw : `#${raw}`;
};

const colorOr = (value: unknown, fallback: string): string => optionalColor(value) ?? fallback;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const id = (value: unknown): string => String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || newId();

/** Room for elements to hang off the sheet, as they can while being dragged, without losing them. */
const COORDINATE_LIMIT = 4000;

/** Degrees, folded into -180–180 so the same turn is always stored the same way. */
export const normalizeRotation = (degrees: number): number => {
  const folded = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return Math.round(folded * 10) / 10;
};

const BUILD_NAMES = BUILD_EFFECTS.map(entry => entry.effect);

/** A line's box may be flat — a horizontal line is 0 high — where a shape's may not. */
function readBox(raw: Record<string, unknown>, min = 1): ElementBox {
  const opacity = raw.opacity === undefined ? undefined : num(raw.opacity, 1, 0.05, 1);
  const rotation = min > 0 && raw.rotation !== undefined ? normalizeRotation(num(raw.rotation, 0, -3600, 3600)) : 0;
  const link = String(raw.link ?? "").trim().slice(0, 2000);
  const build = isRecord(raw.build) && BUILD_NAMES.includes(raw.build.effect as BuildEffect) ? raw.build : null;
  return {
    id: id(raw.id),
    x: num(raw.x, 0, -COORDINATE_LIMIT, COORDINATE_LIMIT),
    y: num(raw.y, 0, -COORDINATE_LIMIT, COORDINATE_LIMIT),
    w: num(raw.w, 100, min, COORDINATE_LIMIT),
    h: num(raw.h, 40, min, COORDINATE_LIMIT),
    ...(opacity !== undefined && opacity < 1 ? { opacity } : {}),
    ...(rotation ? { rotation } : {}),
    ...(link ? { link } : {}),
    ...(build ? { build: { effect: build.effect as BuildEffect, order: Math.trunc(num(build.order, 1, 1, 999)) } } : {}),
  };
}

function readText(raw: Record<string, unknown>): ElementText {
  const family = FONT_FAMILIES.includes(raw.family as FontFamily) ? (raw.family as FontFamily) : undefined;
  const lineHeight = raw.lineHeight === undefined ? undefined : num(raw.lineHeight, 1.2, 0.8, 3);
  const placeholder = String(raw.placeholder ?? "").slice(0, 80);
  return {
    text: String(raw.text ?? "").slice(0, 5000),
    size: num(raw.size, 18, 4, 400),
    color: colorOr(raw.color, "#1f2937"),
    ...(raw.bold === true ? { bold: true } : {}),
    ...(raw.italic === true ? { italic: true } : {}),
    ...(raw.underline === true ? { underline: true } : {}),
    align: oneOf(raw.align, ["left", "center", "right"] as const, "left"),
    valign: oneOf(raw.valign, ["top", "middle", "bottom"] as const, "top"),
    ...(family ? { family } : {}),
    ...(raw.bullets === true ? { bullets: true } : {}),
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(raw.code === true ? { code: true } : {}),
  };
}

function readTable(value: Record<string, unknown>, box: ElementBox): TableElement | null {
  const raw = (Array.isArray(value.rows) ? value.rows : []).slice(0, MAX_TABLE_ROWS);
  const width = Math.min(MAX_TABLE_COLUMNS, Math.max(1, ...raw.map(row => (Array.isArray(row) ? row.length : 0))));
  const rows = raw.map(row => Array.from({ length: width }, (_, index) => String((Array.isArray(row) ? row[index] : "") ?? "").slice(0, 1000)));
  if (!rows.length) return null;
  const columns = Array.isArray(value.columns) && value.columns.length === width
    ? value.columns.map(share => num(share, 1, 0.1, 100))
    : undefined;
  const family = FONT_FAMILIES.includes(value.family as FontFamily) ? (value.family as FontFamily) : undefined;
  const headerFill = optionalColor(value.headerFill);
  const headerColor = optionalColor(value.headerColor);
  const banded = optionalColor(value.banded);
  const fill = optionalColor(value.fill);
  const border = optionalColor(value.border);
  return {
    type: "table",
    ...box,
    rows,
    ...(columns ? { columns } : {}),
    header: value.header !== false,
    size: num(value.size, 14, 4, 200),
    color: colorOr(value.color, "#1f2937"),
    ...(family ? { family } : {}),
    align: oneOf(value.align, ["left", "center", "right"] as const, "left"),
    ...(headerFill ? { headerFill } : {}),
    ...(headerColor ? { headerColor } : {}),
    ...(banded ? { banded } : {}),
    ...(fill ? { fill } : {}),
    ...(border ? { border } : {}),
  };
}

/** Drop, don't refuse: an element this version cannot draw is left out, not the slide. */
function readElement(value: unknown): SlideElement | null {
  if (!isRecord(value)) return null;
  const box = readBox(value, value.type === "line" ? 0 : 1);
  const strokeWidth = (fallback: number) => num(value.strokeWidth, fallback, 0, 40);

  switch (value.type) {
    case "shape": {
      const fill = optionalColor(value.fill);
      const stroke = optionalColor(value.stroke);
      return {
        type: "shape",
        ...box,
        shape: oneOf(
          value.shape,
          SHAPE_KINDS.map(entry => entry.shape),
          "rect",
        ),
        ...(fill ? { fill } : {}),
        ...(stroke ? { stroke, strokeWidth: strokeWidth(1.5) } : {}),
        ...readText(value),
      };
    }
    case "line":
      return {
        type: "line",
        ...box,
        stroke: colorOr(value.stroke, "#1f2937"),
        strokeWidth: strokeWidth(2) || 2,
        ...(value.flip === true ? { flip: true } : {}),
        ...(value.arrowStart === true ? { arrowStart: true } : {}),
        ...(value.arrowEnd === true ? { arrowEnd: true } : {}),
        ...(value.dashed === true ? { dashed: true } : {}),
      };
    case "image": {
      const source = typeof value.source === "string" ? value.source.trim() : "";
      if (!source || !isEmbeddableImage(source)) return null;
      const stroke = optionalColor(value.stroke);
      return {
        type: "image",
        ...box,
        source,
        ...(stroke ? { stroke, strokeWidth: strokeWidth(1) } : {}),
      };
    }
    case "table":
      return readTable(value, box);
    case "chart": {
      const template = String(value.template ?? "");
      if (!/^[0-9a-f]{32}$/.test(template)) return null;
      const name = String(value.name ?? "").trim().slice(0, 100);
      return {
        type: "chart",
        ...box,
        template,
        ...(name ? { name } : {}),
        ...(value.hideTitle === true ? { hideTitle: true } : {}),
        ...readChartLook(value),
      };
    }
    default:
      return null;
  }
}

/** A chart element's own changes to its template's look — each one only if it reads. */
function readChartLook(value: Record<string, unknown>): Partial<ChartElement> {
  const chart = CHART_KINDS.find(entry => entry.kind === value.chart)?.kind;
  const title = typeof value.title === "string" ? value.title.slice(0, 200) : undefined;
  const color = optionalColor(value.color);
  const fill = optionalColor(value.fill);
  const stroke = optionalColor(value.stroke);
  return {
    ...(chart ? { chart } : {}),
    ...(title?.trim() ? { title } : {}),
    ...(color ? { color } : {}),
    ...(typeof value.showValues === "boolean" ? { showValues: value.showValues } : {}),
    ...(value.size !== undefined && value.size !== null ? { size: num(value.size, 12, 6, 32) } : {}),
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    ...(value.hideNote === true ? { hideNote: true } : {}),
  };
}

function readSlide(value: unknown): CustomSlide | null {
  if (!isRecord(value)) return null;
  const background = optionalColor(value.background);
  const name = String(value.name ?? "").trim().slice(0, 80);
  return {
    id: id(value.id),
    ...(name ? { name } : {}),
    ...(background ? { background } : {}),
    ...(value.furniture === true ? { furniture: true } : {}),
    elements: (Array.isArray(value.elements) ? value.elements : [])
      .slice(0, MAX_ELEMENTS)
      .map(readElement)
      .filter((element): element is SlideElement => element !== null),
  };
}

/**
 * Reads a presentation body — the stored JSON, or an object — into one the
 * builder and the renderers can use without checking anything again. An
 * empty or unreadable body is a presentation with nothing arranged yet.
 */
export function readPresentation(raw: unknown): PresentationBody {
  let source: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { ...EMPTY_BODY };
    try {
      source = JSON.parse(raw);
    } catch {
      return { ...EMPTY_BODY };
    }
  }
  if (!isRecord(source)) return { ...EMPTY_BODY };

  const seen = new Set<string>();
  const slides = (Array.isArray(source.slides) ? source.slides : [])
    .slice(0, MAX_CUSTOM_SLIDES)
    .map(readSlide)
    .filter((slide): slide is CustomSlide => {
      if (!slide || seen.has(slide.id)) return false;
      seen.add(slide.id);
      return true;
    });

  const keys = new Set<string>();
  const order = (Array.isArray(source.order) ? source.order : [])
    .map((entry): SlideEntry | null => {
      if (!isRecord(entry) || typeof entry.key !== "string") return null;
      const key = entry.key.slice(0, 120);
      if (!key || keys.has(key)) return null;
      keys.add(key);
      return entry.hidden === true ? { key, hidden: true } : { key };
    })
    .filter((entry): entry is SlideEntry => entry !== null);

  const transitions = TRANSITIONS.map(entry => entry.transition);
  const options: Record<string, SlideOptions> = {};
  if (isRecord(source.options)) {
    for (const [key, entry] of Object.entries(source.options).slice(0, 1000)) {
      if (!isRecord(entry) || !key || key.length > 120) continue;
      const notes = String(entry.notes ?? "").slice(0, MAX_NOTES_LENGTH);
      const transition = transitions.includes(entry.transition as Transition) ? (entry.transition as Transition) : undefined;
      if (notes.trim() || transition) options[key] = { ...(notes.trim() ? { notes } : {}), ...(transition ? { transition } : {}) };
    }
  }
  const transition = transitions.includes(source.transition as Transition) ? (source.transition as Transition) : undefined;

  return {
    version: 1,
    slides,
    order,
    ...(transition ? { transition } : {}),
    ...(Object.keys(options).length ? { options } : {}),
  };
}

/** A slide's notes or transition changed; an option set back to nothing is dropped. */
export function withSlideOptions(body: PresentationBody, key: string, change: Partial<SlideOptions>): PresentationBody {
  const next: SlideOptions = { ...body.options?.[key], ...change };
  if (!next.notes?.trim()) delete next.notes;
  if (!next.transition) delete next.transition;
  const options = { ...body.options };
  if (Object.keys(next).length) options[key] = next;
  else delete options[key];
  return { ...body, options };
}

/** One transition for every slide: the deck's default, with each slide's own choice cleared. */
export function applyTransitionToAll(body: PresentationBody, transition: Transition): PresentationBody {
  let next: PresentationBody = { ...body, transition };
  for (const key of Object.keys(body.options ?? {})) next = withSlideOptions(next, key, { transition: undefined });
  return next;
}

/**
 * The order a custom slide's build steps play in: by their own order, then
 * back to front. What the presenter steps through, and the numbers the
 * builder shows on each element.
 */
export function buildSequence(slide: CustomSlide): string[] {
  return slide.elements
    .map((element, index) => ({ element, index }))
    .filter(entry => entry.element.build)
    .sort((a, b) => a.element.build!.order - b.element.build!.order || a.index - b.index)
    .map(entry => entry.element.id);
}

export const serializePresentation = (body: PresentationBody): string => JSON.stringify(readPresentation(body));

/** The chart templates a presentation's custom slides place, each once. */
export const presentationChartIds = (body: PresentationBody): string[] => [
  ...new Set(body.slides.flatMap(slide => slide.elements.flatMap(element => (element.type === "chart" ? [element.template] : [])))),
];

/* -------------------------------- arranging ------------------------------ */

/** Anything with a key — a drawn slide, before it is placed. */
type Keyed = { key: string };

/**
 * The running order: the saved one, reconciled with the slides that exist now.
 *
 * Generated slides are given in the deck's natural order. Saved keys whose
 * slide is gone are dropped. A generated slide the saved order has never seen
 * goes in among its own kind — a record's slide among the record slides —
 * after the nearest one before it in natural order, or else before the
 * nearest one after it; only when there are none of its kind placed does it
 * follow whatever generated slide came before it.
 */
export function arrangeKeys<T extends Keyed>(
  generated: T[],
  custom: T[],
  order: SlideEntry[],
): { item: T; hidden: boolean }[] {
  const available = new Map<string, T>();
  for (const item of [...generated, ...custom]) available.set(item.key, item);

  const placed: { item: T; hidden: boolean }[] = [];
  for (const entry of order) {
    const item = available.get(entry.key);
    if (item) placed.push({ item, hidden: entry.hidden === true });
  }
  const at = (key: string) => placed.findIndex(entry => entry.item.key === key);

  // `cover:1`, `record:<id>:1` — the part before the first colon is the kind.
  const kind = (key: string) => key.slice(0, key.indexOf(":"));
  const neighbour = (index: number, step: 1 | -1, same: boolean): number => {
    for (let other = index + step; other >= 0 && other < generated.length; other += step) {
      const key = generated[other]!.key;
      if (same && kind(key) !== kind(generated[index]!.key)) continue;
      const position = at(key);
      if (position !== -1) return position;
    }
    return -1;
  };

  generated.forEach((item, index) => {
    if (at(item.key) !== -1) return;
    const before = neighbour(index, -1, true);
    const after = before === -1 ? neighbour(index, 1, true) : -1;
    const anyBefore = before === -1 && after === -1 ? neighbour(index, -1, false) : -1;
    let insertAt = before !== -1 ? before + 1 : after !== -1 ? after : anyBefore !== -1 ? anyBefore + 1 : -1;
    if (insertAt === -1) {
      // Nothing before it is placed: in front of the first generated slide that is.
      const firstGenerated = placed.findIndex(entry => !isCustomKey(entry.item.key));
      insertAt = firstGenerated === -1 ? placed.length : firstGenerated;
    }
    placed.splice(insertAt, 0, { item, hidden: false });
  });

  // A custom slide the order lost track of still belongs to the presentation.
  for (const item of custom) if (at(item.key) === -1) placed.push({ item, hidden: false });

  return placed;
}

/** The order written back: every slide, where it is now. */
export const orderOf = (slides: { key: string; hidden?: boolean }[]): SlideEntry[] =>
  slides.map(slide => (slide.hidden ? { key: slide.key, hidden: true } : { key: slide.key }));

/* -------------------------------- new slides ----------------------------- */

export type SlideLayout = "blank" | "title" | "titleContent" | "section" | "twoContent" | "titleOnly";

export const SLIDE_LAYOUTS: { layout: SlideLayout; label: string }[] = [
  { layout: "blank", label: "Blank" },
  { layout: "title", label: "Title slide" },
  { layout: "titleContent", label: "Title and content" },
  { layout: "section", label: "Section header" },
  { layout: "twoContent", label: "Two content" },
  { layout: "titleOnly", label: "Title only" },
];

/** The part of the sheet a page setup leaves for content. */
type Frame = { width: number; height: number; page: PdfPageSetup };

/** A text box: a rectangle with no fill or outline, in the template's own type. */
export function textBox(frame: Frame, box: Omit<ElementBox, "id">, text: Partial<ElementText> = {}): ShapeElement {
  return {
    type: "shape",
    shape: "rect",
    id: newId(),
    ...box,
    text: "",
    size: frame.page.fontSize,
    color: frame.page.textColor,
    align: "left",
    valign: "top",
    ...text,
  };
}

/**
 * A new slide in one of PowerPoint's stock layouts, set in the template's own
 * colours, faces and margins so it sits in the deck rather than beside it.
 */
export function layoutSlide(layout: SlideLayout, frame: Frame): CustomSlide {
  const { width, height, page } = frame;
  const left = page.margins.left;
  const top = page.margins.top;
  const innerWidth = width - page.margins.left - page.margins.right;
  const innerHeight = height - page.margins.top - page.margins.bottom;
  const title = (box: Omit<ElementBox, "id">, size: number, extra: Partial<ElementText> = {}) =>
    textBox(frame, box, { placeholder: "Click to add title", size, bold: true, color: page.accentColor, ...extra });
  const body = (box: Omit<ElementBox, "id">, extra: Partial<ElementText> = {}) =>
    textBox(frame, box, { placeholder: "Click to add text", size: Math.max(14, page.fontSize + 2), bullets: true, ...extra });

  const titleHeight = Math.round(innerHeight * 0.2);
  let elements: SlideElement[] = [];

  switch (layout) {
    case "blank":
      break;
    case "title":
      elements = [
        title({ x: left, y: top + innerHeight * 0.28, w: innerWidth, h: innerHeight * 0.26 }, 44, {
          align: "center",
          valign: "bottom",
        }),
        textBox(
          frame,
          { x: left + innerWidth * 0.1, y: top + innerHeight * 0.58, w: innerWidth * 0.8, h: innerHeight * 0.16 },
          { placeholder: "Click to add subtitle", size: 20, color: page.mutedColor, align: "center" },
        ),
      ];
      break;
    case "titleContent":
      elements = [
        title({ x: left, y: top, w: innerWidth, h: titleHeight }, 32, { valign: "middle" }),
        body({ x: left, y: top + titleHeight + 12, w: innerWidth, h: innerHeight - titleHeight - 12 }),
      ];
      break;
    case "section":
      elements = [
        title({ x: left, y: top + innerHeight * 0.3, w: innerWidth, h: innerHeight * 0.24 }, 40, { valign: "bottom" }),
        textBox(
          frame,
          { x: left, y: top + innerHeight * 0.56, w: innerWidth, h: innerHeight * 0.14 },
          { placeholder: "Click to add text", size: 18, color: page.mutedColor },
        ),
      ];
      break;
    case "twoContent": {
      const gap = 24;
      const half = (innerWidth - gap) / 2;
      const y = top + titleHeight + 12;
      const h = innerHeight - titleHeight - 12;
      elements = [
        title({ x: left, y: top, w: innerWidth, h: titleHeight }, 32, { valign: "middle" }),
        body({ x: left, y, w: half, h }),
        body({ x: left + half + gap, y, w: half, h }),
      ];
      break;
    }
    case "titleOnly":
      elements = [title({ x: left, y: top, w: innerWidth, h: titleHeight }, 32, { valign: "middle" })];
      break;
  }

  return { id: newId(), elements };
}

/** What a custom slide is called in the sorter and the presenter. */
export function slideName(slide: CustomSlide): string {
  if (slide.name) return slide.name;
  for (const element of slide.elements) {
    if (element.type !== "shape" || element.code) continue;
    const line = element.text.split("\n").find(part => part.trim());
    if (line) return line.trim().slice(0, 60);
  }
  return "Custom slide";
}

/** A slide copied, with fresh ids, so the copy and the original are edited apart. */
export function cloneSlide(slide: CustomSlide): CustomSlide {
  return { ...structuredClone(slide), id: newId(), elements: slide.elements.map(cloneElement) };
}

export const cloneElement = <T extends SlideElement>(element: T): T => ({ ...structuredClone(element), id: newId() });
