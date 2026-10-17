/**
 * Custom slides, drawn into a PDF — and the geometry the HTML sheet shares.
 *
 * A custom slide has no flow: every element is a box at a place on the sheet
 * (see ./presentation.ts). The renderer here and the HTML one in
 * slides/Freeform.tsx read the same boxes through the same helpers — where
 * a shape's text sits, how far in from its edge, where an arrowhead points —
 * so the exported page and the slide on screen put things in the same place.
 */
import type { EmbeddableImage } from "./image";
import type { PdfDocument } from "./pdf";
import { measureText, wrapText, type FontFamily } from "./pdfFonts";
import type { CustomSlide, LineElement, ShapeElement, SlideElement } from "./presentation";

/** PowerPoint's own text-box insets: a tenth of an inch at the sides, a twentieth top and bottom. */
export const TEXT_INSET_X = 7.2;
export const TEXT_INSET_Y = 3.6;

export const DEFAULT_LINE_HEIGHT = 1.2;

/** Where a shape's text goes: the box, or the part of an ellipse or triangle that text fits in. */
export function textFrame(element: Pick<ShapeElement, "shape" | "x" | "y" | "w" | "h">): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const { x, y, w, h } = element;
  switch (element.shape) {
    case "ellipse": {
      // The largest rectangle inside an ellipse is inset by 1 - 1/√2 of each half-axis.
      const inset = (1 - Math.SQRT1_2) / 2;
      return { x: x + w * inset, y: y + h * inset, w: w * (1 - inset * 2), h: h * (1 - inset * 2) };
    }
    case "triangle":
      return { x: x + w / 4, y: y + h / 2, w: w / 2, h: h / 2 };
    default:
      return { x, y, w, h };
  }
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

/* --------------------------------- drawing ------------------------------- */

export type FreeformContext = {
  document: PdfDocument;
  family: FontFamily;
  fill: (text: string) => string;
  picture: (source: string, what: string) => EmbeddableImage | null;
};

/** Draws a custom slide's elements onto the current page, back to front. */
export function renderCustomSlide(slide: CustomSlide, context: FreeformContext): void {
  slide.elements.forEach((element, index) =>
    context.document.withOpacity(element.opacity, () => drawElement(element, index, context)),
  );
}

function drawElement(element: SlideElement, index: number, context: FreeformContext): void {
  const { document } = context;

  switch (element.type) {
    case "shape": {
      document.drawShape(element.shape, element.x, element.y, element.w, element.h, {
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
        radius: cornerRadius(element.w, element.h),
      });
      drawText(element, context);
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
    const wrapped = wrapText(paragraph, width - indent, family, size, style);
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
