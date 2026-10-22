import { describe, expect, it } from "vitest";
import { describeChanges } from "../diff";
import { starterTemplate, type PdfTemplate } from "../template";

const base = (): PdfTemplate => starterTemplate("document", [{ name: "number", label: "Number" }]);

describe("describeChanges", () => {
  it("finds nothing between a template and itself", () => {
    expect(describeChanges(base(), base())).toEqual([]);
  });

  it("names an added block and keeps the rest matched", () => {
    const after = base();
    after.blocks.splice(1, 0, { type: "callout", tone: "warning", title: "Heads up", text: "x" });
    expect(describeChanges(base(), after)).toEqual([{ kind: "added", what: "Callout “Heads up”" }]);
  });

  it("calls a reworded block of the same type changed, not removed and added", () => {
    const after = base();
    after.blocks[0] = { type: "heading", text: "A new title" };
    expect(describeChanges(base(), after)).toEqual([{ kind: "changed", what: "Heading “A new title”" }]);
  });

  it("reports removed blocks and page settings", () => {
    const after = base();
    after.blocks.pop();
    after.footer = { ...after.footer, text: "changed" };
    expect(describeChanges(base(), after)).toEqual([
      { kind: "changed", what: "Footer" },
      { kind: "removed", what: "Field list “Number”" },
    ]);
  });
});
