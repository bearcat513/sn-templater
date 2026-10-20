/**
 * Custom slides, drawn into a PDF — and the geometry the HTML sheet shares.
 *
 * A custom slide has no flow: every element is a box at a place on the sheet
 * (see ./presentation.ts). The renderer here and the HTML one in
 * slides/Freeform.tsx read the same boxes through the same helpers — where
 * a shape's text sits, how far in from its edge, where an arrowhead points —
 * so the exported page and the slide on screen put things in the same place.
 */
import { layoutChartBox, drawChart, movedMark, redrawAs, type ChartData, type ChartMark, type ChartScene, type ChartStyle, type LoadedChart } from "./chart";
import type { EmbeddableImage } from "./image";
import { safeUrl } from "./links";
import type { PdfDocument } from "./pdf";
import { measureText, wrapText, type FontFamily, type FontStyle } from "./pdfFonts";
import { chartShape } from "./template";
import { TOKEN_PATTERN } from "./tokens";
import type { ChartElement, CustomSlide, LineElement, ShapeElement, ShapeKind, SlideElement, TableElement } from "./presentation";

/** PowerPoint's own text-box insets: a tenth of an inch at the sides, a twentieth top and bottom. */
export const TEXT_INSET_X = 7.2;
export const TEXT_INSET_Y = 3.6;

export const DEFAULT_LINE_HEIGHT = 1.2;

/**
 * The outline of every shape that is not a rectangle or an ellipse, as
 * corners in the unit square — scaled to the box by `shapePoints`. The PDF
 * and the SVG on screen draw the same corners.
 */
const UNIT_SHAPES: Partial<Record<ShapeKind, [number, number][]>> = {
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  rightTriangle: [[0, 0], [1, 1], [0, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  pentagon: [[0.5, 0], [1, 0.38], [0.81, 1], [0.19, 1], [0, 0.38]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  parallelogram: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]],
  trapezoid: [[0.2, 0], [0.8, 0], [1, 1], [0, 1]],
  chevron: [[0, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0, 1], [0.25, 0.5]],
  arrow: [[0, 0.25], [0.6, 0.25], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.75], [0, 0.75]],
  star: starPoints(),
};

/** A five-pointed star, stretched to fill the unit square as a drawn star fills its box. */
function starPoints(): [number, number][] {
  const raw: [number, number][] = [];
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? 0.5 : 0.19;
    const angle = (-90 + point * 36) * (Math.PI / 180);
    raw.push([0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)]);
  }
  const ys = raw.map(([, y]) => y);
  const top = Math.min(...ys);
  const span = Math.max(...ys) - top;
  return raw.map(([x, y]) => [x, (y - top) / span]);
}

/** A polygon shape's corners in its box, or null for the shapes drawn as curves and rectangles. */
export function shapePoints(element: Pick<ShapeElement, "shape" | "x" | "y" | "w" | "h">): [number, number][] | null {
  const unit = UNIT_SHAPES[element.shape];
  return unit ? unit.map(([px, py]) => [element.x + px * element.w, element.y + py * element.h]) : null;
}

/** Where text sits in each shape, as shares of its box: the part of it a line of text fits across. */
const TEXT_FRAMES: Partial<Record<ShapeKind, [number, number, number, number]>> = {
  triangle: [0.25, 0.5, 0.5, 0.5],
  rightTriangle: [0, 0.5, 0.5, 0.5],
  diamond: [0.25, 0.25, 0.5, 0.5],
  pentagon: [0.18, 0.3, 0.64, 0.6],
  hexagon: [0.18, 0, 0.64, 1],
  parallelogram: [0.2, 0, 0.6, 1],
  trapezoid: [0.18, 0, 0.64, 1],
  chevron: [0.25, 0, 0.5, 1],
  arrow: [0, 0.25, 0.8, 0.5],
  star: [0.3, 0.38, 0.4, 0.4],
};

/** Where a shape's text goes: the box, or the part of an ellipse or polygon that text fits in. */
export function textFrame(element: Pick<ShapeElement, "shape" | "x" | "y" | "w" | "h">): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const { x, y, w, h } = element;
  if (element.shape === "ellipse") {
    // The largest rectangle inside an ellipse is inset by 1 - 1/√2 of each half-axis.
    const inset = (1 - Math.SQRT1_2) / 2;
    return { x: x + w * inset, y: y + h * inset, w: w * (1 - inset * 2), h: h * (1 - inset * 2) };
  }
  const frame = TEXT_FRAMES[element.shape];
  return frame ? { x: x + w * frame[0], y: y + h * frame[1], w: w * frame[2], h: h * frame[3] } : { x, y, w, h };
}

/* ---------------------------------- tables -------------------------------- */

export type TableCellBox = { row: number; column: number; x: number; y: number; w: number; h: number };

/** The cells of a table element in sheet points: equal rows, columns by their shares. */
export function tableCells(table: Pick<TableElement, "x" | "y" | "w" | "h" | "rows" | "columns">): TableCellBox[] {
  const rows = Math.max(1, table.rows.length);
  const count = Math.max(1, table.rows[0]?.length ?? 1);
  const shares = table.columns?.length === count ? table.columns : Array.from({ length: count }, () => 1);
  const total = shares.reduce((sum, share) => sum + share, 0) || 1;
  const rowHeight = table.h / rows;
  const cells: TableCellBox[] = [];
  for (let row = 0; row < rows; row++) {
    let x = table.x;
    for (let column = 0; column < count; column++) {
      const w = (shares[column]! / total) * table.w;
      cells.push({ row, column, x, y: table.y + row * rowHeight, w, h: rowHeight });
      x += w;
    }
  }
  return cells;
}

/** The id the builder edits one cell of a table under: `<table id>#<row>,<column>`. */
export const cellId = (tableId: string, row: number, column: number): string => `${tableId}#${row},${column}`;

/** The cell an editing id names, or null when it names a whole element. */
export function parseCellId(value: string): { id: string; row: number; column: number } | null {
  const match = /^(.+)#(\d+),(\d+)$/.exec(value);
  return match ? { id: match[1]!, row: Number(match[2]), column: Number(match[3]) } : null;
}

/**
 * One cell as a text box: what both renderers draw its text with, so a cell's
 * text wraps, aligns and sits in the middle exactly as a shape's does.
 */
export function cellShape(table: TableElement, cell: TableCellBox): ShapeElement {
  const header = table.header && cell.row === 0;
  return {
    type: "shape",
    shape: "rect",
    id: cellId(table.id, cell.row, cell.column),
    x: cell.x,
    y: cell.y,
    w: cell.w,
    h: cell.h,
    text: table.rows[cell.row]?.[cell.column] ?? "",
    size: table.size,
    color: header ? (table.headerColor ?? table.color) : table.color,
    ...(header ? { bold: true } : {}),
    align: table.align,
    valign: "middle",
    ...(table.family ? { family: table.family } : {}),
  };
}

/** What a cell is filled with: the header's colour, a band, or the body's own. */
export function cellFill(table: TableElement, row: number): string | undefined {
  if (table.header && row === 0) return table.headerFill;
  const bodyRow = table.header ? row - 1 : row;
  return table.banded && bodyRow % 2 === 1 ? table.banded : table.fill;
}

/** The grid's inner lines, between rows and between columns, as segments. */
export function tableLines(table: TableElement): [number, number, number, number][] {
  const cells = tableCells(table);
  const lines: [number, number, number, number][] = [];
  for (const cell of cells) {
    if (cell.row > 0 && cell.column === 0) lines.push([table.x, cell.y, table.x + table.w, cell.y]);
    if (cell.column > 0 && cell.row === 0) lines.push([cell.x, table.y, cell.x, table.y + table.h]);
  }
  return lines;
}

/* --------------------------------- rotation ------------------------------- */

/** The upright box a turned one occupies — what a link covers, and what a marquee catches. */
export function rotatedBounds(box: { x: number; y: number; w: number; h: number; rotation?: number }): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (!box.rotation) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const radians = (box.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const w = box.w * cos + box.h * sin;
  const h = box.w * sin + box.h * cos;
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

/** A point turned about a centre, clockwise on the page, by degrees. */
export function rotatePoint(point: [number, number], center: [number, number], degrees: number): [number, number] {
  if (!degrees) return point;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
}

/* ----------------------------------- code --------------------------------- */

/**
 * Code broken to a width: every space kept, and a line broken at whichever
 * character crosses the edge, as a browser does with `break-all`.
 */
export function wrapPreserving(text: string, maxWidth: number, family: FontFamily, size: number, style: FontStyle = {}): string[] {
  if (!text) return [""];
  const lines: string[] = [];
  let current = "";
  let width = 0;
  for (const char of text.replace(/\t/g, "    ")) {
    const advance = measureText(char, family, size, style);
    if (current && width + advance > maxWidth) {
      lines.push(current);
      current = "";
      width = 0;
    }
    current += char;
    width += advance;
  }
  lines.push(current);
  return lines;
}

/** A bullet's hanging indent, relative to the type size. */
export const bulletIndent = (size: number): number => size * 1.1;

/** The radius a rounded rectangle's corners get. */
export const cornerRadius = (w: number, h: number): number => Math.min(w, h) * 0.16;

/** The ends of a line, from its box. */
export function lineEnds(line: Pick<LineElement, "x" | "y" | "w" | "h" | "flip">): {
  from: [number, number];
  to: [number, number];
} {
  return line.flip
    ? { from: [line.x, line.y + line.h], to: [line.x + line.w, line.y] }
    : { from: [line.x, line.y], to: [line.x + line.w, line.y + line.h] };
}

/** An arrowhead at `tip`, pointing away from `tail`: its three corners. */
export function arrowHead(tail: [number, number], tip: [number, number], strokeWidth: number): [number, number][] {
  const length = Math.max(7, strokeWidth * 4);
  const half = length * 0.45;
  const dx = tip[0] - tail[0];
  const dy = tip[1] - tail[1];
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const baseX = tip[0] - ux * length;
  const baseY = tip[1] - uy * length;
  return [tip, [baseX - uy * half, baseY + ux * half], [baseX + uy * half, baseY - ux * half]];
}

/** How far a line is cut back at an arrowed end, so its square cap does not poke through the point. */
export const arrowInset = (strokeWidth: number): number => Math.max(7, strokeWidth * 4) * 0.8;

/**
 * Where the first line's top sits in its line box, as a share of the type
 * size, so that a baseline drawn by the PDF writer (0.8 em below the y it is
 * given) lands where a browser puts it: half the leading above an ascent of
 * about 0.905 em, over a content area of about 1.117 em.
 */
const lineOffset = (lineHeight: number): number => (lineHeight - 1.117) / 2 + 0.105;

/* ---------------------------------- charts -------------------------------- */

/** How far a chart is inset from the edge of its card. */
const CHART_CARD_PADDING = 12;

/**
 * A chart element, laid out to its box: the chart template's title, plot and
 * note, or — before the chart has loaded, or once its template is gone — a
 * line saying so, so a hole in a slide is never silent. What the element
 * changes about the template's look is applied over it, and a card, when it
 * has one, is drawn behind and the chart inset within it.
 */
export function chartElementScene(
  element: Pick<
    ChartElement,
    "template" | "name" | "hideTitle" | "w" | "h" | "chart" | "title" | "color" | "showValues" | "size" | "fill" | "stroke" | "hideNote"
  >,
  charts: Record<string, LoadedChart>,
  style: ChartStyle,
  fill: (text: string) => string,
): ChartScene {
  const card = Boolean(element.fill || element.stroke);
  const inset = card ? CHART_CARD_PADDING : 0;
  const width = Math.max(1, element.w - inset * 2);
  const height = Math.max(1, element.h - inset * 2);
  const ink: ChartStyle = {
    ...style,
    ...(element.size ? { fontSize: element.size } : {}),
    ...(element.fill ? { surface: element.fill } : {}),
  };
  const scene = chartInBox(element, charts, ink, fill, width, height);
  if (!card) return scene;
  const backdrop: ChartMark = {
    kind: "shape",
    points: [
      [0, 0],
      [element.w, 0],
      [element.w, element.h],
      [0, element.h],
    ],
    fill: element.fill ?? "none",
    ...(element.stroke ? { stroke: element.stroke, strokeWidth: 1 } : {}),
  };
  return {
    width: element.w,
    height: Math.max(element.h, scene.height + inset * 2),
    marks: [backdrop, ...scene.marks.map(mark => movedMark(mark, inset, inset))],
  };
}

function chartInBox(
  element: Parameters<typeof chartElementScene>[0],
  charts: Record<string, LoadedChart>,
  style: ChartStyle,
  fill: (text: string) => string,
  width: number,
  height: number,
): ChartScene {
  const loaded = charts[element.template];
  if (!loaded || loaded.error) {
    const name = loaded?.name || element.name;
    const what = name ? `“${name}”` : "the chart";
    const why = !loaded ? `Counting ${what}…` : `${name ? what : "The chart"} could not be drawn: ${loaded.error}`;
    return layoutChartBox({ chart: "column", height }, { points: [] }, { emptyText: why }, width, height, style);
  }
  const { spec } = loaded;
  const kind = element.chart && chartShape(element.chart) === chartShape(spec.chart) ? element.chart : spec.chart;
  const look = {
    ...spec,
    chart: kind,
    ...(element.color ? { color: element.color } : {}),
    ...(element.showValues !== undefined ? { showValues: element.showValues } : {}),
  };
  const note = element.hideNote ? undefined : loaded.note;
  const data: ChartData = { points: redrawAs(spec, kind, loaded.points), count: loaded.total, ...(note ? { note } : {}) };
  const extra = { "list.count": String(loaded.total) };
  const words = (text: string | undefined) => (text ? fillWith(fill, text, extra) : undefined);
  return layoutChartBox(
    look,
    data,
    { title: element.hideTitle ? undefined : words(element.title || spec.title), emptyText: words(spec.emptyText) },
    width,
    height,
    style,
  );
}

/** `{{list.count}}` is the chart's, not the slide's: filled first, then the slide's own tokens. */
const fillWith = (fill: (text: string) => string, text: string, extra: Record<string, string>): string =>
  fill(text.replace(TOKEN_PATTERN, (token, name: string) => extra[name] ?? token));

/* --------------------------------- drawing ------------------------------- */

export type FreeformContext = {
  document: PdfDocument;
  family: FontFamily;
  fill: (text: string) => string;
  picture: (source: string, what: string) => EmbeddableImage | null;
  /** The instance, for links that are paths on it. */
  base?: string;
  /** Chart templates placed on the slide, counted, by sys_id. */
  charts: Record<string, LoadedChart>;
  /** The page's inks, on this slide's own background. */
  chartStyle: ChartStyle;
  problems: Set<string>;
};

/**
 * Draws a custom slide's elements onto the current page, back to front —
 * every one of them, build steps included: the PDF is the finished slide.
 */
export function renderCustomSlide(slide: CustomSlide, context: FreeformContext): void {
  const { document } = context;
  slide.elements.forEach((element, index) => {
    const turn = element.type === "line" ? 0 : element.rotation;
    document.withOpacity(element.opacity, () =>
      document.withRotation(turn, element.x + element.w / 2, element.y + element.h / 2, () =>
        drawElement(element, index, context),
      ),
    );
    if (element.link) {
      const url = safeUrl(context.fill(element.link), context.base);
      const area = rotatedBounds(element.type === "line" ? { ...element, rotation: 0 } : element);
      if (url) document.link(area.x, area.y, Math.max(area.w, 4), Math.max(area.h, 4), url);
    }
  });
}

function drawElement(element: SlideElement, index: number, context: FreeformContext): void {
  const { document } = context;

  switch (element.type) {
    case "shape": {
      const paint = { fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidth };
      const points = shapePoints(element);
      if (points) document.drawPath(points, paint);
      else
        document.drawShape(element.shape as "rect" | "roundRect" | "ellipse", element.x, element.y, element.w, element.h, {
          ...paint,
          radius: cornerRadius(element.w, element.h),
        });
      drawText(element, context);
      break;
    }

    case "table": {
      const cells = tableCells(element);
      for (const cell of cells) {
        const fill = cellFill(element, cell.row);
        if (fill) document.drawRect(cell.x, cell.y, cell.w, cell.h, fill);
      }
      if (element.border) {
        for (const [x1, y1, x2, y2] of tableLines(element)) {
          document.drawLine(x1, y1, x2, y2, { color: element.border, thickness: 0.75 });
        }
        document.drawShape("rect", element.x, element.y, element.w, element.h, { stroke: element.border, strokeWidth: 0.75 });
      }
      for (const cell of cells) drawText(cellShape(element, cell), context);
      break;
    }

    case "line": {
      const { from, to } = lineEnds(element);
      const cut = arrowInset(element.strokeWidth);
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const along = (point: [number, number], toward: [number, number], by: number): [number, number] => {
        if (!length) return point;
        return [point[0] + ((toward[0] - point[0]) / length) * by, point[1] + ((toward[1] - point[1]) / length) * by];
      };
      const start = element.arrowStart ? along(from, to, cut) : from;
      const end = element.arrowEnd ? along(to, from, cut) : to;
      document.drawLine(start[0], start[1], end[0], end[1], {
        color: element.stroke,
        thickness: element.strokeWidth,
        dashed: element.dashed,
      });
      if (element.arrowEnd) document.drawPolygon(arrowHead(from, to, element.strokeWidth), element.stroke);
      if (element.arrowStart) document.drawPolygon(arrowHead(to, from, element.strokeWidth), element.stroke);
      break;
    }

    case "chart": {
      const loaded = context.charts[element.template];
      if (!loaded) context.problems.add(`The chart “${element.name ?? element.template}” on a custom slide had not been counted yet`);
      else if (loaded.error) context.problems.add(`The chart “${loaded.name}”: ${loaded.error}`);
      drawChart(document, chartElementScene(element, context.charts, context.chartStyle, context.fill), element.x, element.y);
      break;
    }

    case "image": {
      const image = context.picture(element.source, `Picture ${index + 1} on a custom slide`);
      if (image) document.drawImageAt(image, element.x, element.y, element.w, element.h);
      if (element.stroke && (element.strokeWidth ?? 0) > 0) {
        document.drawShape("rect", element.x, element.y, element.w, element.h, {
          stroke: element.stroke,
          strokeWidth: element.strokeWidth,
        });
      }
      break;
    }
  }
}

/** A shape's text: wrapped to its frame, bulleted if asked, and aligned both ways. */
function drawText(element: ShapeElement, context: FreeformContext): void {
  const text = context.fill(element.text);
  if (!text.trim()) return;

  const { document } = context;
  const family = element.family ?? context.family;
  const style = { bold: element.bold, italic: element.italic };
  const size = element.size;
  const lineHeight = size * (element.lineHeight ?? DEFAULT_LINE_HEIGHT);
  const frame = textFrame(element);
  const width = Math.max(1, frame.w - TEXT_INSET_X * 2);
  const indent = element.bullets ? bulletIndent(size) : 0;

  // Paragraph by paragraph, so a bullet goes on each paragraph's first line only.
  const lines: { text: string; bullet: boolean }[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const wrapped = element.code
      ? wrapPreserving(paragraph, width - indent, family, size, style)
      : wrapText(paragraph, width - indent, family, size, style);
    wrapped.forEach((line, index) =>
      lines.push({ text: line, bullet: Boolean(element.bullets && index === 0 && paragraph.trim()) }),
    );
  }

  const height = lines.length * lineHeight;
  const top =
    element.valign === "middle"
      ? frame.y + (frame.h - height) / 2
      : element.valign === "bottom"
        ? frame.y + frame.h - TEXT_INSET_Y - height
        : frame.y + TEXT_INSET_Y;
  const shift = size * lineOffset(element.lineHeight ?? DEFAULT_LINE_HEIGHT);
  const left = frame.x + TEXT_INSET_X;

  lines.forEach((line, index) => {
    const y = top + index * lineHeight + shift;
    const measured = measureText(line.text, family, size, style);
    const room = width - indent;
    const x =
      left +
      indent +
      (element.align === "center" ? (room - measured) / 2 : element.align === "right" ? room - measured : 0);
    const draw = { size, family, color: element.color, bold: element.bold, italic: element.italic };

    if (line.bullet) document.drawTextAt("•", left, y, draw);
    document.drawTextAt(line.text, x, y, draw);
    if (element.underline && line.text) {
      const underline = y + size * 0.9;
      document.drawRule(underline, {
        color: element.color,
        thickness: Math.max(0.5, size * 0.06),
        from: x,
        to: x + measured,
      });
    }
  });
}
