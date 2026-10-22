/** The pie chart's layout. */
import { pie } from "d3";
import { CHART_PALETTE, type ChartDatum, type ChartLook, OTHER_COLOR } from "./data";
import {
  type ChartMark,
  type ChartScene,
  type ChartStyle,
  GAP,
  type Point,
  fit,
  formatFigure,
  formatShare,
  labelSize,
  textWidth,
  tip,
} from "./shared";

/* ----------------------------------- pie --------------------------------- */

/** Points around an arc, clockwise from 12 o'clock, a few degrees apart. */
export function arcPoints(cx: number, cy: number, radius: number, from: number, to: number): Point[] {
  const steps = Math.max(2, Math.ceil(((to - from) * 180) / Math.PI / 3));
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = from + ((to - from) * step) / steps;
    return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
  });
}

export function layoutPie(
  block: ChartLook,
  points: ChartDatum[],
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
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
    marks.push({
      kind: "dot",
      cx: legendLeft + swatch / 2,
      cy: rowY + rowHeight / 2,
      r: swatch / 2,
      fill: colorOf(point, index),
      ring: style.surface,
    });
    const figure = block.showValues ? `${formatFigure(point.value)} · ${formatShare(point.value, total)}` : "";
    const figureWidth = figure ? textWidth(figure, style, size, true) : 0;
    const nameLeft = legendLeft + swatch + 6;
    const name = fit(point.label, legendRight - nameLeft - (figure ? figureWidth + 10 : 0), style, size);
    marks.push({ kind: "text", x: nameLeft, y: lineTop, text: name, size, color: style.textColor });
    if (figure) {
      marks.push({
        kind: "text",
        x: legendRight - figureWidth,
        y: lineTop,
        text: figure,
        size,
        bold: true,
        color: style.textColor,
      });
    }
  });

  return { width, height: Math.max(height, legendTop + rowHeight * points.length), marks };
}
