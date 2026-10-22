import { describe, expect, it } from "vitest";
import { readChartTemplate, readTemplate, serializeTemplate } from "../validate";

const body = (blocks: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ page: {}, blocks, ...extra });

describe("readTemplate", () => {
  it("treats an empty body as a brand-new template", () => {
    const read = readTemplate("", "deck", [{ name: "number", label: "Number" }]);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.page.size).toBe("Slide16x9");
  });

  it("refuses invalid JSON, non-objects and bodies with no blocks", () => {
    expect(readTemplate("{nope").ok).toBe(false);
    expect(readTemplate("[]").ok).toBe(false);
    expect(readTemplate(body([])).ok).toBe(false);
  });

  it("drops blocks it does not recognise rather than refusing the template", () => {
    const read = readTemplate(body([{ type: "hologram" }, { type: "text", text: "kept" }]));
    expect(read.ok && read.value.blocks).toEqual([{ type: "text", text: "kept" }]);
  });

  it("clamps numbers and rejects bad colours", () => {
    const read = readTemplate(
      body([{ type: "heading", text: "H", size: 9999, color: "red" }], { page: { fontSize: 1, textColor: "#ABC" } }),
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.blocks[0]).toEqual({ type: "heading", text: "H", size: 96 });
    expect(read.value.page.fontSize).toBe(6);
    expect(read.value.page.textColor).toBe("#ABC");
  });

  it("strips anything but identifier characters from table and field names", () => {
    const read = readTemplate(body([{ type: "relatedList", table: "task_sla; drop", field: "task", columns: [] }]));
    expect(read.ok && read.value.blocks[0]).toMatchObject({ table: "task_sladrop", field: "task" });
  });

  it("keeps a table block's rows as wide as its header", () => {
    const read = readTemplate(
      body([{ type: "table", columns: [{ header: "A" }, { header: "B" }], rows: [["1"], ["1", "2", "3"]] }]),
    );
    expect(read.ok && read.value.blocks[0]).toMatchObject({
      rows: [
        ["1", ""],
        ["1", "2"],
      ],
    });
  });

  it("drops a picture that is not an embeddable data: URL", () => {
    const read = readTemplate(body([{ type: "image", source: "https://example.com/x.png", width: 100 }]));
    expect(read.ok && read.value.blocks[0]).toMatchObject({ source: "" });
  });

  it("serializes to a stable, canonical form", () => {
    const read = readTemplate(body([{ type: "text", text: "x" }]));
    if (!read.ok) throw new Error(read.error);
    const once = serializeTemplate(read.value);
    const twice = serializeTemplate(JSON.parse(once));
    expect(twice).toBe(once);
  });
});

describe("readChartTemplate", () => {
  it("measures by count when there is no field to sum", () => {
    const read = readChartTemplate(JSON.stringify({ chart: "bar", groupBy: "state", measure: "sum" }));
    expect(read.ok && read.value).toMatchObject({ chart: "bar", groupBy: "state", measure: "count" });
  });

  it("falls back to a column chart for an unknown kind", () => {
    const read = readChartTemplate(JSON.stringify({ chart: "radar", groupBy: "state" }));
    expect(read.ok && read.value.chart).toBe("column");
  });
});
