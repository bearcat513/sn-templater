import { describe, expect, it } from "vitest";
import { GALLERY } from "../gallery";
import { renderPdfDocument } from "../render";
import { starterTemplate } from "../template";
import { fixtureJob, pdfLayoutDigest, pdfText } from "./fixtures";

const summary = (result: ReturnType<typeof renderPdfDocument>) => ({
  pageCount: result.pageCount,
  unknownTokens: result.unknownTokens,
  problems: result.problems,
  layout: pdfLayoutDigest(result.bytes),
  text: pdfText(result.bytes),
});

describe("renderPdfDocument", () => {
  it("produces a well-formed PDF", () => {
    const result = renderPdfDocument(
      starterTemplate("document", [{ name: "number", label: "Number" }]),
      fixtureJob(starterTemplate("document", [{ name: "number", label: "Number" }])),
    );
    const text = Buffer.from(result.bytes).toString("latin1");
    expect(text.startsWith("%PDF-1.7")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
  });

  it("still makes a file when nothing matched", () => {
    const template = starterTemplate("document");
    const result = renderPdfDocument(template, { ...fixtureJob(template), records: [] });
    expect(result.pageCount).toBe(1);
    expect(pdfText(result.bytes)).toContain("No records matched.");
  });

  it("draws the cover, watermark and letterhead only where their conditions hold", () => {
    const template = {
      ...starterTemplate("document", [{ name: "number", label: "Number" }]),
      cover: [{ type: "heading" as const, text: "Batch of {{deck.count}}" }],
      coverWhen: { value: "{{deck.count}}", test: "greater" as const, to: "5" },
      header: {
        text: "LETTERHEAD {{record.number}}",
        when: { value: "{{record.number}}", test: "contains" as const, to: "1" },
      },
      watermark: { text: "DRAFT", when: { value: "{{record.number}}", test: "contains" as const, to: "2" } },
    };
    const job = fixtureJob(template);
    const text = pdfText(renderPdfDocument(template, job).bytes).join(" ");
    expect(text).not.toContain("Batch of");
    expect(text.match(/LETTERHEAD/g)?.length).toBe(1);
    expect(text.match(/DRAFT/g)?.length).toBe(1);
  });

  // Golden renders: each installed starter against fixture records. A change
  // to layout or text shows up here as a readable diff of what was drawn.
  it.each(GALLERY.map(entry => [entry.key, entry] as const))("renders the %s starter", (_key, entry) => {
    expect(summary(renderPdfDocument(entry.body, fixtureJob(entry.body)))).toMatchSnapshot();
  });
});
