/** The funnel chart's layout. */
import { max, scaleBand } from "d3";
import { CHART_PALETTE, type ChartDatum, type ChartLook } from "./data";
import {
  BAR_RADIUS,
  type ChartMark,
  type ChartScene,
  type ChartStyle,
  fit,
  formatFigure,
  formatShare,
  labelSize,
  roundedBox,
  textWidth,
  tip,
} from "./shared";

/* --------------------------------- funnel -------------------------------- */

/**
 * Stages, widest first as they come, centred one under the next with a faint
 * neck between them. Each figure's share is of the first stage: what is left
 * of what came in.
 */
export function layoutFunnel(
  block: ChartLook,
  points: ChartDatum[],
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
  const size = labelSize(style);
  const gutter = Math.min(max(points, point => textWidth(point.label, style, size)) ?? 0, width * 0.3) + 10;
  const first = points[0]?.value ?? 0;
  const figures = points.map(point =>
    block.showValues ? `${formatFigure(point.value)} · ${formatShare(point.value, first)}` : "",
  );
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
        points: [
          [center - w / 2, top + band],
          [center + w / 2, top + band],
          [center + nw / 2, nextTop],
          [center - nw / 2, nextTop],
        ],
        fill: point.color ?? color,
        opacity: 0.15,
      });
    }
    marks.push({
      kind: "shape",
      points: roundedBox(center - w / 2, top, w, band, BAR_RADIUS),
      fill: point.color ?? color,
      tip: tip(point),
    });
    const name = fit(point.label, gutter - 10, style, size);
    marks.push({
      kind: "text",
      x: gutter - 10 - textWidth(name, style, size),
      y: top + band / 2 - size * 0.5,
      text: name,
      size,
      color: style.textColor,
    });
    if (figures[index]) {
      marks.push({
        kind: "text",
        x: right + 10,
        y: top + band / 2 - size * 0.5,
        text: figures[index]!,
        size,
        bold: true,
        color: style.textColor,
      });
    }
  });

  return { width, height, marks };
}
