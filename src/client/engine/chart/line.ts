/** The line chart's layout. */
import { max, scalePoint } from "d3";
import { CHART_PALETTE, type ChartDatum, type ChartLook } from "./data";
import {
  type ChartScene,
  type ChartStyle,
  DOT_RADIUS,
  LINE_WIDTH,
  type Point,
  fit,
  formatFigure,
  labelSize,
  textWidth,
  tickGutter,
  tip,
  valueGrid,
  valueScale,
} from "./shared";

/* ---------------------------------- line --------------------------------- */

export function layoutLine(
  block: ChartLook,
  points: ChartDatum[],
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
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
    marks.push({
      kind: "shape",
      points: [[at[0]![0], zero], ...at, [at[at.length - 1]![0], zero]],
      fill: color,
      opacity: area ? 0.3 : 0.1,
    });
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
