/** The gantt chart's layout. */
import { max, min, scaleUtc, utcFormat } from "d3";
import { AXIS_COLOR, CHART_PALETTE, type ChartDatum, type ChartLook, DAY, GRID_COLOR } from "./data";
import {
  BAR_RADIUS,
  type ChartMark,
  type ChartScene,
  type ChartStyle,
  fit,
  labelSize,
  roundedBox,
  textWidth,
} from "./shared";

/* ---------------------------------- gantt -------------------------------- */

export const spanDate = utcFormat("%b %-d, %Y");

/** Dates along the top in one form throughout, as fine as the chart's length needs. */
export function spanTicks(days: number): (date: Date) => string {
  if (days <= 3) return utcFormat("%b %-d %H:%M");
  if (days <= 180) return utcFormat("%b %-d");
  if (days <= 365 * 3) return utcFormat("%b %Y");
  return utcFormat("%Y");
}

/** How long a span is, in the unit that reads best: hours, days or weeks. */
export function formatSpan(start: number, end: number): string {
  const days = (end - start) / DAY;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 14) return `${Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
}

/**
 * A row for each span, earliest first: its name down the left, a bar from its
 * start to its end against dates across the top, and a diamond for one with
 * no length. A hairline marks today when today is on the chart.
 */
export function layoutGantt(
  block: ChartLook,
  points: ChartDatum[],
  width: number,
  height: number,
  style: ChartStyle,
): ChartScene {
  const size = labelSize(style);
  const spans = points.filter(point => point.start !== undefined);
  let low = min(spans, point => point.start!) ?? 0;
  let high = max(spans, point => point.end ?? point.start!) ?? 0;
  if (high - low < DAY) {
    low -= DAY / 2;
    high += DAY / 2;
  }
  const gutter = Math.min(max(spans, point => textWidth(point.label, style, size)) ?? 0, width * 0.3) + 10;
  const durations = spans.map(point =>
    point.end! > point.start! ? formatSpan(point.start!, point.end!) : spanDate(new Date(point.start!)),
  );
  const after = block.showValues ? (max(durations, label => textWidth(label, style, size, true)) ?? 0) + 6 : 0;
  const x = scaleUtc()
    .domain([low, high])
    .range([gutter + 4, width - 4 - after])
    .nice();
  const header = size * 1.8;
  const band = Math.min(28, Math.max(size * 1.5, (height - header) / Math.max(1, spans.length)));
  const thickness = Math.min(16, band * 0.62);
  const plotBottom = header + spans.length * band;
  const color = block.color ?? CHART_PALETTE[0]!;
  const marks: ChartMark[] = [];

  // Dates across the top, as many as fit side by side.
  const ticks = x.ticks(Math.max(2, Math.floor((width - gutter) / 90)));
  const tickLabel = spanTicks((high - low) / DAY);
  for (const tick of ticks) {
    const at = x(tick);
    const label = tickLabel(tick);
    const labelWidth = textWidth(label, style, size);
    marks.push(
      { kind: "rule", x1: at, y1: header - 2, x2: at, y2: plotBottom, color: GRID_COLOR, width: 0.5 },
      {
        kind: "text",
        x: Math.min(Math.max(at - labelWidth / 2, gutter), width - labelWidth),
        y: size * 0.3,
        text: label,
        size,
        color: style.mutedColor,
      },
    );
  }
  marks.push({ kind: "rule", x1: gutter, y1: header - 2, x2: width, y2: header - 2, color: AXIS_COLOR, width: 0.75 });

  spans.forEach((point, index) => {
    const top = header + index * band;
    const middle = top + band / 2;
    const x0 = x(point.start!);
    const x1 = x(point.end ?? point.start!);
    const fill = point.color ?? color;
    const when =
      point.end! > point.start!
        ? `${spanDate(new Date(point.start!))} – ${spanDate(new Date(point.end!))} (${formatSpan(point.start!, point.end!)})`
        : spanDate(new Date(point.start!));
    if (point.end! <= point.start!) {
      const r = thickness / 2;
      marks.push({
        kind: "shape",
        points: [
          [x0, middle - r],
          [x0 + r, middle],
          [x0, middle + r],
          [x0 - r, middle],
        ],
        fill,
        tip: `${point.label}: ${when}`,
      });
    } else {
      // However short, a span is a bar: at least wide enough to be seen as one.
      const w = Math.max(4, x1 - x0);
      marks.push({
        kind: "shape",
        points: roundedBox(x0, middle - thickness / 2, w, thickness, BAR_RADIUS),
        fill,
        tip: `${point.label}: ${when}`,
      });
    }
    const name = fit(point.label, gutter - 10, style, size);
    marks.push({ kind: "text", x: 0, y: middle - size * 0.5, text: name, size, color: style.textColor });
    if (block.showValues) {
      marks.push({
        kind: "text",
        x: (point.end! > point.start! ? Math.max(x1, x0 + 4) : x0 + thickness / 2) + 6,
        y: middle - size * 0.5,
        text: durations[index]!,
        size,
        bold: true,
        color: style.textColor,
      });
    }
  });

  let bottom = plotBottom;
  const now = Date.now();
  const [first, final] = x.domain().map(Number) as [number, number];
  if (now >= first && now <= final) {
    const at = x(now);
    const label = "Today";
    marks.push(
      { kind: "rule", x1: at, y1: header - 2, x2: at, y2: plotBottom, color: CHART_PALETTE[7]!, width: 1 },
      {
        kind: "text",
        x: Math.min(
          Math.max(at - textWidth(label, style, size, true) / 2, gutter),
          width - textWidth(label, style, size, true),
        ),
        y: plotBottom + 3,
        text: label,
        size,
        bold: true,
        color: CHART_PALETTE[7]!,
      },
    );
    bottom += size * 1.5 + 3;
  }

  return { width, height: bottom, marks };
}
