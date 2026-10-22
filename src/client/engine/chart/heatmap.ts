/** The heatmap chart's layout. */
import { max } from "d3";
import { CHART_PALETTE, type ChartDatum, type ChartLook, GRID_COLOR } from "./data";
import {
  type ChartMark,
  type ChartScene,
  type ChartStyle,
  fit,
  formatFigure,
  labelSize,
  namesOf,
  roundedBox,
  textWidth,
} from "./shared";

/* --------------------------------- heatmap ------------------------------- */

/**
 * A grid of rows by columns, each cell the series colour as deep as its
 * figure is large against the largest. A pair with no figure is an empty,
 * grey cell — not a pale one, which would say "a little".
 */
export function layoutHeatmap(
  block: ChartLook,
  points: ChartDatum[],
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
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
    marks.push({
      kind: "text",
      x: center - textWidth(name, style, size) / 2,
      y: size * 0.3,
      text: name,
      size,
      color: style.mutedColor,
    });
  });

  rows.forEach((row, r) => {
    const top = header + r * cellHeight;
    const name = fit(row, gutter - 8, style, size);
    marks.push({
      kind: "text",
      x: gutter - 8 - textWidth(name, style, size),
      y: top + cellHeight / 2 - size * 0.5,
      text: name,
      size,
      color: style.textColor,
    });
    columns.forEach((column, c) => {
      const figure = value.get(JSON.stringify([row, column]));
      const box = roundedBox(gutter + c * cellWidth + 1, top + 1, cellWidth - 2, cellHeight - 2, 2);
      if (figure === undefined) {
        marks.push({ kind: "shape", points: box, fill: GRID_COLOR, opacity: 0.5 });
        return;
      }
      const depth = peak ? Math.abs(figure) / peak : 0;
      marks.push({
        kind: "shape",
        points: box,
        fill: color,
        opacity: 0.08 + 0.92 * depth,
        tip: `${row} · ${column}: ${formatFigure(figure)}`,
      });
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
