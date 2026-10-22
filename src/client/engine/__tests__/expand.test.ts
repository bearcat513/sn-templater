import { describe, expect, it } from "vitest";
import { expandBlocks, holds } from "../expand";
import { relatedBlocks, relatedKey, repeatRelatedList, rowFields, type PdfBlock, type RepeatBlock } from "../template";
import { readTemplate } from "../validate";

describe("holds", () => {
  const values = { "raw.priority": "1", "record.assigned_to": "", "record.state": "In Progress" };

  it.each([
    [{ value: "{{raw.priority}}", test: "equals", to: "1" }, true],
    [{ value: "{{raw.priority}}", test: "notEquals", to: "1" }, false],
    [{ value: "{{record.assigned_to}}", test: "empty" }, true],
    [{ value: "{{record.assigned_to}}", test: "notEmpty" }, false],
    [{ value: "{{record.state}}", test: "contains", to: "progress" }, true],
    [{ value: "{{raw.priority}}", test: "less", to: "3" }, true],
    [{ value: "{{raw.priority}}", test: "greater", to: "3" }, false],
    [{ value: "{{record.state}}", test: "greater", to: "3" }, false],
  ] as const)("%j is %s", (condition, expected) => {
    expect(holds(condition, values)).toBe(expected);
  });
});

const repeat: RepeatBlock = {
  type: "repeat",
  table: "incident_task",
  field: "incident",
  blocks: [
    { type: "heading", text: "{{row.index}}/{{row.count}} {{row.number}} for {{record.number}}" },
    { type: "text", text: "Unassigned", when: { value: "{{row.assigned_to}}", test: "empty" } },
  ],
  emptyText: "No tasks.",
};

const related = (rows: Record<string, string>[]) => ({
  [relatedKey(repeatRelatedList(repeat))]: { rows, total: rows.length },
});

describe("expandBlocks", () => {
  it("leaves blocks without conditions or repeats as they are", () => {
    const blocks: PdfBlock[] = [{ type: "text", text: "x" }];
    expect(expandBlocks(blocks, {}, {})).toBe(blocks);
  });

  it("drops a block whose condition fails and strips the condition from the rest", () => {
    const blocks: PdfBlock[] = [
      { type: "text", text: "a", when: { value: "{{x}}", test: "equals", to: "1" } },
      { type: "text", text: "b", when: { value: "{{x}}", test: "equals", to: "2" } },
    ];
    expect(expandBlocks(blocks, { x: "1" }, {})).toEqual([{ type: "text", text: "a" }]);
  });

  it("draws a repeat's blocks once per row, filling the row's tokens and leaving the record's", () => {
    const out = expandBlocks(
      [repeat],
      {},
      related([
        { number: "TASK1", assigned_to: "Ann" },
        { number: "TASK2", assigned_to: "" },
      ]),
    );
    expect(out).toEqual([
      { type: "heading", text: "1/2 TASK1 for {{record.number}}" },
      { type: "heading", text: "2/2 TASK2 for {{record.number}}" },
      { type: "text", text: "Unassigned" },
    ]);
  });

  it("prints the empty text when there are no rows", () => {
    expect(expandBlocks([repeat], {}, related([]))).toEqual([{ type: "text", text: "No tasks." }]);
  });

  it("does not let a row's text become a token", () => {
    const [heading] = expandBlocks([repeat], {}, related([{ number: "{{user.email}}", assigned_to: "x" }]));
    expect(heading).toEqual({ type: "heading", text: "1/1 {​{user.email}} for {{record.number}}" });
  });

  it("is the same expanded twice", () => {
    const once = expandBlocks([repeat], {}, related([{ number: "T", assigned_to: "" }]));
    expect(expandBlocks(once, {}, {})).toEqual(once);
  });
});

describe("repeats in a template", () => {
  it("fetches the row fields its blocks use, as a related list", () => {
    expect(rowFields(repeat)).toEqual(["assigned_to", "number"]);
    const template = { page: {}, blocks: [repeat], footer: { text: "", showPageNumbers: false } };
    const read = readTemplate(JSON.stringify(template));
    if (!read.ok) throw new Error(read.error);
    expect(relatedBlocks(read.value).map(block => [block.table, block.field])).toEqual([["incident_task", "incident"]]);
  });

  it("keeps conditions and repeats through the validator, but not a repeat inside a repeat", () => {
    const nested = { ...repeat, blocks: [...repeat.blocks, { ...repeat }] };
    const read = readTemplate(
      JSON.stringify({
        page: {},
        blocks: [nested, { type: "text", text: "x", when: { value: "{{a}}", test: "bogus" } }],
      }),
    );
    if (!read.ok) throw new Error(read.error);
    const [kept, text] = read.value.blocks;
    expect(kept?.type === "repeat" && kept.blocks.map(block => block.type)).toEqual(["heading", "text"]);
    expect(text?.when).toEqual({ value: "{{a}}", test: "notEmpty" });
  });
});
