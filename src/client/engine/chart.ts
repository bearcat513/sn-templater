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
 *
 * ## Where things are
 *
 * `./chart/data.ts` reads, counts and folds the figures; `./chart/shared.ts`
 * holds the marks and the pieces every kind shares; each kind lays itself out
 * in its own file under `./chart/`. This file picks the kind, fits a chart to
 * a box, and draws a laid-out chart into the PDF.
 */
import type { PdfDocument } from "./pdf";
import { layoutColumns } from "./chart/columns";
import { layoutBars } from "./chart/bars";
import { layoutLine } from "./chart/line";
import { layoutPie } from "./chart/pie";
import { layoutFunnel } from "./chart/funnel";
import { layoutStacked } from "./chart/stacked";
import { layoutHeatmap } from "./chart/heatmap";
import { layoutSankey } from "./chart/sankey";
import { layoutGantt } from "./chart/gantt";
import { fit, labelSize, type ChartMark, type ChartScene, type ChartStyle, type Point } from "./chart/shared";
import type { ChartData, ChartDatum, ChartLook } from "./chart/data";

export {
  CHART_PALETTE,
  MAX_SPANS,
  chartData,
  chartPoints,
  readDate,
  readFigure,
  redrawAs,
  resolveChart,
  spanPoints,
  type ChartData,
  type ChartDatum,
  type ChartLook,
  type LoadedChart,
} from "./chart/data";
export { formatFigure, type ChartMark, type ChartScene, type ChartStyle } from "./chart/shared";

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
    marks.push({
      kind: "text",
      x: 0,
      y: 0,
      text,
      size: titleSize,
      bold: true,
      color: style.accentColor ?? style.textColor,
    });
    top = titleSize * 1.35 + 6;
  }
  if (!data.points.length) {
    if (words.emptyText) {
      marks.push({
        kind: "text",
        x: 0,
        y: top,
        text: fit(words.emptyText, width, style, small),
        size: small,
        color: style.mutedColor,
      });
    }
    return { width, height, marks };
  }

  const bottom = data.note ? small * 1.4 + 4 : 0;
  const room = Math.max(40, height - top - bottom);
  let scene = layoutChart({ ...look, height: room }, data.points, width, style);
  if (scene.height > room)
    scene = layoutChart({ ...look, height: Math.max(40, room - (scene.height - room)) }, data.points, width, style);
  marks.push(...scene.marks.map(mark => movedMark(mark, 0, top)));
  if (data.note) {
    marks.push({
      kind: "text",
      x: 0,
      y: top + scene.height + 4,
      text: fit(data.note, width, style, small),
      size: small,
      color: style.mutedColor,
    });
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
        document.drawLine(x + mark.x1, y + mark.y1, x + mark.x2, y + mark.y2, {
          color: mark.color,
          thickness: mark.width,
        });
        break;
      case "dot": {
        const ring = mark.r + 2;
        document.drawShape("ellipse", x + mark.cx - ring, y + mark.cy - ring, ring * 2, ring * 2, { fill: mark.ring });
        document.drawShape("ellipse", x + mark.cx - mark.r, y + mark.cy - mark.r, mark.r * 2, mark.r * 2, {
          fill: mark.fill,
        });
        break;
      }
      case "text":
        document.drawTextAt(mark.text, x + mark.x, y + mark.y, { size: mark.size, color: mark.color, bold: mark.bold });
        break;
    }
  }
}
