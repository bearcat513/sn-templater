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
 */
import { ascending, descending, format, max, min, pie, rollups, scaleBand, scaleLinear, scalePoint } from "d3";
import { measureText, truncateToWidth, type FontFamily } from "./pdfFonts";
import type { RelatedRows } from "./render";
import { chartRelatedList, relatedKey, type ChartBlock } from "./template";

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

export type ChartDatum = { label: string; value: number; color?: string };

export type ChartData = {
  points: ChartDatum[];
  /** For `{{list.count}}` in the title: how many related records matched. */
  count?: number;
  /** A sentence under the chart when it shows less than everything. */
  note?: string;
  /** Why the related rows could not be read, when they could not. */
  error?: string;
};

/** Most bars or columns drawn; the rest fold into "Other". */
const MAX_BARS = 24;
/** Most slices; the eighth hue is the last, so a ninth category is "Other". */
const MAX_SLICES = CHART_PALETTE.length;
const MAX_LINE_POINTS = 60;

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
 * The figures a chart block draws for one record: its own items, filled and
 * read as numbers, or its related rows counted by the grouping field.
 */
export function chartData(
  block: ChartBlock,
  fill: (text: string) => string,
  related: Record<string, RelatedRows>,
): ChartData {
  if (block.related?.groupBy) {
    const data = related[relatedKey(chartRelatedList(block.related))];
    const rows = data?.rows ?? [];
    const field = block.related.groupBy;
    const counted = rollups(
      rows,
      group => group.length,
      row => row[field]?.trim() || "(empty)",
    ).map(([label, value]): ChartDatum => ({ label, value }));
    // Categories by size, except along a line, which reads left to right in their own order.
    counted.sort(
      block.chart === "line"
        ? (a, b) => ascending(a.label, b.label)
        : (a, b) => descending(a.value, b.value) || ascending(a.label, b.label),
    );
    const total = data?.total ?? rows.length;
    return {
      points: fold(block, counted),
      count: total,
      ...(total > rows.length ? { note: `Counted from the first ${rows.length} of ${total} records.` } : {}),
      ...(data?.error ? { error: data.error } : {}),
    };
  }

  const points = block.items
    .map(item => ({ label: fill(item.label).trim(), value: readFigure(fill(item.value)) }))
    .filter((item): item is ChartDatum => item.value !== null);
  return { points: fold(block, points) };
}

/** Past what the chart can show, the smallest figures become one "Other", or a line is cut short. */
function fold(block: ChartBlock, points: ChartDatum[]): ChartDatum[] {
  if (block.chart === "line") return points.slice(0, MAX_LINE_POINTS);
  const round = block.chart === "pie" || block.chart === "donut";
  // A pie of negative slices means nothing, so only what is above zero is a slice.
  const usable = round ? points.filter(point => point.value > 0) : points;
  const limit = round ? MAX_SLICES : MAX_BARS;
  if (usable.length <= limit) return usable;
  const kept = [...usable].sort((a, b) => descending(Math.abs(a.value), Math.abs(b.value))).slice(0, limit - 1);
  const rest = usable.filter(point => !kept.includes(point));
  const other: ChartDatum = { label: "Other", value: rest.reduce((sum, point) => sum + point.value, 0), color: OTHER_COLOR };
  return [...usable.filter(point => kept.includes(point)), other];
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
export function layoutChart(block: ChartBlock, points: ChartDatum[], width: number, style: ChartStyle): ChartScene {
  const height = Math.max(40, block.height);
  switch (block.chart) {
    case "bar":
      return layoutBars(block, points, width, height, style);
    case "line":
      return layoutLine(block, points, width, height, style);
    case "pie":
    case "donut":
      return layoutPie(block, points, width, height, style);
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
const tip = (point: ChartDatum) => `${point.label}: ${formatFigure(point.value)}`;

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

function layoutColumns(block: ChartBlock, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
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

function layoutBars(block: ChartBlock, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
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

function layoutLine(block: ChartBlock, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
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

  if (at.length > 1) {
    const zero = y(0);
    marks.push({ kind: "shape", points: [[at[0]![0], zero], ...at, [at[at.length - 1]![0], zero]], fill: color, opacity: 0.1 });
    marks.push({ kind: "polyline", points: at, color, width: LINE_WIDTH });
  }

  // Every dot while they have room to be told apart; past that, only the last.
  const crowded = at.length > 1 && (right - left) / (at.length - 1) < DOT_RADIUS * 4;
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

function layoutPie(block: ChartBlock, points: ChartDatum[], width: number, height: number, style: ChartStyle): ChartScene {
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
