/** The bars chart's layout. */
import { max, scaleBand } from "d3";
import { AXIS_COLOR, CHART_PALETTE, type ChartDatum, type ChartLook, GRID_COLOR } from "./data";
import {
  type ChartMark,
  type ChartScene,
  type ChartStyle,
  MAX_BAR,
  barShape,
  fit,
  formatFigure,
  labelSize,
  textWidth,
  tip,
  valueScale,
} from "./shared";

/* ---------------------------------- bars --------------------------------- */

export function layoutBars(
  block: ChartLook,
  points: ChartDatum[],
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
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
        {
          kind: "text",
          x: at - textWidth(label, style, size) / 2,
          y: height - axis + size * 0.5,
          text: label,
          size,
          color: style.mutedColor,
        },
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
    marks.push({
      kind: "text",
      x: gutter - 8 - textWidth(name, style, size),
      y: center - size * 0.5,
      text: name,
      size,
      color: style.textColor,
    });
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
