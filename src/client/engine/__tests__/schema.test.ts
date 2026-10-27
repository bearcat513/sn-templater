import { describe, expect, it } from "vitest";
import {
  BLOCK_TYPES,
  CHART_KINDS,
  CHART_MEASURES,
  ELEMENT_TYPES,
  SHAPE_KINDS,
  TEMPLATE_BODY_VERSION,
  TRANSITIONS,
  checkChartBody,
  checkPresentationBody,
  checkTemplateBody,
  migrateTemplateBody,
} from "../../../server/shared/schema";
import { GALLERY } from "../gallery";
import { SHAPE_KINDS as CLIENT_SHAPES, TRANSITIONS as CLIENT_TRANSITIONS, readPresentation } from "../presentation";
import {
  BLOCK_TYPES as CLIENT_BLOCKS,
  CHART_KINDS as CLIENT_CHARTS,
  CHART_MEASURES as CLIENT_MEASURES,
  blankBlock,
} from "../template";
import { readTemplate, serializeTemplate } from "../validate";

const body = (blocks: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ page: {}, blocks, ...extra });

describe("the shared vocabulary", () => {
  it("names the same blocks, charts, measures, shapes and transitions as the reader", () => {
    expect([...BLOCK_TYPES].sort()).toEqual(CLIENT_BLOCKS.map(entry => entry.type).sort());
    expect([...CHART_KINDS].sort()).toEqual(CLIENT_CHARTS.map(entry => entry.kind).sort());
    expect([...CHART_MEASURES].sort()).toEqual(CLIENT_MEASURES.map(entry => entry.measure).sort());
    expect([...SHAPE_KINDS].sort()).toEqual(CLIENT_SHAPES.map(entry => entry.shape).sort());
    expect([...TRANSITIONS].sort()).toEqual(CLIENT_TRANSITIONS.map(entry => entry.transition).sort());
  });

  it("accepts a new block of every type, as the designer makes it", () => {
    for (const { type } of CLIENT_BLOCKS) {
      const check = checkTemplateBody(body([blankBlock(type, "document")]));
      expect(check.errors, type).toEqual([]);
    }
  });
});

describe("checkTemplateBody", () => {
  it("passes every starter, as written and as the reader stores it", () => {
    for (const starter of GALLERY) {
      expect(checkTemplateBody(starter.body).errors, starter.key).toEqual([]);
      expect(checkTemplateBody(serializeTemplate(starter.body)).errors, starter.key).toEqual([]);
    }
  });

  it("lets an empty body through: the designer starts it", () => {
    expect(checkTemplateBody("").ok).toBe(true);
    expect(checkTemplateBody(undefined).ok).toBe(true);
  });

  it("refuses what the reader could not use at all", () => {
    expect(checkTemplateBody("{nope").errors[0]).toMatch(/valid JSON/);
    expect(checkTemplateBody("[]").errors[0]).toMatch(/object/);
    expect(checkTemplateBody(body([])).errors[0]).toMatch(/at least one block/);
  });

  it("refuses a block type it does not know, where the reader would quietly drop it", () => {
    const check = checkTemplateBody(
      body([
        { type: "txet", text: "typo" },
        { type: "text", text: "ok" },
      ]),
    );
    expect(check.ok).toBe(false);
    expect(check.errors[0]).toMatch(/block 1.*"txet" is not a block type/);
  });

  it("refuses a repeat inside a repeat, and an unknown condition test", () => {
    const nested = checkTemplateBody(
      body([{ type: "repeat", table: "a", field: "b", blocks: [{ type: "repeat", blocks: [] }] }]),
    );
    expect(nested.errors.join()).toMatch(/cannot hold another repeat/);
    const test = checkTemplateBody(body([{ type: "text", text: "x", when: { value: "{{raw.x}}", test: "is" } }]));
    expect(test.errors.join()).toMatch(/"is" is not a condition test/);
  });

  it("checks condition groups and refuses them nested too deep", () => {
    const fine = { all: [{ value: "a", test: "empty" }, { any: [{ value: "b", test: "notEmpty" }] }] };
    expect(checkTemplateBody(body([{ type: "text", text: "x", when: fine }])).errors).toEqual([]);
    const deep = { all: [{ any: [{ all: [{ value: "a", test: "empty" }] }] }] };
    expect(checkTemplateBody(body([{ type: "text", text: "x", when: deep }])).errors.join()).toMatch(/two deep/);
  });

  it("warns, without refusing, about what the reader would change", () => {
    const check = checkTemplateBody(body([{ type: "image", source: "http://example.com/logo.gif" }]));
    expect(check.ok).toBe(true);
    expect(check.warnings.join()).toMatch(/PNG or JPEG/);
  });

  it("warns about a body from a newer version", () => {
    const check = checkTemplateBody(body([{ type: "text", text: "x" }], { version: TEMPLATE_BODY_VERSION + 1 }));
    expect(check.ok).toBe(true);
    expect(check.warnings.join()).toMatch(/reads up to/);
  });
});

describe("migrateTemplateBody", () => {
  it("stamps a version 1 body as the current version without changing what it says", () => {
    const old = { page: {}, blocks: [{ type: "text", text: "x" }] };
    expect(migrateTemplateBody(old)).toEqual({ ...old, version: 2 });
    expect(migrateTemplateBody({ ...old, version: 2 })).toEqual({ ...old, version: 2 });
  });

  it("is what the reader does on the way in", () => {
    const read = readTemplate(body([{ type: "text", text: "x" }]));
    expect(read.ok && read.value.version).toBe(TEMPLATE_BODY_VERSION);
  });
});

describe("checkChartBody", () => {
  it("refuses an unknown chart kind or measure", () => {
    expect(checkChartBody({ chart: "radar", groupBy: "state" }).ok).toBe(false);
    expect(checkChartBody({ chart: "pie", groupBy: "state", measure: "median" }).ok).toBe(false);
    expect(checkChartBody({ chart: "pie", groupBy: "state" }).ok).toBe(true);
  });
});

describe("checkPresentationBody", () => {
  it("passes what the reader writes, and refuses unknown elements and transitions", () => {
    const written = readPresentation({
      version: 1,
      slides: [{ id: "s1", elements: [{ type: "shape", shape: "star", id: "e", x: 0, y: 0, w: 10, h: 10 }] }],
      order: [{ key: "custom:s1" }],
    });
    expect(checkPresentationBody(JSON.stringify(written)).errors).toEqual([]);
    expect(checkPresentationBody({ slides: [{ id: "s", elements: [{ type: "video" }] }] }).ok).toBe(false);
    expect(checkPresentationBody({ slides: [], transition: "spin" }).ok).toBe(false);
    expect(ELEMENT_TYPES).toContain("chart");
  });
});
