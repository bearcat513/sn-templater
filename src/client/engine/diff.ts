/**
 * What changed between two versions of a template, in words.
 *
 * Not a line diff of JSON — a reader comparing versions wants to know that a
 * related list was added or the footer reworded, not which brace moved — so
 * blocks are matched as a whole, in order (a longest common subsequence of
 * their content), and the page-level settings are compared one by one.
 */
import { BLOCK_TYPES, blockStrings, type PdfBlock, type PdfTemplate } from "./template";

export type Change = { kind: "added" | "removed" | "changed"; what: string };

const label = (block: PdfBlock): string => {
  const type = BLOCK_TYPES.find(entry => entry.type === block.type)?.label ?? block.type;
  const words = blockStrings(block).find(text => text.trim());
  const sample = words
    ? ` “${words.trim().replace(/\s+/g, " ").slice(0, 40)}${words.trim().length > 40 ? "…" : ""}”`
    : "";
  return `${type}${sample}`;
};

/** Pairs of indexes of equal items, in order: the longest common subsequence. */
function common(a: string[], b: string[]): [number, number][] {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

/**
 * The blocks of one list against another: unchanged ones matched, and in the
 * gaps between them, blocks of the same type in the same place counted as
 * changed rather than as one removed and one added.
 */
function blockChanges(before: PdfBlock[], after: PdfBlock[], where: string): Change[] {
  const a = before.map(block => JSON.stringify(block));
  const b = after.map(block => JSON.stringify(block));
  const changes: Change[] = [];
  let i = 0;
  let j = 0;
  for (const [nextI, nextJ] of [...common(a, b), [a.length, b.length] as [number, number]]) {
    const removed = before.slice(i, nextI);
    const added = after.slice(j, nextJ);
    while (removed.length && added.length && removed[0]!.type === added[0]!.type) {
      changes.push({ kind: "changed", what: `${where}${label(added.shift()!)}` });
      removed.shift();
    }
    for (const block of removed) changes.push({ kind: "removed", what: `${where}${label(block)}` });
    for (const block of added) changes.push({ kind: "added", what: `${where}${label(block)}` });
    i = nextI + 1;
    j = nextJ + 1;
  }
  return changes;
}

const SETTINGS: [string, (template: PdfTemplate) => unknown][] = [
  ["Page size and margins", template => [template.page.size, template.page.landscape, template.page.margins]],
  [
    "Type and colours",
    template => [
      template.page.family,
      template.page.fontSize,
      template.page.textColor,
      template.page.mutedColor,
      template.page.accentColor,
      template.page.background,
    ],
  ],
  ["House style", template => template.style],
  ["Letterhead", template => template.header],
  ["Watermark", template => template.watermark],
  ["Footer", template => template.footer],
];

/** Everything that differs between `before` and `after`, in reading order. */
export function describeChanges(before: PdfTemplate, after: PdfTemplate): Change[] {
  const changes: Change[] = [];
  for (const [what, pick] of SETTINGS) {
    if (JSON.stringify(pick(before)) !== JSON.stringify(pick(after))) changes.push({ kind: "changed", what });
  }
  changes.push(...blockChanges(before.cover ?? [], after.cover ?? [], "Title page: "));
  changes.push(...blockChanges(before.blocks, after.blocks, ""));
  return changes;
}
