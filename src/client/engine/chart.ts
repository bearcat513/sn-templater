/**
 * Charts — figures laid out as marks, once, for both renderers.
 *
 * d3 does the arithmetic: the scales, the round tick values, the counting of
 * related rows and the angles of a pie. What comes out is not SVG and not PDF
 * operators but a list of plain marks — polygons, polylines, dots, hairlines
 * and single lines of text — in points from the chart's top-left corner. The
 * PDF writer draws them with its own primitives (./render.ts) and the sheet
 * draws them as SVG (../slides/Chart.tsx), so the preview and the file put
 * every bar in the same place, as everything else in this engine does.
 *
 * The figures come from one of three places: a chart block's own items, the
 * related rows it counts, or a chart template — a chart kept as a template of
 * its own, counted across its table by the loader (../data/charts.ts) and
 * placed by reference in a document, a deck or on a custom slide.
 *
 * Text is measured with the PDF's own font metrics, so a label that is cut
 * short with an ellipsis is cut at the same letter in both.
 *
 * ## The look
 *
 * Thin marks and quiet chrome: bars at most 24pt thick with a rounded data
 * end and a square baseline, 2pt lines with ringed dots, hairline gridlines,
 * text in the page's own inks — never in a series colour. A pie keeps its
 * slices apart with a gap of the sheet's own colour, takes its colours in a
 * fixed order, and folds whatever is past the eighth into "Other".
 *
 * ## Pairs and spans
 *
 * Most charts draw one figure per label. A stacked column, a heatmap and a
 * Sankey diagram draw a figure per pair of labels — a column and its stack, a
 * row and its column, a source and where it flows to — carried as a point's
 * `to`. A Gantt chart draws a span of time per label, carried as a point's
 * `start` and `end`, in milliseconds since 1970 and read as UTC dates.
 */
import { ascending, descending, format, max, min, pie, rollup, scaleBand, scaleLinear, scalePoint, scaleUtc, sum, utcFormat } from "d3";
import type { PdfDocument } from "./pdf";
import { measureText, truncateToWidth, type FontFamily } from "./pdfFonts";
import type { RelatedRows } from "./render";
import { chartRelatedList, chartShape, relatedKey, type ChartBlock, type ChartKind, type ChartTemplate } from "./template";

/* --------------------------------- palette ------------------------------- */

/**
 * The categorical order, validated for colour-blind separation between
 * neighbours. The order is the safety mechanism: slices take these in turn,
 * never cycled — a ninth category is folded into "Other" instead.
 */
export const CHART_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

/** "Other" is not a category of its own, so it does not take a hue. */
const OTHER_COLOR = "#a1a1aa";

const GRID_COLOR = "#e4e4e7";
const AXIS_COLOR = "#a1a1aa";

/* ---------------------------------- data --------------------------------- */

export type ChartDatum = {
  label: string;
  value: number;
  color?: string;
  /** A pair's second label: the stack, the column, or where a flow goes. */
  to?: string;
  /** A span's start and end, for a Gantt chart. The value is its length in days. */
  start?: number;
  end?: number;
};

export type ChartData = {
  points: ChartDatum[];
  /** For `{{list.count}}` in the title: how many related records matched. */
  count?: number;
  /** A sentence under the chart when it shows less than everything. */
  note?: string;
  /** Why the related rows could not be read, when they could not. */
  error?: string;
};

/** What a chart looks like, whichever of a block or a chart template says so. */
export type ChartLook = Pick<ChartBlock, "chart" | "height" | "color" | "showValues">;

/**
 * A chart template, read and counted: what the renderers are handed, keyed
 * by the template's sys_id, on the render job (see ./render.ts).
 */
export type LoadedChart = {
  sysId: string;
  name: string;
  /** The table counted. */
  table: string;
  spec: ChartTemplate;
  /** Already in order and folded, as the template's look wants them. */
  points: ChartDatum[];
  /** Records counted. */
  total: number;
  note?: string;
  /** Why it could not be read or counted, when it could not. */
  error?: string;
};

/** Most bars or columns drawn; the rest fold into "Other". */
const MAX_BARS = 24;
/** Most slices; the eighth hue is the last, so a ninth category is "Other". */
const MAX_SLICES = CHART_PALETTE.length;
const MAX_LINE_POINTS = 60;
/** Most bars on a Gantt chart: one row each, and past this the rows are too thin to name. */
export const MAX_SPANS = 40;
/** Most rows and columns of a heatmap. */
const MAX_HEAT_ROWS = 20;
const MAX_HEAT_COLUMNS = 16;
/** Most nodes on either side of a two-sided Sankey diagram, and most flows of any other. */
const MAX_SANKEY_NODES = 12;
const MAX_SANKEY_LINKS = 60;

const DAY = 86_400_000;

/** Line and area read left to right in their own order, rather than largest first. */
const sequential = (kind: ChartKind) => kind === "line" || kind === "area";

/**
 * A filled-in value as a number: `1,234`, `42%`, `$9.50` and ` 7 ` all read;
 * an empty field, a date or a word does not, and its figure is left out.
 */
export function readFigure(text: string): number | null {
  const cleaned = text
    .replace(/[\s,]/g, "")
    .replace(/^[^\d+\-.]+/, "")
    .replace(/%$/, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * A filled-in date as milliseconds: a stored value — `2026-10-19`,
 * `2026-10-19 14:30:00`, read as UTC as the instance stores it — or anything
 * else the browser reads as a date. An empty field or a word is not one.
 */
export function readDate(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const stored = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(trimmed);
  if (stored) {
    const [, y, mo, d, h = "0", mi = "0", sec = "0"] = stored;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A span's start and end, read: no start is no span, and no end — or one before it — is a milestone. */
export function spanPoints(spans: { label: string; start: string; end: string }[]): ChartDatum[] {
  return spans
    .flatMap((span): ChartDatum[] => {
      const start = readDate(span.start);
      if (start === null) return [];
      const end = Math.max(start, readDate(span.end) ?? start);
      return [{ label: span.label, value: (end - start) / DAY, start, end }];
    })
    .sort((a, b) => ascending(a.start, b.start) || ascending(a.end, b.end));
}

/** Records counted by one field, or by two into pairs, in the order each first appears. */
function countRows(rows: Record<string, string>[], field: string, thenBy?: string): ChartDatum[] {
  const counted = new Map<string, ChartDatum>();
  for (const row of rows) {
    const label = row[field]?.trim() || "(empty)";
    const to = thenBy ? row[thenBy]?.trim() || "(empty)" : undefined;
    const key = JSON.stringify([label, to]);
    const point = counted.get(key);
    if (point) point.value++;
    else counted.set(key, { label, ...(to !== undefined ? { to } : {}), value: 1 });
  }
  return [...counted.values()];
}

/** Pairs largest first: the labels by their totals, and within a label its second labels by theirs. */
function orderPairs(points: ChartDatum[]): ChartDatum[] {
  const totals = rollup(points, group => sum(group, point => Math.abs(point.value)), point => point.label);
  const toTotals = rollup(points, group => sum(group, point => Math.abs(point.value)), point => point.to);
  return [...points].sort(
    (a, b) =>
      descending(totals.get(a.label), totals.get(b.label)) ||
      ascending(a.label, b.label) ||
      descending(toTotals.get(a.to), toTotals.get(b.to)) ||
      ascending(a.to, b.to),
  );
}

/**
 * The figures a chart block draws for one record: its own items, filled and
 * read as numbers, or its related rows counted by the grouping field.
 */
export function chartData(
  block: ChartBlock,
  fill: (text: string) => string,
  related: Record<string, RelatedRows>,
  charts: Record<string, LoadedChart> = {},
): ChartData {
  if (block.template) {
    // Not loaded yet, or not there at all: nothing to draw, and the loader has said why.
    const loaded = charts[block.template];
    if (!loaded) return { points: [] };
    return {
      points: loaded.points,
      count: loaded.total,
      ...(loaded.note ? { note: loaded.note } : {}),
      ...(loaded.error ? { error: loaded.error } : {}),
    };
  }

  const shape = chartShape(block.chart);

  if (block.related?.groupBy) {
    const source = block.related;
    const data = related[relatedKey(chartRelatedList(source))];
    const rows = data?.rows ?? [];
    const total = data?.total ?? rows.length;
    let points: ChartDatum[];
    if (shape === "spans") {
      points = source.start
        ? spanPoints(
            rows.map(row => ({
              label: row[source.groupBy]?.trim() || "(empty)",
              start: row[`raw.${source.start}`] ?? "",
              end: source.end ? (row[`raw.${source.end}`] ?? "") : "",
            })),
          )
        : [];
    } else if (shape === "pairs") {
      points = orderPairs(countRows(rows, source.groupBy, source.thenBy || undefined));
    } else {
      // Categories by size, except along a line, which reads left to right in their own order.
      points = countRows(rows, source.groupBy).sort(
        sequential(block.chart)
          ? (a, b) => ascending(a.label, b.label)
          : (a, b) => descending(a.value, b.value) || ascending(a.label, b.label),
      );
    }
    return {
      points: fold(block, points),
      count: total,
      ...(total > rows.length ? { note: `Counted from the first ${rows.length} of ${total} records.` } : {}),
      ...(data?.error ? { error: data.error } : {}),
    };
  }

  if (shape === "spans") {
    const spans = block.items.map(item => ({
      label: fill(item.label).trim(),
      start: fill(item.start ?? ""),
      end: fill(item.end ?? ""),
    }));
    return { points: fold(block, spanPoints(spans)) };
  }

  const points = block.items
    .map(item => ({
      label: fill(item.label).trim(),
      value: readFigure(fill(item.value)),
      ...(shape === "pairs" ? { to: fill(item.to ?? "").trim() } : {}),
    }))
    .filter((item): item is ChartDatum => item.value !== null && (shape !== "pairs" || Boolean(item.to)));
  return { points: fold(block, points) };
}

/**
 * What a chart block draws as: its own look and words, or — placed from a
 * chart template — the template's, at the block's height and under the
 * block's own title when it has one.
 */
export function resolveChart(
  block: ChartBlock,
  charts: Record<string, LoadedChart> = {},
): { look: ChartLook; title?: string; emptyText?: string } {
  const spec = block.template ? charts[block.template]?.spec : undefined;
  if (!spec) return { look: block, title: block.title, emptyText: block.emptyText };
  return { look: { ...spec, height: block.height }, title: block.title || spec.title, emptyText: spec.emptyText };
}

/**
 * A chart template's groups — label and measure, in the order the instance
 * gave them, which is the grouping field's own — as the chart draws them.
 */
export function chartPoints(spec: ChartTemplate, groups: ChartDatum[]): ChartDatum[] {
  const shape = chartShape(spec.chart);
  const ordered =
    shape === "spans"
      ? [...groups].sort((a, b) => ascending(a.start, b.start) || ascending(a.end, b.end))
      : spec.order === "field"
        ? groups
        : shape === "pairs"
          ? orderPairs(groups)
          : [...groups].sort((a, b) => descending(a.value, b.value) || ascending(a.label, b.label));
  return fold(spec, ordered);
}

/**
 * A chart template's counted figures, drawn as another kind of the same
 * shape: kept in the order they came and folded again for what the new kind
 * can show — a column chart's twenty bars become a pie's eight slices.
 */
export function redrawAs(spec: ChartTemplate, chart: ChartKind, points: ChartDatum[]): ChartDatum[] {
  if (chart === spec.chart || chartShape(chart) !== chartShape(spec.chart)) return points;
  return chartPoints({ ...spec, chart, order: "field" }, points);
}

/** Past what the chart can show, the smallest figures become one "Other", or a line is cut short. */
function fold(block: ChartLook, points: ChartDatum[]): ChartDatum[] {
  switch (chartShape(block.chart)) {
    case "spans":
      return points.slice(0, MAX_SPANS);
    case "pairs":
      return foldPairs(block.chart, points);
  }
  if (sequential(block.chart)) return points.slice(0, MAX_LINE_POINTS);
  const round = block.chart === "pie" || block.chart === "donut";
  // A pie of negative slices means nothing, so only what is above zero is a slice.
  const usable = round || block.chart === "funnel" ? points.filter(point => point.value > 0) : points;
  const limit = round ? MAX_SLICES : MAX_BARS;
  if (usable.length <= limit) return usable;
  // An "Other" folded already, for a chart drawn as another kind, is folded again rather than kept beside a new one.
  const kept = usable
    .filter(point => point.color !== OTHER_COLOR)
    .sort((a, b) => descending(Math.abs(a.value), Math.abs(b.value)))
    .slice(0, limit - 1);
  const rest = usable.filter(point => !kept.includes(point));
  const other: ChartDatum = { label: "Other", value: rest.reduce((sum, point) => sum + point.value, 0), color: OTHER_COLOR };
  return [...usable.filter(point => kept.includes(point)), other];
}

/**
 * Pairs folded on each side: past so many columns, stacks, rows or nodes, the
 * smallest by their totals become "Other", and pairs that then name the same
 * two are one. Stacks and flows are parts of a whole, so only what is above
 * zero is one; a flow from a node to itself goes nowhere.
 */
function foldPairs(kind: ChartKind, points: ChartDatum[]): ChartDatum[] {
  const paired = points.filter(point => point.to !== undefined);
  if (kind === "heatmap") return foldSide(foldSide(paired, "label", MAX_HEAT_ROWS), "to", MAX_HEAT_COLUMNS);
  const positive = paired.filter(point => point.value > 0 && (kind !== "sankey" || point.label !== point.to));
  if (kind === "stacked") return foldSide(foldSide(positive, "label", MAX_BARS), "to", MAX_SLICES);
  // A flow through several stages is not folded — an "Other" on both sides would flow into itself — but cut to its largest.
  const sources = new Set(positive.map(point => point.label));
  if (positive.some(point => sources.has(point.to!))) {
    const kept = new Set([...positive].sort((a, b) => descending(a.value, b.value)).slice(0, MAX_SANKEY_LINKS));
    return positive.filter(point => kept.has(point));
  }
  return foldSide(foldSide(positive, "label", MAX_SANKEY_NODES), "to", MAX_SANKEY_NODES);
}

function foldSide(points: ChartDatum[], side: "label" | "to", limit: number): ChartDatum[] {
  const totals = rollup(points, group => sum(group, point => Math.abs(point.value)), point => point[side] ?? "");
  if (totals.size <= limit) return points;
  const kept = new Set(
    [...totals]
      .sort((a, b) => descending(a[1], b[1]))
      .slice(0, limit - 1)
      .map(([name]) => name),
  );
  const merged = new Map<string, ChartDatum>();
  for (const point of points) {
    const folded = kept.has(point[side] ?? "") ? point : { ...point, [side]: "Other" };
    const key = JSON.stringify([folded.label, folded.to]);
    const earlier = merged.get(key);
    if (earlier) merged.set(key, { ...earlier, value: earlier.value + folded.value });
    else merged.set(key, folded);
  }
  // "Other" goes last, wherever its first member was.
  const named = [...merged.values()];
  return [...named.filter(point => point[side] !== "Other"), ...named.filter(point => point[side] === "Other")];
}

/* ---------------------------------- marks -------------------------------- */

type Point = [number, number];

export type ChartMark =
  /** A closed, filled shape: a bar, a slice, an area's wash. */
  | { kind: "shape"; points: Point[]; fill: string; stroke?: string; strokeWidth?: number; opacity?: number; tip?: string }
  /** An open run of segments: the line of a line chart. */
  | { kind: "polyline"; points: Point[]; color: string; width: number }
  /** A straight hairline: a gridline, a baseline. */
  | { kind: "rule"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  /** A dot, ringed in the sheet's colour so it stands off the line it sits on. */
  | { kind: "dot"; cx: number; cy: number; r: number; fill: string; ring: string; tip?: string }
  /** One line of text. `x` is its left edge and `y` the top of its line, as `drawTextAt` has them. */
  | { kind: "text"; x: number; y: number; text: string; size: number; color: string; bold?: boolean };

export type ChartScene = { width: number; height: number; marks: ChartMark[] };

/** The page's inks and face, which a chart's text and gaps are drawn in. */
export type ChartStyle = {
  family: FontFamily;
  /** The body size; chart text is set a little under it. */
  fontSize: number;
  textColor: string;
  mutedColor: string;
  /** What the chart is drawn on — the colour of the gaps between marks. */
  surface: string;
  /** A boxed chart's title, as headings are. Absent is the text colour. */
  accentColor?: string;
};

/** Thickest a bar or column is drawn, however much room its band has. */
const MAX_BAR = 24;
const BAR_RADIUS = 4;
const LINE_WIDTH = 2;
const DOT_RADIUS = 4;
const GAP = 2;

/**
 * Compact figures for ticks and labels: 12, 0.5, 1,284 — and from ten
 * thousand up, 12.9K, 4.2M, 1.1B.
 */
export function formatFigure(value: number): string {
  if (Math.abs(value) < 10_000) return format(",.4~g")(value).replace("−", "-");
  return format(".3~s")(value).replace("k", "K").replace("G", "B").replace("−", "-");
}

/**
 * Lays a chart out in a box `width` wide. Its height is the block's own, plus
 * the room a pie's legend or an axis's labels need beneath it.
 */
export function layoutChart(block: ChartLook, points: ChartDatum[], width: number, style: ChartStyle): ChartScene {
  const height = Math.max(40, block.height);
  switch (block.chart) {
    case "bar":
      return layoutBars(block, points, width, height, style);
    case "line":
    case "area":
      return layoutLine(block, points, width, height, style);
    case "pie":
    case "donut":
      return layoutPie(block, points, width, height, style);
    case "funnel":
      return layoutFunnel(block, points, width, height, style);
    case "stacked":
      return layoutStacked(block, points, width, height, style);
    case "heatmap":
      return layoutHeatmap(block, points, width, height, style);
    case "sankey":
      return layoutSankey(block, points, width, height, style);
    case "gantt":
      return layoutGantt(block, points, width, height, style);
    default:
      return layoutColumns(block, points, width, height, style);
  }
}

const labelSize = (style: ChartStyle) => Math.max(6, style.fontSize * 0.8);

const textWidth = (text: string, style: ChartStyle, size: number, bold = false) =>
  measureText(text, style.family, size, { bold });

const fit = (text: string, room: number, style: ChartStyle, size: number) =>
  truncateToWidth(text, Math.max(0, room), style.family, size);

/** The figure as the chart labels it, and as its tooltip says it. */
const tip = (point: ChartDatum) =>
  `${point.label}${point.to !== undefined ? ` → ${point.to}` : ""}: ${formatFigure(point.value)}`;

/** A value axis that always includes zero, rounded out to clean ticks. */
function valueScale(points: ChartDatum[], range: [number, number]) {
  const low = Math.min(0, min(points, point => point.value) ?? 0);
  const high = Math.max(0, max(points, point => point.value) ?? 0);
  return scaleLinear()
    .domain(low === high ? [0, 1] : [low, high])
    .range(range)
    .nice(5);
}

/**
 * A bar from its baseline to its value, rounded at the value end only — `end`
 * is which side of the box that is. The rounded corners are sampled as
 * short segments, so a polygon is all either renderer has to draw.
 */
function barShape(x: number, y: number, w: number, h: number, end: "top" | "bottom" | "left" | "right"): Point[] {
  const r = Math.min(BAR_RADIUS, w / 2, h / 2);
  const arc = (cx: number, cy: number, from: number, to: number): Point[] =>
    Array.from({ length: 5 }, (_, step) => {
      const angle = from + ((to - from) * step) / 4;
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    });
  const pi = Math.PI;
  const right = x + w;
  const bottom = y + h;
  switch (end) {
    case "top":
      return [[x, bottom], ...arc(x + r, y + r, pi, pi * 1.5), ...arc(right - r, y + r, pi * 1.5, pi * 2), [right, bottom]];
    case "bottom":
      return [[x, y], [right, y], ...arc(right - r, bottom - r, 0, pi / 2), ...arc(x + r, bottom - r, pi / 2, pi)];
    case "right":
      return [[x, y], ...arc(right - r, y + r, pi * 1.5, pi * 2), ...arc(right - r, bottom - r, 0, pi / 2), [x, bottom]];
    case "left":
      return [[right, y], [right, bottom], ...arc(x + r, bottom - r, pi / 2, pi), ...arc(x + r, y + r, pi, pi * 1.5)];
  }
}

/** Gridlines and their labels down the left, for a vertical value scale. */
function valueGrid(
  y: ReturnType<typeof valueScale>,
  left: number,
  right: number,
  style: ChartStyle,
  size: number,
): ChartMark[] {
  const marks: ChartMark[] = [];
  for (const tick of y.ticks(5)) {
    const at = y(tick);
    const label = formatFigure(tick);
    marks.push(
      { kind: "rule", x1: left, y1: at, x2: right, y2: at, color: tick === 0 ? AXIS_COLOR : GRID_COLOR, width: tick === 0 ? 0.75 : 0.5 },
      { kind: "text", x: left - 6 - textWidth(label, style, size), y: at - size * 0.5, text: label, size, color: style.mutedColor },
    );
  }
  return marks;
}

const tickGutter = (y: ReturnType<typeof valueScale>, style: ChartStyle, size: number) =>
  (max(y.ticks(5), tick => textWidth(formatFigure(tick), style, size)) ?? 0) + 6;

/* -------------------------------- columns -------------------------------- */

function layoutColumns(block: ChartLook, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
  const size = labelSize(style);
  const top = block.showValues ? size * 1.5 : size * 0.6;
  const bottom = height - size * 1.8;
  const y = valueScale(points, [bottom, top]);
  const left = tickGutter(y, style, size);
  const x = scaleBand<string>()
    .domain(points.map((_, index) => String(index)))
    .range([left, width])
    .paddingInner(0.3)
    .paddingOuter(0.2);
  const thickness = Math.min(MAX_BAR, x.bandwidth());
  const color = block.color ?? CHART_PALETTE[0]!;
  const marks = valueGrid(y, left, width, style, size);
  const zero = y(0);

  points.forEach((point, index) => {
    const band = x(String(index)) ?? left;
    const center = band + x.bandwidth() / 2;
    const at = y(point.value);
    const up = point.value >= 0;
    const length = Math.abs(zero - at);
    if (length > 0.25) {
      marks.push({
        kind: "shape",
        points: barShape(center - thickness / 2, Math.min(at, zero), thickness, length, up ? "top" : "bottom"),
        fill: point.color ?? color,
        tip: tip(point),
      });
    }
    if (block.showValues) {
      const label = formatFigure(point.value);
      const labelWidth = textWidth(label, style, size, true);
      marks.push({
        kind: "text",
        x: center - labelWidth / 2,
        y: up ? at - size * 1.3 : at + size * 0.3,
        text: label,
        size,
        bold: true,
        color: style.textColor,
      });
    }
    const name = fit(point.label, x.step() - 2, style, size);
    marks.push({
      kind: "text",
      x: center - textWidth(name, style, size) / 2,
      y: bottom + size * 0.5,
      text: name,
      size,
      color: style.mutedColor,
    });
  });

  return { width, height, marks };
}

/* ---------------------------------- bars --------------------------------- */

function layoutBars(block: ChartLook, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
  const size = labelSize(style);
  const longest = max(points, point => textWidth(point.label, style, size)) ?? 0;
  const gutter = Math.min(longest, width * 0.3) + 8;
  const values = points.map(point => formatFigure(point.value));
  const valueRoom = block.showValues ? (max(values, label => textWidth(label, style, size, true)) ?? 0) + 6 : 0;
  const hasNegative = points.some(point => point.value < 0);
  const axis = block.showValues ? 0 : size * 1.8;

  const x = valueScale(points, [gutter + (hasNegative ? valueRoom : 0), width - valueRoom]);
  const y = scaleBand<string>()
    .domain(points.map((_, index) => String(index)))
    .range([0, height - axis])
    .paddingInner(0.3)
    .paddingOuter(0.15);
  const thickness = Math.min(MAX_BAR, y.bandwidth());
  const color = block.color ?? CHART_PALETTE[0]!;
  const zero = x(0);
  const marks: ChartMark[] = [];

  // Without the figures on the bars, a scale along the bottom carries them.
  if (!block.showValues) {
    for (const tick of x.ticks(5)) {
      const at = x(tick);
      const label = formatFigure(tick);
      marks.push(
        { kind: "rule", x1: at, y1: 0, x2: at, y2: height - axis, color: GRID_COLOR, width: 0.5 },
        { kind: "text", x: at - textWidth(label, style, size) / 2, y: height - axis + size * 0.5, text: label, size, color: style.mutedColor },
      );
    }
  }
  marks.push({ kind: "rule", x1: zero, y1: 0, x2: zero, y2: height - axis, color: AXIS_COLOR, width: 0.75 });

  points.forEach((point, index) => {
    const center = (y(String(index)) ?? 0) + y.bandwidth() / 2;
    const at = x(point.value);
    const right = point.value >= 0;
    const length = Math.abs(at - zero);
    if (length > 0.25) {
      marks.push({
        kind: "shape",
        points: barShape(Math.min(at, zero), center - thickness / 2, length, thickness, right ? "right" : "left"),
        fill: point.color ?? color,
        tip: tip(point),
      });
    }
    const name = fit(point.label, gutter - 8, style, size);
    marks.push({ kind: "text", x: gutter - 8 - textWidth(name, style, size), y: center - size * 0.5, text: name, size, color: style.textColor });
    if (block.showValues) {
      const label = values[index]!;
      const labelWidth = textWidth(label, style, size, true);
      marks.push({
        kind: "text",
        x: right ? at + 4 : at - 4 - labelWidth,
        y: center - size * 0.5,
        text: label,
        size,
        bold: true,
        color: style.textColor,
      });
    }
  });

  return { width, height, marks };
}

/* ---------------------------------- line --------------------------------- */

function layoutLine(block: ChartLook, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
  const size = labelSize(style);
  const top = size * 1.5;
  const bottom = height - size * 1.8;
  const y = valueScale(points, [bottom, top]);
  const left = tickGutter(y, style, size);
  const last = formatFigure(points[points.length - 1]?.value ?? 0);
  const right = width - (block.showValues ? textWidth(last, style, size, true) / 2 + 4 : DOT_RADIUS + 2);
  const x = scalePoint<string>()
    .domain(points.map((_, index) => String(index)))
    .range([left + DOT_RADIUS + 4, right])
    .padding(points.length === 1 ? 0.5 : 0);
  const color = block.color ?? CHART_PALETTE[0]!;
  const marks = valueGrid(y, left, width, style, size);
  const at = points.map((point, index): Point => [x(String(index)) ?? left, y(point.value)]);

  // An area is the same line over a deeper wash, and only its last dot.
  const area = block.chart === "area";
  if (at.length > 1) {
    const zero = y(0);
    marks.push({ kind: "shape", points: [[at[0]![0], zero], ...at, [at[at.length - 1]![0], zero]], fill: color, opacity: area ? 0.3 : 0.1 });
    marks.push({ kind: "polyline", points: at, color, width: LINE_WIDTH });
  }

  // Every dot while they have room to be told apart; past that, only the last.
  const crowded = at.length > 1 && (area || (right - left) / (at.length - 1) < DOT_RADIUS * 4);
  at.forEach(([cx, cy], index) => {
    if (crowded && index !== at.length - 1) return;
    marks.push({ kind: "dot", cx, cy, r: DOT_RADIUS, fill: color, ring: style.surface, tip: tip(points[index]!) });
  });

  // The last figure, and the highest when it is another — never a number on every point.
  if (block.showValues && points.length) {
    const peak = points.reduce((best, point, index) => (point.value > points[best]!.value ? index : best), 0);
    for (const index of new Set([points.length - 1, peak])) {
      const label = formatFigure(points[index]!.value);
      const [cx, cy] = at[index]!;
      marks.push({
        kind: "text",
        x: cx - textWidth(label, style, size, true) / 2,
        y: cy - DOT_RADIUS - size * 1.25,
        text: label,
        size,
        bold: true,
        color: style.textColor,
      });
    }
  }

  // As many category labels as fit side by side, evenly picked.
  const widest = (max(points, point => textWidth(point.label, style, size)) ?? 0) + 8;
  const room = at.length > 1 ? (right - left) / (at.length - 1) : width;
  const every = Math.max(1, Math.ceil(Math.min(widest, 120) / room));
  points.forEach((point, index) => {
    if (index % every && index !== points.length - 1) return;
    const name = fit(point.label, Math.min(widest, room * every) - 4, style, size);
    const nameWidth = textWidth(name, style, size);
    const cx = at[index]![0];
    marks.push({
      kind: "text",
      x: Math.min(Math.max(cx - nameWidth / 2, left), width - nameWidth),
      y: bottom + size * 0.5,
      text: name,
      size,
      color: style.mutedColor,
    });
  });

  return { width, height, marks };
}

/* ----------------------------------- pie --------------------------------- */

/** Points around an arc, clockwise from 12 o'clock, a few degrees apart. */
function arcPoints(cx: number, cy: number, radius: number, from: number, to: number): Point[] {
  const steps = Math.max(2, Math.ceil(((to - from) * 180) / Math.PI / 3));
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = from + ((to - from) * step) / steps;
    return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
  });
}

function layoutPie(block: ChartLook, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
  const size = labelSize(style);
  const diameter = Math.min(height, width * 0.45);
  const radius = diameter / 2;
  const cx = radius;
  const cy = height / 2;
  const inner = block.chart === "donut" ? radius * 0.6 : 0;
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const colorOf = (point: ChartDatum, index: number) => point.color ?? CHART_PALETTE[index] ?? OTHER_COLOR;
  const marks: ChartMark[] = [];

  const arcs = pie<ChartDatum>()
    .sort(null)
    .value(point => point.value)(points);
  for (const arc of arcs) {
    const outer = arcPoints(cx, cy, radius, arc.startAngle, arc.endAngle);
    const hole = inner ? arcPoints(cx, cy, inner, arc.startAngle, arc.endAngle).reverse() : [[cx, cy] as Point];
    marks.push({
      kind: "shape",
      points: [...outer, ...hole],
      fill: colorOf(arc.data, arc.index),
      // A whole circle has no neighbour to be kept apart from.
      ...(arcs.length > 1 ? { stroke: style.surface, strokeWidth: GAP } : {}),
      tip: `${tip(arc.data)} (${formatShare(arc.data.value, total)})`,
    });
  }

  if (inner && total) {
    const figure = formatFigure(total);
    const big = Math.min(inner * 0.6, style.fontSize * 2);
    marks.push({
      kind: "text",
      x: cx - textWidth(figure, style, big, true) / 2,
      y: cy - big * 0.55,
      text: figure,
      size: big,
      bold: true,
      color: style.textColor,
    });
  }

  // The legend: a swatch, the name, and — when asked — the figure and its share,
  // in a column narrow enough that each figure stays beside its name.
  const legendLeft = diameter + 24;
  const legendRight = Math.min(width, legendLeft + 280);
  const rowHeight = Math.max(size * 1.7, 12);
  const legendTop = Math.max(0, cy - (rowHeight * points.length) / 2);
  const swatch = size * 0.8;
  points.forEach((point, index) => {
    const rowY = legendTop + index * rowHeight;
    const lineTop = rowY + (rowHeight - size) / 2;
    marks.push({ kind: "dot", cx: legendLeft + swatch / 2, cy: rowY + rowHeight / 2, r: swatch / 2, fill: colorOf(point, index), ring: style.surface });
    const figure = block.showValues ? `${formatFigure(point.value)} · ${formatShare(point.value, total)}` : "";
    const figureWidth = figure ? textWidth(figure, style, size, true) : 0;
    const nameLeft = legendLeft + swatch + 6;
    const name = fit(point.label, legendRight - nameLeft - (figure ? figureWidth + 10 : 0), style, size);
    marks.push({ kind: "text", x: nameLeft, y: lineTop, text: name, size, color: style.textColor });
    if (figure) {
      marks.push({ kind: "text", x: legendRight - figureWidth, y: lineTop, text: figure, size, bold: true, color: style.textColor });
    }
  });

  return { width, height: Math.max(height, legendTop + rowHeight * points.length), marks };
}

const formatShare = (value: number, total: number): string => (total ? format(".0%")(value / total) : "–");

/* ------------------------------ shared pieces ---------------------------- */

/** A box with every corner rounded, sampled as a polygon. */
function roundedBox(x: number, y: number, w: number, h: number, radius: number): Point[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const corner = (cx: number, cy: number, from: number): Point[] =>
    Array.from({ length: 5 }, (_, step) => {
      const angle = from + (Math.PI / 2) * (step / 4);
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    });
  const pi = Math.PI;
  return [
    ...corner(x + w - r, y + r, pi * 1.5),
    ...corner(x + w - r, y + h - r, 0),
    ...corner(x + r, y + h - r, pi / 2),
    ...corner(x + r, y + r, pi),
  ];
}

/** Distinct values of one side of the pairs, in the order they first appear. */
const namesOf = (points: ChartDatum[], side: "label" | "to"): string[] => [
  ...new Set(points.map(point => point[side] ?? "")),
];

/** The palette by position, with "Other" grey and nothing past the eighth given a hue of its own. */
const paletteColor = (name: string, index: number) => (name === "Other" ? OTHER_COLOR : (CHART_PALETTE[index] ?? OTHER_COLOR));

/** A legend in a row — a swatch and a name each — wrapped to the width. */
function legendRow(entries: { name: string; color: string }[], width: number, style: ChartStyle, size: number) {
  const marks: ChartMark[] = [];
  const swatch = size * 0.8;
  const rowHeight = Math.max(size * 1.7, 12);
  let x = 0;
  let y = 0;
  for (const entry of entries) {
    const name = fit(entry.name, width - swatch - 6, style, size);
    const room = swatch + 6 + textWidth(name, style, size) + 14;
    if (x > 0 && x + room > width) {
      x = 0;
      y += rowHeight;
    }
    marks.push(
      { kind: "dot", cx: x + swatch / 2, cy: y + rowHeight / 2, r: swatch / 2, fill: entry.color, ring: style.surface },
      { kind: "text", x: x + swatch + 6, y: y + (rowHeight - size) / 2, text: name, size, color: style.textColor },
    );
    x += room;
  }
  return { marks, height: entries.length ? y + rowHeight : 0 };
}

/* --------------------------------- funnel -------------------------------- */

/**
 * Stages, widest first as they come, centred one under the next with a faint
 * neck between them. Each figure's share is of the first stage: what is left
 * of what came in.
 */
function layoutFunnel(block: ChartLook, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
  const size = labelSize(style);
  const gutter = Math.min(max(points, point => textWidth(point.label, style, size)) ?? 0, width * 0.3) + 10;
  const first = points[0]?.value ?? 0;
  const figures = points.map(point => (block.showValues ? `${formatFigure(point.value)} · ${formatShare(point.value, first)}` : ""));
  const figureRoom = block.showValues ? (max(figures, figure => textWidth(figure, style, size, true)) ?? 0) + 10 : 0;
  const left = gutter;
  const right = width - figureRoom;
  const center = (left + right) / 2;
  const widest = max(points, point => point.value) ?? 0;
  const y = scaleBand<string>()
    .domain(points.map((_, index) => String(index)))
    .range([0, height])
    .paddingInner(0.2);
  const band = Math.min(y.bandwidth(), 40);
  const color = block.color ?? CHART_PALETTE[0]!;
  const widthOf = (point: ChartDatum) => (widest > 0 ? Math.max(2, ((right - left) * point.value) / widest) : 2);
  const marks: ChartMark[] = [];

  points.forEach((point, index) => {
    const top = (y(String(index)) ?? 0) + (y.bandwidth() - band) / 2;
    const w = widthOf(point);
    const next = points[index + 1];
    if (next) {
      const nextTop = (y(String(index + 1)) ?? 0) + (y.bandwidth() - band) / 2;
      const nw = widthOf(next);
      marks.push({
        kind: "shape",
        points: [[center - w / 2, top + band], [center + w / 2, top + band], [center + nw / 2, nextTop], [center - nw / 2, nextTop]],
        fill: point.color ?? color,
        opacity: 0.15,
      });
    }
    marks.push({ kind: "shape", points: roundedBox(center - w / 2, top, w, band, BAR_RADIUS), fill: point.color ?? color, tip: tip(point) });
    const name = fit(point.label, gutter - 10, style, size);
    marks.push({ kind: "text", x: gutter - 10 - textWidth(name, style, size), y: top + band / 2 - size * 0.5, text: name, size, color: style.textColor });
    if (figures[index]) {
      marks.push({ kind: "text", x: right + 10, y: top + band / 2 - size * 0.5, text: figures[index]!, size, bold: true, color: style.textColor });
    }
  });

  return { width, height, marks };
}

/* ------------------------------ stacked columns -------------------------- */

/**
 * A column for each label, stacked from its pairs: the stacks largest first
 * from the baseline, in the palette's order, named in a legend across the top.
 */
function layoutStacked(block: ChartLook, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
  const size = labelSize(style);
  const columns = namesOf(points, "label");
  // In the order they first come — largest first, or the field's own — with "Other" at the top of every column.
  const stacks = namesOf(points, "to").sort((a, b) => Number(a === "Other") - Number(b === "Other"));
  const colorOf = new Map(stacks.map((name, index) => [name, paletteColor(name, index)]));
  const value = new Map(points.map(point => [JSON.stringify([point.label, point.to]), point.value]));
  const totals = columns.map(column => ({ label: column, value: sum(stacks, stack => value.get(JSON.stringify([column, stack])) ?? 0) }));

  const legend = legendRow(stacks.map(name => ({ name, color: colorOf.get(name)! })), width, style, size);
  const top = legend.height + (block.showValues ? size * 1.5 : size * 0.6) + 4;
  const bottom = Math.max(top + 20, height - size * 1.8);
  const y = valueScale(totals, [bottom, top]);
  const left = tickGutter(y, style, size);
  const x = scaleBand<string>().domain(columns).range([left, width]).paddingInner(0.3).paddingOuter(0.2);
  const thickness = Math.min(MAX_BAR * 1.5, x.bandwidth());
  const marks: ChartMark[] = [...legend.marks, ...valueGrid(y, left, width, style, size)];

  columns.forEach((column, index) => {
    const center = (x(column) ?? left) + x.bandwidth() / 2;
    const parts = stacks.filter(stack => (value.get(JSON.stringify([column, stack])) ?? 0) > 0);
    let below = 0;
    parts.forEach((stack, at) => {
      const figure = value.get(JSON.stringify([column, stack]))!;
      const y0 = y(below);
      const y1 = y(below + figure);
      below += figure;
      if (y0 - y1 < 0.25) return;
      const last = at === parts.length - 1;
      const box: Point[] = last
        ? barShape(center - thickness / 2, y1, thickness, y0 - y1, "top")
        : [[center - thickness / 2, y0], [center + thickness / 2, y0], [center + thickness / 2, y1], [center - thickness / 2, y1]];
      marks.push({
        kind: "shape",
        points: box,
        fill: colorOf.get(stack)!,
        stroke: style.surface,
        strokeWidth: 1,
        tip: `${column} · ${stack}: ${formatFigure(figure)}`,
      });
    });
    if (block.showValues) {
      const label = formatFigure(totals[index]!.value);
      marks.push({
        kind: "text",
        x: center - textWidth(label, style, size, true) / 2,
        y: y(totals[index]!.value) - size * 1.3,
        text: label,
        size,
        bold: true,
        color: style.textColor,
      });
    }
    const name = fit(column, x.step() - 2, style, size);
    marks.push({ kind: "text", x: center - textWidth(name, style, size) / 2, y: bottom + size * 0.5, text: name, size, color: style.mutedColor });
  });

  return { width, height: Math.max(height, bottom + size * 1.8), marks };
}

/* --------------------------------- heatmap ------------------------------- */

/**
 * A grid of rows by columns, each cell the series colour as deep as its
 * figure is large against the largest. A pair with no figure is an empty,
 * grey cell — not a pale one, which would say "a little".
 */
function layoutHeatmap(block: ChartLook, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
  const size = labelSize(style);
  const rows = namesOf(points, "label");
  const columns = namesOf(points, "to");
  const value = new Map(points.map(point => [JSON.stringify([point.label, point.to]), point.value]));
  const peak = max(points, point => Math.abs(point.value)) ?? 0;
  const gutter = Math.min(max(rows, row => textWidth(row, style, size)) ?? 0, width * 0.3) + 8;
  const header = size * 1.8;
  const cellWidth = (width - gutter) / Math.max(1, columns.length);
  const cellHeight = Math.min(32, Math.max(size * 1.8, (height - header) / Math.max(1, rows.length)));
  const color = block.color ?? CHART_PALETTE[0]!;
  const marks: ChartMark[] = [];

  columns.forEach((column, index) => {
    const name = fit(column, cellWidth - 4, style, size);
    const center = gutter + cellWidth * (index + 0.5);
    marks.push({ kind: "text", x: center - textWidth(name, style, size) / 2, y: size * 0.3, text: name, size, color: style.mutedColor });
  });

  rows.forEach((row, r) => {
    const top = header + r * cellHeight;
    const name = fit(row, gutter - 8, style, size);
    marks.push({ kind: "text", x: gutter - 8 - textWidth(name, style, size), y: top + cellHeight / 2 - size * 0.5, text: name, size, color: style.textColor });
    columns.forEach((column, c) => {
      const figure = value.get(JSON.stringify([row, column]));
      const box = roundedBox(gutter + c * cellWidth + 1, top + 1, cellWidth - 2, cellHeight - 2, 2);
      if (figure === undefined) {
        marks.push({ kind: "shape", points: box, fill: GRID_COLOR, opacity: 0.5 });
        return;
      }
      const depth = peak ? Math.abs(figure) / peak : 0;
      marks.push({ kind: "shape", points: box, fill: color, opacity: 0.08 + 0.92 * depth, tip: `${row} · ${column}: ${formatFigure(figure)}` });
      if (block.showValues) {
        const label = formatFigure(figure);
        const labelWidth = textWidth(label, style, size, true);
        if (labelWidth > cellWidth - 4 || size > cellHeight - 2) return;
        marks.push({
          kind: "text",
          x: gutter + (c + 0.5) * cellWidth - labelWidth / 2,
          y: top + cellHeight / 2 - size * 0.5,
          text: label,
          size,
          bold: true,
          color: depth > 0.5 ? "#ffffff" : style.textColor,
        });
      }
    });
  });

  return { width, height: header + rows.length * cellHeight, marks };
}

/* --------------------------------- sankey -------------------------------- */

type SankeyNode = { name: string; depth: number; in: number; out: number; x: number; y: number; h: number; color: string };
type SankeyLink = { from: SankeyNode; to: SankeyNode; value: number; sy: number; ty: number; t: number };

const NODE_WIDTH = 10;

/** One edge of a ribbon: a curve from one node's side to the other's, flat where it leaves and arrives. */
function ribbonEdge(x0: number, y0: number, x1: number, y1: number): Point[] {
  const mid = (x0 + x1) / 2;
  return Array.from({ length: 21 }, (_, step) => {
    const t = step / 20;
    const u = 1 - t;
    const x = u * u * u * x0 + 3 * u * u * t * mid + 3 * u * t * t * mid + t * t * t * x1;
    const y = u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1;
    return [x, y];
  });
}

/**
 * Flows from one label to another as ribbons as thick as their figures,
 * between nodes as tall as what passes through them. Each node stands in the
 * column of the longest path to it, and a node nothing flows on from stands
 * in the last. The first column is named on its left and the last on its
 * right, so the names of a two-sided diagram never sit on a ribbon.
 */
function layoutSankey(block: ChartLook, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
  const size = labelSize(style);
  const nodes = new Map<string, SankeyNode>();
  const node = (name: string) => {
    let found = nodes.get(name);
    if (!found) nodes.set(name, (found = { name, depth: 0, in: 0, out: 0, x: 0, y: 0, h: 0, color: OTHER_COLOR }));
    return found;
  };
  let links = points
    .filter(point => point.to !== undefined && point.value > 0 && point.label !== point.to)
    .map((point): SankeyLink => ({ from: node(point.label), to: node(point.to!), value: point.value, sy: 0, ty: 0, t: 0 }));

  // The longest path to each node — and a flow back to an earlier column is a loop, which is left out.
  for (let pass = 0; pass < nodes.size; pass++) {
    let moved = false;
    for (const link of links) {
      if (link.to.depth < link.from.depth + 1 && link.from.depth + 1 < nodes.size) {
        link.to.depth = link.from.depth + 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  links = links.filter(link => link.to.depth > link.from.depth);
  for (const link of links) {
    link.from.out += link.value;
    link.to.in += link.value;
  }
  const placed = [...nodes.values()].filter(entry => entry.in || entry.out);
  const last = max(placed, entry => entry.depth) ?? 0;
  for (const entry of placed) if (!entry.out) entry.depth = last;
  if (!links.length || last === 0) return { width, height, marks: [] };

  const through = (entry: SankeyNode) => Math.max(entry.in, entry.out);
  const nameOf = (entry: SankeyNode) => entry.name;
  const figureOf = (entry: SankeyNode) => (block.showValues ? formatFigure(through(entry)) : "");
  const labelWidth = (entry: SankeyNode) =>
    textWidth(nameOf(entry), style, size) + (block.showValues ? 4 + textWidth(figureOf(entry), style, size, true) : 0);
  const columns = Array.from({ length: last + 1 }, (_, depth) => placed.filter(entry => entry.depth === depth));
  const leftGutter = Math.min(max(columns[0]!, labelWidth) ?? 0, width * 0.25) + 6;
  const rightGutter = Math.min(max(columns[last]!, labelWidth) ?? 0, width * 0.25) + 6;
  const step = (width - leftGutter - rightGutter - NODE_WIDTH) / last;
  const gap = Math.max(4, size * 0.7);
  const scale = min(columns, column => (height - gap * (column.length - 1)) / Math.max(1e-9, sum(column, through))) ?? 1;

  // Down each column: the first largest first, the rest under the middle of what flows into them.
  const center = (entry: SankeyNode) => entry.y + entry.h / 2;
  columns.forEach((column, depth) => {
    if (depth === 0) column.sort((a, b) => descending(through(a), through(b)));
    else {
      const pull = (entry: SankeyNode) => {
        const incoming = links.filter(link => link.to === entry);
        const weight = sum(incoming, link => link.value);
        return weight ? sum(incoming, link => center(link.from) * link.value) / weight : height / 2;
      };
      const pulls = new Map(column.map(entry => [entry, pull(entry)]));
      column.sort((a, b) => ascending(pulls.get(a), pulls.get(b)));
    }
    const used = sum(column, entry => Math.max(1, through(entry) * scale)) + gap * (column.length - 1);
    let y = Math.max(0, (height - used) / 2);
    for (const entry of column) {
      entry.x = leftGutter + depth * step;
      entry.y = y;
      entry.h = Math.max(1, through(entry) * scale);
      y += entry.h + gap;
    }
  });
  [...placed]
    .sort((a, b) => ascending(a.depth, b.depth) || ascending(a.y, b.y))
    .forEach((entry, index) => (entry.color = paletteColor(entry.name, index)));

  // Where each ribbon leaves and arrives: stacked down each node's side in the order of what is at the other end.
  for (const entry of placed) {
    let out = entry.y;
    for (const link of links.filter(link => link.from === entry).sort((a, b) => ascending(center(a.to), center(b.to)))) {
      link.t = link.value * scale;
      link.sy = out;
      out += link.t;
    }
    let into = entry.y;
    for (const link of links.filter(link => link.to === entry).sort((a, b) => ascending(center(a.from), center(b.from)))) {
      link.ty = into;
      into += link.value * scale;
    }
  }

  const marks: ChartMark[] = [];
  for (const link of [...links].sort((a, b) => descending(a.value, b.value))) {
    const x0 = link.from.x + NODE_WIDTH;
    const x1 = link.to.x;
    marks.push({
      kind: "shape",
      points: [...ribbonEdge(x0, link.sy, x1, link.ty), ...ribbonEdge(x1, link.ty + link.t, x0, link.sy + link.t)],
      fill: link.from.color,
      opacity: 0.35,
      tip: `${link.from.name} → ${link.to.name}: ${formatFigure(link.value)}`,
    });
  }
  for (const column of columns) {
    let clear = -Infinity;
    for (const entry of column) {
      marks.push({
        kind: "shape",
        points: [[entry.x, entry.y], [entry.x + NODE_WIDTH, entry.y], [entry.x + NODE_WIDTH, entry.y + entry.h], [entry.x, entry.y + entry.h]],
        fill: entry.color,
        tip: `${entry.name}: ${formatFigure(through(entry))}`,
      });
      // A name that would overlap the one above it is left to the tooltip.
      const top = center(entry) - size * 0.5;
      if (top < clear) continue;
      clear = top + size * 1.2;
      const onLeft = entry.depth === 0;
      const room = onLeft ? leftGutter - 6 : entry.depth === last ? rightGutter - 6 : step - NODE_WIDTH - 12;
      const figure = figureOf(entry);
      const figureWidth = figure ? textWidth(figure, style, size, true) + 4 : 0;
      const name = fit(nameOf(entry), room - figureWidth, style, size);
      const total = textWidth(name, style, size) + figureWidth;
      const x = onLeft ? entry.x - 6 - total : entry.x + NODE_WIDTH + 6;
      marks.push({ kind: "text", x, y: top, text: name, size, color: style.textColor });
      if (figure) marks.push({ kind: "text", x: x + total - figureWidth + 4, y: top, text: figure, size, bold: true, color: style.textColor });
    }
  }

  return { width, height, marks };
}

/* ---------------------------------- gantt -------------------------------- */

const spanDate = utcFormat("%b %-d, %Y");

/** Dates along the top in one form throughout, as fine as the chart's length needs. */
function spanTicks(days: number): (date: Date) => string {
  if (days <= 3) return utcFormat("%b %-d %H:%M");
  if (days <= 180) return utcFormat("%b %-d");
  if (days <= 365 * 3) return utcFormat("%b %Y");
  return utcFormat("%Y");
}

/** How long a span is, in the unit that reads best: hours, days or weeks. */
function formatSpan(start: number, end: number): string {
  const days = (end - start) / DAY;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 14) return `${Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
}

/**
 * A row for each span, earliest first: its name down the left, a bar from its
 * start to its end against dates across the top, and a diamond for one with
 * no length. A hairline marks today when today is on the chart.
 */
function layoutGantt(block: ChartLook, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
  const size = labelSize(style);
  const spans = points.filter(point => point.start !== undefined);
  let low = min(spans, point => point.start!) ?? 0;
  let high = max(spans, point => point.end ?? point.start!) ?? 0;
  if (high - low < DAY) {
    low -= DAY / 2;
    high += DAY / 2;
  }
  const gutter = Math.min(max(spans, point => textWidth(point.label, style, size)) ?? 0, width * 0.3) + 10;
  const durations = spans.map(point => (point.end! > point.start! ? formatSpan(point.start!, point.end!) : spanDate(new Date(point.start!))));
  const after = block.showValues ? (max(durations, label => textWidth(label, style, size, true)) ?? 0) + 6 : 0;
  const x = scaleUtc()
    .domain([low, high])
    .range([gutter + 4, width - 4 - after])
    .nice();
  const header = size * 1.8;
  const band = Math.min(28, Math.max(size * 1.5, (height - header) / Math.max(1, spans.length)));
  const thickness = Math.min(16, band * 0.62);
  const plotBottom = header + spans.length * band;
  const color = block.color ?? CHART_PALETTE[0]!;
  const marks: ChartMark[] = [];

  // Dates across the top, as many as fit side by side.
  const ticks = x.ticks(Math.max(2, Math.floor((width - gutter) / 90)));
  const tickLabel = spanTicks((high - low) / DAY);
  for (const tick of ticks) {
    const at = x(tick);
    const label = tickLabel(tick);
    const labelWidth = textWidth(label, style, size);
    marks.push(
      { kind: "rule", x1: at, y1: header - 2, x2: at, y2: plotBottom, color: GRID_COLOR, width: 0.5 },
      { kind: "text", x: Math.min(Math.max(at - labelWidth / 2, gutter), width - labelWidth), y: size * 0.3, text: label, size, color: style.mutedColor },
    );
  }
  marks.push({ kind: "rule", x1: gutter, y1: header - 2, x2: width, y2: header - 2, color: AXIS_COLOR, width: 0.75 });

  spans.forEach((point, index) => {
    const top = header + index * band;
    const middle = top + band / 2;
    const x0 = x(point.start!);
    const x1 = x(point.end ?? point.start!);
    const fill = point.color ?? color;
    const when =
      point.end! > point.start!
        ? `${spanDate(new Date(point.start!))} – ${spanDate(new Date(point.end!))} (${formatSpan(point.start!, point.end!)})`
        : spanDate(new Date(point.start!));
    if (point.end! <= point.start!) {
      const r = thickness / 2;
      marks.push({ kind: "shape", points: [[x0, middle - r], [x0 + r, middle], [x0, middle + r], [x0 - r, middle]], fill, tip: `${point.label}: ${when}` });
    } else {
      // However short, a span is a bar: at least wide enough to be seen as one.
      const w = Math.max(4, x1 - x0);
      marks.push({ kind: "shape", points: roundedBox(x0, middle - thickness / 2, w, thickness, BAR_RADIUS), fill, tip: `${point.label}: ${when}` });
    }
    const name = fit(point.label, gutter - 10, style, size);
    marks.push({ kind: "text", x: 0, y: middle - size * 0.5, text: name, size, color: style.textColor });
    if (block.showValues) {
      marks.push({
        kind: "text",
        x: (point.end! > point.start! ? Math.max(x1, x0 + 4) : x0 + thickness / 2) + 6,
        y: middle - size * 0.5,
        text: durations[index]!,
        size,
        bold: true,
        color: style.textColor,
      });
    }
  });

  let bottom = plotBottom;
  const now = Date.now();
  const [first, final] = x.domain().map(Number) as [number, number];
  if (now >= first && now <= final) {
    const at = x(now);
    const label = "Today";
    marks.push(
      { kind: "rule", x1: at, y1: header - 2, x2: at, y2: plotBottom, color: CHART_PALETTE[7]!, width: 1 },
      {
        kind: "text",
        x: Math.min(Math.max(at - textWidth(label, style, size, true) / 2, gutter), width - textWidth(label, style, size, true)),
        y: plotBottom + 3,
        text: label,
        size,
        bold: true,
        color: CHART_PALETTE[7]!,
      },
    );
    bottom += size * 1.5 + 3;
  }

  return { width, height: bottom, marks };
}

/* ------------------------------ in a fixed box --------------------------- */

/** A mark shifted by (dx, dy). */
export const movedMark = (mark: ChartMark, dx: number, dy: number): ChartMark => {
  switch (mark.kind) {
    case "shape":
    case "polyline":
      return { ...mark, points: mark.points.map(([x, y]): Point => [x + dx, y + dy]) };
    case "rule":
      return { ...mark, x1: mark.x1 + dx, y1: mark.y1 + dy, x2: mark.x2 + dx, y2: mark.y2 + dy };
    case "dot":
      return { ...mark, cx: mark.cx + dx, cy: mark.cy + dy };
    case "text":
      return { ...mark, x: mark.x + dx, y: mark.y + dy };
  }
};

/**
 * A chart laid out to fill a box — a custom slide's element — rather than
 * to a height of its own: the title across the top, the note along the
 * bottom, and the plot given what is left. Laid out once, and again shorter
 * by however far its axis labels or legend ran past the box, so the whole
 * chart stays inside what the author drew.
 */
export function layoutChartBox(
  look: ChartLook,
  data: ChartData,
  words: { title?: string; emptyText?: string },
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
  const marks: ChartMark[] = [];
  const titleSize = style.fontSize + 2;
  const small = labelSize(style);
  let top = 0;
  if (words.title) {
    const text = fit(words.title, width, style, titleSize);
    marks.push({ kind: "text", x: 0, y: 0, text, size: titleSize, bold: true, color: style.accentColor ?? style.textColor });
    top = titleSize * 1.35 + 6;
  }
  if (!data.points.length) {
    if (words.emptyText) {
      marks.push({ kind: "text", x: 0, y: top, text: fit(words.emptyText, width, style, small), size: small, color: style.mutedColor });
    }
    return { width, height, marks };
  }

  const bottom = data.note ? small * 1.4 + 4 : 0;
  const room = Math.max(40, height - top - bottom);
  let scene = layoutChart({ ...look, height: room }, data.points, width, style);
  if (scene.height > room) scene = layoutChart({ ...look, height: Math.max(40, room - (scene.height - room)) }, data.points, width, style);
  marks.push(...scene.marks.map(mark => movedMark(mark, 0, top)));
  if (data.note) {
    marks.push({ kind: "text", x: 0, y: top + scene.height + 4, text: fit(data.note, width, style, small), size: small, color: style.mutedColor });
  }
  return { width, height: Math.max(height, top + scene.height + bottom), marks };
}

/* ------------------------------- on paper -------------------------------- */

/** A laid-out chart's marks, through the PDF writer's own primitives, with its top-left at (x, y). */
export function drawChart(document: PdfDocument, scene: ChartScene, x: number, y: number): void {
  const at = ([px, py]: Point): Point => [x + px, y + py];
  for (const mark of scene.marks) {
    switch (mark.kind) {
      case "shape":
        document.withOpacity(mark.opacity, () =>
          document.drawPath(mark.points.map(at), {
            fill: mark.fill === "none" ? undefined : mark.fill,
            stroke: mark.stroke,
            strokeWidth: mark.strokeWidth,
          }),
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
