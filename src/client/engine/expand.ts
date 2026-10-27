/**
 * Conditions and repeats, resolved before anything is drawn.
 *
 * A template's blocks can say when they are drawn (`when`) and can repeat
 * for each related record (`repeat`). Both renderers — the PDF and the
 * screen — draw plain blocks only, so this turns one record's blocks into
 * exactly the blocks to draw for it: blocks whose condition fails are left
 * out, and each repeat becomes its blocks once per row, with the row's
 * tokens already filled in.
 *
 * The output has no conditions and no repeats in it, so expanding twice is
 * the same as expanding once.
 */
import type { RelatedRows } from "./render";
import {
  relatedKey,
  repeatRelatedList,
  type BlockCondition,
  type Condition,
  type PdfBlock,
  type RepeatBlock,
} from "./template";
import { fillTokens } from "./tokens";

/** Most blocks one repeat can turn into, whatever its rows and blocks: past this the rest is left out. */
const MAX_EXPANDED = 2_000;

const normal = (text: string) => text.trim().toLocaleLowerCase();

const number = (text: string): number | null => {
  const cleaned = text.replace(/[\s,]/g, "");
  return cleaned && Number.isFinite(Number(cleaned)) ? Number(cleaned) : null;
};

/**
 * Whether a condition holds, its value and comparison filled from these
 * values. A group holds when all (or any) of its conditions do; an empty
 * group holds, as no condition at all would.
 */
export function holds(condition: Condition, values: Record<string, string>): boolean {
  if ("all" in condition) return condition.all.every(entry => holds(entry, values));
  if ("any" in condition) return !condition.any.length || condition.any.some(entry => holds(entry, values));
  return compares(condition, values);
}

function compares(condition: BlockCondition, values: Record<string, string>): boolean {
  const value = normal(fillTokens(condition.value, values));
  const to = normal(fillTokens(condition.to ?? "", values));
  switch (condition.test) {
    case "empty":
      return value === "";
    case "notEmpty":
      return value !== "";
    case "equals":
      return value === to;
    case "notEquals":
      return value !== to;
    case "contains":
      return to === "" || value.includes(to);
    case "greater":
    case "less": {
      const left = number(value);
      const right = number(to);
      if (left === null || right === null) return false;
      return condition.test === "greater" ? left > right : left < right;
    }
  }
}

/**
 * Every string in a block, changed. The block's shape is kept; a picture's
 * `data:` URL is left alone, being neither text nor short.
 */
function mapStrings<T>(value: T, change: (text: string) => string): T {
  if (typeof value === "string") return (value.startsWith("data:") ? value : change(value)) as T;
  if (Array.isArray(value)) return value.map(item => mapStrings(item, change)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, change)])) as T;
  }
  return value;
}

/**
 * A row's own values, as the repeat's blocks name them. A value that looks
 * like a token is broken with an invisible space, so a record whose text
 * says `{{user.email}}` prints that, rather than the reader's address.
 */
function rowValues(row: Record<string, string>, index: number, count: number): Record<string, string> {
  const safe = (text: string) => text.replace(/\{\{/g, "{​{");
  const values: Record<string, string> = { "row.index": String(index + 1), "row.count": String(count) };
  for (const [key, value] of Object.entries(row)) {
    values[key.startsWith("raw.") ? `row.raw.${key.slice(4)}` : `row.${key}`] = safe(value);
  }
  return values;
}

function expandRepeat(
  block: RepeatBlock,
  values: Record<string, string>,
  related: Record<string, RelatedRows>,
): PdfBlock[] {
  const fetched = related[relatedKey(repeatRelatedList(block))]?.rows ?? [];
  // The filter sees each row as it was fetched; the rows it keeps are numbered among themselves.
  const rows = block.where
    ? fetched.filter((row, index) => holds(block.where!, { ...values, ...rowValues(row, index, fetched.length) }))
    : fetched;
  if (!rows.length) return block.emptyText ? [{ type: "text", text: block.emptyText }] : [];
  const out: PdfBlock[] = [];
  rows.forEach((row, index) => {
    if (out.length >= MAX_EXPANDED) return;
    const own = rowValues(row, index, rows.length);
    const filled = block.blocks.map(child =>
      mapStrings(child, text => fillTokens(text, own, undefined, { keepUnknown: true })),
    );
    // Row tokens are filled; the record's are left for the renderer, and conditions see both.
    out.push(...expandBlocks(filled, { ...values, ...own }, related));
  });
  return out.slice(0, MAX_EXPANDED);
}

/** The blocks to draw for one record: conditions applied, repeats unrolled. */
export function expandBlocks(
  blocks: PdfBlock[],
  values: Record<string, string>,
  related: Record<string, RelatedRows>,
): PdfBlock[] {
  if (!blocks.some(block => block.when || block.type === "repeat")) return blocks;
  const out: PdfBlock[] = [];
  for (const block of blocks) {
    if (block.when && !holds(block.when, values)) continue;
    if (block.type === "repeat") {
      out.push(...expandRepeat(block, values, related));
      continue;
    }
    if (block.when) {
      const { when: _when, ...plain } = block;
      out.push(plain as PdfBlock);
    } else out.push(block);
  }
  return out;
}
