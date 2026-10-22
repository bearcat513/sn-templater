import { describe, expect, it } from "vitest";
import { documentFileName, fillTokens, tokensIn } from "../tokens";

describe("fillTokens", () => {
  it("substitutes known tokens, tolerating spaces inside the braces", () => {
    expect(
      fillTokens("{{ record.number }} - {{record.state}}", { "record.number": "INC1", "record.state": "New" }),
    ).toBe("INC1 - New");
  });

  it("renders unknown tokens blank and reports them", () => {
    const unknown = new Set<string>();
    expect(fillTokens("a{{record.nope}}b", {}, unknown)).toBe("ab");
    expect([...unknown]).toEqual(["record.nope"]);
  });

  it("never reads a value as a replacement pattern", () => {
    expect(fillTokens("{{record.x}}", { "record.x": "$& costs $1" })).toBe("$& costs $1");
  });

  it("does not evaluate anything: a token in a value stays text", () => {
    expect(fillTokens("{{record.x}}", { "record.x": "{{user.name}}", "user.name": "Ann" })).toBe("{{user.name}}");
  });
});

describe("tokensIn", () => {
  it("lists each token once, in order of first appearance", () => {
    expect(tokensIn("{{b}} {{a}} {{b}} {{record.caller_id.email}}")).toEqual(["b", "a", "record.caller_id.email"]);
  });

  it("ignores things that are not tokens", () => {
    expect(tokensIn("{{}} {{1abc}} {single}")).toEqual([]);
  });
});

describe("documentFileName", () => {
  it("slugs a name into a .pdf file name", () => {
    expect(documentFileName("Incident INC0010001")).toBe("incident-inc0010001.pdf");
  });

  it("falls back when nothing usable is left", () => {
    expect(documentFileName("  ***  ", "report")).toBe("report.pdf");
  });
});
