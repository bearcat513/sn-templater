/** The columns chart's layout. */
import { scaleBand } from "d3";
import { CHART_PALETTE, type ChartDatum, type ChartLook } from "./data";
import {
  type ChartScene,
  type ChartStyle,
  MAX_BAR,
  barShape,
  fit,
  formatFigure,
  labelSize,
  textWidth,
  tickGutter,
  tip,
  valueGrid,
  valueScale,
} from "./shared";

/* -------------------------------- columns -------------------------------- */

export function layoutColumns(
  block: ChartLook,
  points: ChartDatum[],
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
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
