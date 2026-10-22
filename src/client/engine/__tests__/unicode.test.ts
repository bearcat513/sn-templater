import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { registerUnicodeFont, type UnicodeFace } from "../fonts";
import { TrueTypeFont } from "../fonts/truetype";
import { measureText, needsUnicode, textRuns } from "../pdfFonts";
import { renderPdfDocument } from "../render";
import { starterTemplate } from "../template";
import { fixtureJob } from "./fixtures";

const FONTS = join(__dirname, "../../assets/fonts");
const FILES: Record<UnicodeFace, string> = {
  regular: "NotoSans-Regular.ttf",
  bold: "NotoSans-Bold.ttf",
  italic: "NotoSans-Italic.ttf",
  boldItalic: "NotoSans-BoldItalic.ttf",
};
const read = (face: UnicodeFace) => new Uint8Array(readFileSync(join(FONTS, FILES[face])));

describe("needsUnicode", () => {
  it("is false for Latin-1 and the punctuation WinAnsi has", () => {
    expect(needsUnicode("Café — “quoted” · €5", { a: ["naïve"] })).toBe(false);
  });

  it("is false for characters with a spelled-out stand-in", () => {
    expect(needsUnicode("a → b ≥ c")).toBe(false);
  });

  it("finds Greek and Cyrillic anywhere in a structure", () => {
    expect(needsUnicode({ blocks: [{ text: "Ωmega" }] })).toBe(true);
    expect(needsUnicode(["ok", "Привет"])).toBe(true);
  });

  it("ignores picture data", () => {
    expect(needsUnicode("data:image/png;base64,Ω")).toBe(false);
  });
});

describe("TrueTypeFont", () => {
  const font = new TrueTypeFont(read("regular"));

  it("maps characters to glyphs and measures them", () => {
    expect(font.glyphFor("A".codePointAt(0)!)).toBeGreaterThan(0);
    expect(font.glyphFor("Ж".codePointAt(0)!)).toBeGreaterThan(0);
    expect(font.advance(font.glyphFor("M".codePointAt(0)!))).toBeGreaterThan(
      font.advance(font.glyphFor(".".codePointAt(0)!)),
    );
    expect(font.postScriptName).toBe("NotoSans-Regular");
  });

  it("subsets to a much smaller font that keeps a composite's parts", () => {
    const glyphs = [..."Ελλάδα"].map(char => font.glyphFor(char.codePointAt(0)!));
    const subset = font.subset(glyphs);
    expect(subset.length).toBeLessThan(font.bytes.length / 5);
    expect(new DataView(subset.buffer).getUint32(0)).toBe(0x00010000);
  });
});

describe("rendering text beyond WinAnsi", () => {
  beforeAll(() => {
    for (const face of Object.keys(FILES) as UnicodeFace[]) registerUnicodeFont(face, read(face));
  });

  it("splits text into runs by the font that sets it", () => {
    expect(textRuns("Hi Ωmega!", {}).map(run => [run.text, Boolean(run.font)])).toEqual([
      ["Hi ", false],
      ["Ω", true],
      ["mega!", false],
    ]);
  });

  it("measures embedded runs with the embedded font's widths", () => {
    expect(measureText("Ω", "helvetica", 10)).toBeGreaterThan(0);
  });

  it("embeds a subset with a ToUnicode map instead of printing question marks", () => {
    const template = starterTemplate("document", [{ name: "number", label: "Number" }]);
    template.blocks.push(
      { type: "heading", text: "Ελληνικά και кириллица" },
      { type: "text", text: "Zażółć gęślą jaźń" },
    );
    const result = renderPdfDocument(template, fixtureJob(template, 1));
    const text = Buffer.from(result.bytes).toString("latin1");
    expect(text).toContain("/Subtype /Type0");
    expect(text).toContain("/Encoding /Identity-H");
    expect(text).toContain("/FontFile2");
    expect(text).toContain("/ToUnicode");
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Bold /);
    // A sample for checking by hand, or with an outside PDF reader.
    if (process.env.TEMPLATER_PDF_OUT) writeFileSync(process.env.TEMPLATER_PDF_OUT, result.bytes);
  });
});
