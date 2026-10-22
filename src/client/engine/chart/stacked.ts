/** The stacked chart's layout. */
import { scaleBand, sum } from "d3";
import { type ChartDatum, type ChartLook } from "./data";
import {
  type ChartMark,
  type ChartScene,
  type ChartStyle,
  MAX_BAR,
  type Point,
  barShape,
  fit,
  formatFigure,
  labelSize,
  legendRow,
  namesOf,
  paletteColor,
  textWidth,
  tickGutter,
  valueGrid,
  valueScale,
} from "./shared";

/* ------------------------------ stacked columns -------------------------- */

/**
 * A column for each label, stacked from its pairs: the stacks largest first
 * from the baseline, in the palette's order, named in a legend across the top.
 */
export function layoutStacked(
  block: ChartLook,
  points: ChartDatum[],
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
  const size = labelSize(style);
  const columns = namesOf(points, "label");
  // In the order they first come — largest first, or the field's own — with "Other" at the top of every column.
  const stacks = namesOf(points, "to").sort((a, b) => Number(a === "Other") - Number(b === "Other"));
  const colorOf = new Map(stacks.map((name, index) => [name, paletteColor(name, index)]));
  const value = new Map(points.map(point => [JSON.stringify([point.label, point.to]), point.value]));
  const totals = columns.map(column => ({
    label: column,
    value: sum(stacks, stack => value.get(JSON.stringify([column, stack])) ?? 0),
  }));

  const legend = legendRow(
    stacks.map(name => ({ name, color: colorOf.get(name)! })),
    width,
    style,
    size,
  );
  const top = legend.height + (block.showValues ? size * 1.5 : size * 0.6) + 4;
  const bottom = Math.max(top + 20, height - size * 1.8);
  const y = valueScale(totals, [bottom, top]);
  const left = tickGutter(y, style, size);
  const x = scaleBand<string>().domain(columns).range([left, width]).paddingInner(0.3).paddingOuter(0.2);
  const thickness = Math.min(MAX_BAR * 1.5, x.bandwidth());
  const marks: ChartMark[] = [...legend.marks, ...valueGrid(y, left, width, style, size)];

  columns.forEach((column, index) => {
    const center = (x(column) ?? left) + x.bandwidth() / 2;
    const parts = stacks.filter(stack => (value.get(JSON.stringify([column, stack])) ?? 0) > 0);
    let below = 0;
    parts.forEach((stack, at) => {
      const figure = value.get(JSON.stringify([column, stack]))!;
      const y0 = y(below);
      const y1 = y(below + figure);
      below += figure;
      if (y0 - y1 < 0.25) return;
      const last = at === parts.length - 1;
      const box: Point[] = last
        ? barShape(center - thickness / 2, y1, thickness, y0 - y1, "top")
        : [
            [center - thickness / 2, y0],
            [center + thickness / 2, y0],
            [center + thickness / 2, y1],
            [center - thickness / 2, y1],
          ];
      marks.push({
        kind: "shape",
        points: box,
        fill: colorOf.get(stack)!,
        stroke: style.surface,
        strokeWidth: 1,
        tip: `${column} · ${stack}: ${formatFigure(figure)}`,
      });
    });
    if (block.showValues) {
      const label = formatFigure(totals[index]!.value);
      marks.push({
        kind: "text",
        x: center - textWidth(label, style, size, true) / 2,
        y: y(totals[index]!.value) - size * 1.3,
        text: label,
        size,
        bold: true,
        color: style.textColor,
      });
    }
    const name = fit(column, x.step() - 2, style, size);
    marks.push({
      kind: "text",
      x: center - textWidth(name, style, size) / 2,
      y: bottom + size * 0.5,
      text: name,
      size,
      color: style.mutedColor,
    });
  });

  return { width, height: Math.max(height, bottom + size * 1.8), marks };
}
