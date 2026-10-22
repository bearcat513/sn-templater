/** The marks a chart is laid out as, and the pieces every kind of chart shares. */
import { format, max, min, scaleLinear } from "d3";
import { type FontFamily, measureText, truncateToWidth } from "../pdfFonts";
import { AXIS_COLOR, CHART_PALETTE, type ChartDatum, GRID_COLOR, OTHER_COLOR } from "./data";

/* ---------------------------------- marks -------------------------------- */

export type Point = [number, number];

export type ChartMark =
  /** A closed, filled shape: a bar, a slice, an area's wash. */
  | {
      kind: "shape";
      points: Point[];
      fill: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
      tip?: string;
    }
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
export const MAX_BAR = 24;
export const BAR_RADIUS = 4;
export const LINE_WIDTH = 2;
export const DOT_RADIUS = 4;
export const GAP = 2;

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
export const labelSize = (style: ChartStyle) => Math.max(6, style.fontSize * 0.8);

export const textWidth = (text: string, style: ChartStyle, size: number, bold = false) =>
  measureText(text, style.family, size, { bold });

export const fit = (text: string, room: number, style: ChartStyle, size: number) =>
  truncateToWidth(text, Math.max(0, room), style.family, size);

/** The figure as the chart labels it, and as its tooltip says it. */
export const tip = (point: ChartDatum) =>
  `${point.label}${point.to !== undefined ? ` → ${point.to}` : ""}: ${formatFigure(point.value)}`;

/** A value axis that always includes zero, rounded out to clean ticks. */
export function valueScale(points: ChartDatum[], range: [number, number]) {
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
export function barShape(
  x: number,
  y: number,
  w: number,
  h: number,
  end: "top" | "bottom" | "left" | "right",
): Point[] {
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
      return [
        [x, bottom],
        ...arc(x + r, y + r, pi, pi * 1.5),
        ...arc(right - r, y + r, pi * 1.5, pi * 2),
        [right, bottom],
      ];
    case "bottom":
      return [[x, y], [right, y], ...arc(right - r, bottom - r, 0, pi / 2), ...arc(x + r, bottom - r, pi / 2, pi)];
    case "right":
      return [
        [x, y],
        ...arc(right - r, y + r, pi * 1.5, pi * 2),
        ...arc(right - r, bottom - r, 0, pi / 2),
        [x, bottom],
      ];
    case "left":
      return [[right, y], [right, bottom], ...arc(x + r, bottom - r, pi / 2, pi), ...arc(x + r, y + r, pi, pi * 1.5)];
  }
}

/** Gridlines and their labels down the left, for a vertical value scale. */
export function valueGrid(
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
      {
        kind: "rule",
        x1: left,
        y1: at,
        x2: right,
        y2: at,
        color: tick === 0 ? AXIS_COLOR : GRID_COLOR,
        width: tick === 0 ? 0.75 : 0.5,
      },
      {
        kind: "text",
        x: left - 6 - textWidth(label, style, size),
        y: at - size * 0.5,
        text: label,
        size,
        color: style.mutedColor,
      },
    );
  }
  return marks;
}

export const tickGutter = (y: ReturnType<typeof valueScale>, style: ChartStyle, size: number) =>
  (max(y.ticks(5), tick => textWidth(formatFigure(tick), style, size)) ?? 0) + 6;

/* ------------------------------ shared pieces ---------------------------- */

/** A box with every corner rounded, sampled as a polygon. */
export function roundedBox(x: number, y: number, w: number, h: number, radius: number): Point[] {
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
export const namesOf = (points: ChartDatum[], side: "label" | "to"): string[] => [
  ...new Set(points.map(point => point[side] ?? "")),
];

/** The palette by position, with "Other" grey and nothing past the eighth given a hue of its own. */
export const paletteColor = (name: string, index: number) =>
  name === "Other" ? OTHER_COLOR : (CHART_PALETTE[index] ?? OTHER_COLOR);

/** A legend in a row — a swatch and a name each — wrapped to the width. */
export function legendRow(entries: { name: string; color: string }[], width: number, style: ChartStyle, size: number) {
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

export const formatShare = (value: number, total: number): string => (total ? format(".0%")(value / total) : "–");
