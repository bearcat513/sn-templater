/** The sankey chart's layout. */
import { ascending, descending, max, min, sum } from "d3";
import { type ChartDatum, type ChartLook, OTHER_COLOR } from "./data";
import {
  type ChartMark,
  type ChartScene,
  type ChartStyle,
  type Point,
  fit,
  formatFigure,
  labelSize,
  paletteColor,
  textWidth,
} from "./shared";

/* --------------------------------- sankey -------------------------------- */

export type SankeyNode = {
  name: string;
  depth: number;
  in: number;
  out: number;
  x: number;
  y: number;
  h: number;
  color: string;
};
export type SankeyLink = { from: SankeyNode; to: SankeyNode; value: number; sy: number; ty: number; t: number };

export const NODE_WIDTH = 10;

/** One edge of a ribbon: a curve from one node's side to the other's, flat where it leaves and arrives. */
export function ribbonEdge(x0: number, y0: number, x1: number, y1: number): Point[] {
  const mid = (x0 + x1) / 2;
  return Array.from({ length: 21 }, (_, step) => {
    const t = step / 20;
    const u = 1 - t;
    const x = u * u * u * x0 + 3 * u * u * t * mid + 3 * u * t * t * mid + t * t * t * x1;
    const y = u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1;
    return [x, y];
  });
}

/**
 * Flows from one label to another as ribbons as thick as their figures,
 * between nodes as tall as what passes through them. Each node stands in the
 * column of the longest path to it, and a node nothing flows on from stands
 * in the last. The first column is named on its left and the last on its
 * right, so the names of a two-sided diagram never sit on a ribbon.
 */
export function layoutSankey(
  block: ChartLook,
  points: ChartDatum[],
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
  const size = labelSize(style);
  const nodes = new Map<string, SankeyNode>();
  const node = (name: string) => {
    let found = nodes.get(name);
    if (!found) nodes.set(name, (found = { name, depth: 0, in: 0, out: 0, x: 0, y: 0, h: 0, color: OTHER_COLOR }));
    return found;
  };
  let links = points
    .filter(point => point.to !== undefined && point.value > 0 && point.label !== point.to)
    .map(
      (point): SankeyLink => ({ from: node(point.label), to: node(point.to!), value: point.value, sy: 0, ty: 0, t: 0 }),
    );

  // The longest path to each node — and a flow back to an earlier column is a loop, which is left out.
  for (let pass = 0; pass < nodes.size; pass++) {
    let moved = false;
    for (const link of links) {
      if (link.to.depth < link.from.depth + 1 && link.from.depth + 1 < nodes.size) {
        link.to.depth = link.from.depth + 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  links = links.filter(link => link.to.depth > link.from.depth);
  for (const link of links) {
    link.from.out += link.value;
    link.to.in += link.value;
  }
  const placed = [...nodes.values()].filter(entry => entry.in || entry.out);
  const last = max(placed, entry => entry.depth) ?? 0;
  for (const entry of placed) if (!entry.out) entry.depth = last;
  if (!links.length || last === 0) return { width, height, marks: [] };

  const through = (entry: SankeyNode) => Math.max(entry.in, entry.out);
  const nameOf = (entry: SankeyNode) => entry.name;
  const figureOf = (entry: SankeyNode) => (block.showValues ? formatFigure(through(entry)) : "");
  const labelWidth = (entry: SankeyNode) =>
    textWidth(nameOf(entry), style, size) + (block.showValues ? 4 + textWidth(figureOf(entry), style, size, true) : 0);
  const columns = Array.from({ length: last + 1 }, (_, depth) => placed.filter(entry => entry.depth === depth));
  const leftGutter = Math.min(max(columns[0]!, labelWidth) ?? 0, width * 0.25) + 6;
  const rightGutter = Math.min(max(columns[last]!, labelWidth) ?? 0, width * 0.25) + 6;
  const step = (width - leftGutter - rightGutter - NODE_WIDTH) / last;
  const gap = Math.max(4, size * 0.7);
  const scale =
    min(columns, column => (height - gap * (column.length - 1)) / Math.max(1e-9, sum(column, through))) ?? 1;

  // Down each column: the first largest first, the rest under the middle of what flows into them.
  const center = (entry: SankeyNode) => entry.y + entry.h / 2;
  columns.forEach((column, depth) => {
    if (depth === 0) column.sort((a, b) => descending(through(a), through(b)));
    else {
      const pull = (entry: SankeyNode) => {
        const incoming = links.filter(link => link.to === entry);
        const weight = sum(incoming, link => link.value);
        return weight ? sum(incoming, link => center(link.from) * link.value) / weight : height / 2;
      };
      const pulls = new Map(column.map(entry => [entry, pull(entry)]));
      column.sort((a, b) => ascending(pulls.get(a), pulls.get(b)));
    }
    const used = sum(column, entry => Math.max(1, through(entry) * scale)) + gap * (column.length - 1);
    let y = Math.max(0, (height - used) / 2);
    for (const entry of column) {
      entry.x = leftGutter + depth * step;
      entry.y = y;
      entry.h = Math.max(1, through(entry) * scale);
      y += entry.h + gap;
    }
  });
  [...placed]
    .sort((a, b) => ascending(a.depth, b.depth) || ascending(a.y, b.y))
    .forEach((entry, index) => (entry.color = paletteColor(entry.name, index)));

  // Where each ribbon leaves and arrives: stacked down each node's side in the order of what is at the other end.
  for (const entry of placed) {
    let out = entry.y;
    for (const link of links
      .filter(link => link.from === entry)
      .sort((a, b) => ascending(center(a.to), center(b.to)))) {
      link.t = link.value * scale;
      link.sy = out;
      out += link.t;
    }
    let into = entry.y;
    for (const link of links
      .filter(link => link.to === entry)
      .sort((a, b) => ascending(center(a.from), center(b.from)))) {
      link.ty = into;
      into += link.value * scale;
    }
  }

  const marks: ChartMark[] = [];
  for (const link of [...links].sort((a, b) => descending(a.value, b.value))) {
    const x0 = link.from.x + NODE_WIDTH;
    const x1 = link.to.x;
    marks.push({
      kind: "shape",
      points: [...ribbonEdge(x0, link.sy, x1, link.ty), ...ribbonEdge(x1, link.ty + link.t, x0, link.sy + link.t)],
      fill: link.from.color,
      opacity: 0.35,
      tip: `${link.from.name} → ${link.to.name}: ${formatFigure(link.value)}`,
    });
  }
  for (const column of columns) {
    let clear = -Infinity;
    for (const entry of column) {
      marks.push({
        kind: "shape",
        points: [
          [entry.x, entry.y],
          [entry.x + NODE_WIDTH, entry.y],
          [entry.x + NODE_WIDTH, entry.y + entry.h],
          [entry.x, entry.y + entry.h],
        ],
        fill: entry.color,
        tip: `${entry.name}: ${formatFigure(through(entry))}`,
      });
      // A name that would overlap the one above it is left to the tooltip.
      const top = center(entry) - size * 0.5;
      if (top < clear) continue;
      clear = top + size * 1.2;
      const onLeft = entry.depth === 0;
      const room = onLeft ? leftGutter - 6 : entry.depth === last ? rightGutter - 6 : step - NODE_WIDTH - 12;
      const figure = figureOf(entry);
      const figureWidth = figure ? textWidth(figure, style, size, true) + 4 : 0;
      const name = fit(nameOf(entry), room - figureWidth, style, size);
      const total = textWidth(name, style, size) + figureWidth;
      const x = onLeft ? entry.x - 6 - total : entry.x + NODE_WIDTH + 6;
      marks.push({ kind: "text", x, y: top, text: name, size, color: style.textColor });
      if (figure)
        marks.push({
          kind: "text",
          x: x + total - figureWidth + 4,
          y: top,
          text: figure,
          size,
          bold: true,
          color: style.textColor,
        });
    }
  }

  return { width, height, marks };
}
