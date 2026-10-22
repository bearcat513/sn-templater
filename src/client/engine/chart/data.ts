/** Charts' figures: where they come from, how they are counted, ordered and folded. */
import { ascending, descending, rollup, sum } from "d3";
import type { RelatedRows } from "../render";
import {
  chartRelatedList,
  chartShape,
  relatedKey,
  type ChartBlock,
  type ChartKind,
  type ChartTemplate,
} from "../template";

/* --------------------------------- palette ------------------------------- */

/**
 * The categorical order, validated for colour-blind separation between
 * neighbours. The order is the safety mechanism: slices take these in turn,
 * never cycled — a ninth category is folded into "Other" instead.
 */
export const CHART_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

/** "Other" is not a category of its own, so it does not take a hue. */
export const OTHER_COLOR = "#a1a1aa";

export const GRID_COLOR = "#e4e4e7";
export const AXIS_COLOR = "#a1a1aa";

/* ---------------------------------- data --------------------------------- */

export type ChartDatum = {
  label: string;
  value: number;
  color?: string;
  /** A pair's second label: the stack, the column, or where a flow goes. */
  to?: string;
  /** A span's start and end, for a Gantt chart. The value is its length in days. */
  start?: number;
  end?: number;
};

export type ChartData = {
  points: ChartDatum[];
  /** For `{{list.count}}` in the title: how many related records matched. */
  count?: number;
  /** A sentence under the chart when it shows less than everything. */
  note?: string;
  /** Why the related rows could not be read, when they could not. */
  error?: string;
};

/** What a chart looks like, whichever of a block or a chart template says so. */
export type ChartLook = Pick<ChartBlock, "chart" | "height" | "color" | "showValues">;

/**
 * A chart template, read and counted: what the renderers are handed, keyed
 * by the template's sys_id, on the render job (see ./render.ts).
 */
export type LoadedChart = {
  sysId: string;
  name: string;
  /** The table counted. */
  table: string;
  spec: ChartTemplate;
  /** Already in order and folded, as the template's look wants them. */
  points: ChartDatum[];
  /** Records counted. */
  total: number;
  note?: string;
  /** Why it could not be read or counted, when it could not. */
  error?: string;
};

/** Most bars or columns drawn; the rest fold into "Other". */
export const MAX_BARS = 24;
/** Most slices; the eighth hue is the last, so a ninth category is "Other". */
export const MAX_SLICES = CHART_PALETTE.length;
export const MAX_LINE_POINTS = 60;
/** Most bars on a Gantt chart: one row each, and past this the rows are too thin to name. */
export const MAX_SPANS = 40;
/** Most rows and columns of a heatmap. */
export const MAX_HEAT_ROWS = 20;
export const MAX_HEAT_COLUMNS = 16;
/** Most nodes on either side of a two-sided Sankey diagram, and most flows of any other. */
export const MAX_SANKEY_NODES = 12;
export const MAX_SANKEY_LINKS = 60;

export const DAY = 86_400_000;

/** Line and area read left to right in their own order, rather than largest first. */
export const sequential = (kind: ChartKind) => kind === "line" || kind === "area";

/**
 * A filled-in value as a number: `1,234`, `42%`, `$9.50` and ` 7 ` all read;
 * an empty field, a date or a word does not, and its figure is left out.
 */
export function readFigure(text: string): number | null {
  const cleaned = text
    .replace(/[\s,]/g, "")
    .replace(/^[^\d+\-.]+/, "")
    .replace(/%$/, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * A filled-in date as milliseconds: a stored value — `2026-10-19`,
 * `2026-10-19 14:30:00`, read as UTC as the instance stores it — or anything
 * else the browser reads as a date. An empty field or a word is not one.
 */
export function readDate(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const stored = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(trimmed);
  if (stored) {
    const [, y, mo, d, h = "0", mi = "0", sec = "0"] = stored;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A span's start and end, read: no start is no span, and no end — or one before it — is a milestone. */
export function spanPoints(spans: { label: string; start: string; end: string }[]): ChartDatum[] {
  return spans
    .flatMap((span): ChartDatum[] => {
      const start = readDate(span.start);
      if (start === null) return [];
      const end = Math.max(start, readDate(span.end) ?? start);
      return [{ label: span.label, value: (end - start) / DAY, start, end }];
    })
    .sort((a, b) => ascending(a.start, b.start) || ascending(a.end, b.end));
}

/** Records counted by one field, or by two into pairs, in the order each first appears. */
export function countRows(rows: Record<string, string>[], field: string, thenBy?: string): ChartDatum[] {
  const counted = new Map<string, ChartDatum>();
  for (const row of rows) {
    const label = row[field]?.trim() || "(empty)";
    const to = thenBy ? row[thenBy]?.trim() || "(empty)" : undefined;
    const key = JSON.stringify([label, to]);
    const point = counted.get(key);
    if (point) point.value++;
    else counted.set(key, { label, ...(to !== undefined ? { to } : {}), value: 1 });
  }
  return [...counted.values()];
}

/** Pairs largest first: the labels by their totals, and within a label its second labels by theirs. */
export function orderPairs(points: ChartDatum[]): ChartDatum[] {
  const totals = rollup(
    points,
    group => sum(group, point => Math.abs(point.value)),
    point => point.label,
  );
  const toTotals = rollup(
    points,
    group => sum(group, point => Math.abs(point.value)),
    point => point.to,
  );
  return [...points].sort(
    (a, b) =>
      descending(totals.get(a.label), totals.get(b.label)) ||
      ascending(a.label, b.label) ||
      descending(toTotals.get(a.to), toTotals.get(b.to)) ||
      ascending(a.to, b.to),
  );
}

/**
 * The figures a chart block draws for one record: its own items, filled and
 * read as numbers, or its related rows counted by the grouping field.
 */
export function chartData(
  block: ChartBlock,
  fill: (text: string) => string,
  related: Record<string, RelatedRows>,
  charts: Record<string, LoadedChart> = {},
): ChartData {
  if (block.template) {
    // Not loaded yet, or not there at all: nothing to draw, and the loader has said why.
    const loaded = charts[block.template];
    if (!loaded) return { points: [] };
    return {
      points: loaded.points,
      count: loaded.total,
      ...(loaded.note ? { note: loaded.note } : {}),
      ...(loaded.error ? { error: loaded.error } : {}),
    };
  }

  const shape = chartShape(block.chart);

  if (block.related?.groupBy) {
    const source = block.related;
    const data = related[relatedKey(chartRelatedList(source))];
    const rows = data?.rows ?? [];
    const total = data?.total ?? rows.length;
    let points: ChartDatum[];
    if (shape === "spans") {
      points = source.start
        ? spanPoints(
            rows.map(row => ({
              label: row[source.groupBy]?.trim() || "(empty)",
              start: row[`raw.${source.start}`] ?? "",
              end: source.end ? (row[`raw.${source.end}`] ?? "") : "",
            })),
          )
        : [];
    } else if (shape === "pairs") {
      points = orderPairs(countRows(rows, source.groupBy, source.thenBy || undefined));
    } else {
      // Categories by size, except along a line, which reads left to right in their own order.
      points = countRows(rows, source.groupBy).sort(
        sequential(block.chart)
          ? (a, b) => ascending(a.label, b.label)
          : (a, b) => descending(a.value, b.value) || ascending(a.label, b.label),
      );
    }
    return {
      points: fold(block, points),
      count: total,
      ...(total > rows.length ? { note: `Counted from the first ${rows.length} of ${total} records.` } : {}),
      ...(data?.error ? { error: data.error } : {}),
    };
  }

  if (shape === "spans") {
    const spans = block.items.map(item => ({
      label: fill(item.label).trim(),
      start: fill(item.start ?? ""),
      end: fill(item.end ?? ""),
    }));
    return { points: fold(block, spanPoints(spans)) };
  }

  const points = block.items
    .map(item => ({
      label: fill(item.label).trim(),
      value: readFigure(fill(item.value)),
      ...(shape === "pairs" ? { to: fill(item.to ?? "").trim() } : {}),
    }))
    .filter((item): item is ChartDatum => item.value !== null && (shape !== "pairs" || Boolean(item.to)));
  return { points: fold(block, points) };
}

/**
 * What a chart block draws as: its own look and words, or — placed from a
 * chart template — the template's, at the block's height and under the
 * block's own title when it has one.
 */
export function resolveChart(
  block: ChartBlock,
  charts: Record<string, LoadedChart> = {},
): { look: ChartLook; title?: string; emptyText?: string } {
  const spec = block.template ? charts[block.template]?.spec : undefined;
  if (!spec) return { look: block, title: block.title, emptyText: block.emptyText };
  return { look: { ...spec, height: block.height }, title: block.title || spec.title, emptyText: spec.emptyText };
}

/**
 * A chart template's groups — label and measure, in the order the instance
 * gave them, which is the grouping field's own — as the chart draws them.
 */
export function chartPoints(spec: ChartTemplate, groups: ChartDatum[]): ChartDatum[] {
  const shape = chartShape(spec.chart);
  const ordered =
    shape === "spans"
      ? [...groups].sort((a, b) => ascending(a.start, b.start) || ascending(a.end, b.end))
      : spec.order === "field"
        ? groups
        : shape === "pairs"
          ? orderPairs(groups)
          : [...groups].sort((a, b) => descending(a.value, b.value) || ascending(a.label, b.label));
  return fold(spec, ordered);
}

/**
 * A chart template's counted figures, drawn as another kind of the same
 * shape: kept in the order they came and folded again for what the new kind
 * can show — a column chart's twenty bars become a pie's eight slices.
 */
export function redrawAs(spec: ChartTemplate, chart: ChartKind, points: ChartDatum[]): ChartDatum[] {
  if (chart === spec.chart || chartShape(chart) !== chartShape(spec.chart)) return points;
  return chartPoints({ ...spec, chart, order: "field" }, points);
}

/** Past what the chart can show, the smallest figures become one "Other", or a line is cut short. */
export function fold(block: ChartLook, points: ChartDatum[]): ChartDatum[] {
  switch (chartShape(block.chart)) {
    case "spans":
      return points.slice(0, MAX_SPANS);
    case "pairs":
      return foldPairs(block.chart, points);
  }
  if (sequential(block.chart)) return points.slice(0, MAX_LINE_POINTS);
  const round = block.chart === "pie" || block.chart === "donut";
  // A pie of negative slices means nothing, so only what is above zero is a slice.
  const usable = round || block.chart === "funnel" ? points.filter(point => point.value > 0) : points;
  const limit = round ? MAX_SLICES : MAX_BARS;
  if (usable.length <= limit) return usable;
  // An "Other" folded already, for a chart drawn as another kind, is folded again rather than kept beside a new one.
  const kept = usable
    .filter(point => point.color !== OTHER_COLOR)
    .sort((a, b) => descending(Math.abs(a.value), Math.abs(b.value)))
    .slice(0, limit - 1);
  const rest = usable.filter(point => !kept.includes(point));
  const other: ChartDatum = {
    label: "Other",
    value: rest.reduce((sum, point) => sum + point.value, 0),
    color: OTHER_COLOR,
  };
  return [...usable.filter(point => kept.includes(point)), other];
}

/**
 * Pairs folded on each side: past so many columns, stacks, rows or nodes, the
 * smallest by their totals become "Other", and pairs that then name the same
 * two are one. Stacks and flows are parts of a whole, so only what is above
 * zero is one; a flow from a node to itself goes nowhere.
 */
export function foldPairs(kind: ChartKind, points: ChartDatum[]): ChartDatum[] {
  const paired = points.filter(point => point.to !== undefined);
  if (kind === "heatmap") return foldSide(foldSide(paired, "label", MAX_HEAT_ROWS), "to", MAX_HEAT_COLUMNS);
  const positive = paired.filter(point => point.value > 0 && (kind !== "sankey" || point.label !== point.to));
  if (kind === "stacked") return foldSide(foldSide(positive, "label", MAX_BARS), "to", MAX_SLICES);
  // A flow through several stages is not folded — an "Other" on both sides would flow into itself — but cut to its largest.
  const sources = new Set(positive.map(point => point.label));
  if (positive.some(point => sources.has(point.to!))) {
    const kept = new Set([...positive].sort((a, b) => descending(a.value, b.value)).slice(0, MAX_SANKEY_LINKS));
    return positive.filter(point => kept.has(point));
  }
  return foldSide(foldSide(positive, "label", MAX_SANKEY_NODES), "to", MAX_SANKEY_NODES);
}

export function foldSide(points: ChartDatum[], side: "label" | "to", limit: number): ChartDatum[] {
  const totals = rollup(
    points,
    group => sum(group, point => Math.abs(point.value)),
    point => point[side] ?? "",
  );
  if (totals.size <= limit) return points;
  const kept = new Set(
    [...totals]
      .sort((a, b) => descending(a[1], b[1]))
      .slice(0, limit - 1)
      .map(([name]) => name),
  );
  const merged = new Map<string, ChartDatum>();
  for (const point of points) {
    const folded = kept.has(point[side] ?? "") ? point : { ...point, [side]: "Other" };
    const key = JSON.stringify([folded.label, folded.to]);
    const earlier = merged.get(key);
    if (earlier) merged.set(key, { ...earlier, value: earlier.value + folded.value });
    else merged.set(key, folded);
  }
  // "Other" goes last, wherever its first member was.
  const named = [...merged.values()];
  return [...named.filter(point => point[side] !== "Other"), ...named.filter(point => point[side] === "Other")];
}
