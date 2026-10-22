import { describe, expect, it } from "vitest";
import { starterTemplate } from "../template";
import { dataSignature, plainText, recordFieldPaths, recordValues, rowValues, specimenValues } from "../vocabulary";

describe("plainText", () => {
  it("turns block markup into line breaks and drops the rest", () => {
    expect(plainText("<p>One</p><p>Two<br/>Three</p>")).toBe("One\nTwo\nThree");
  });

  it("decodes named and numeric entities", () => {
    expect(plainText("a &amp; b &lt;c&gt; &#233; &#x41;")).toBe("a & b <c> é A");
  });

  it("leaves plain text alone", () => {
    expect(plainText("  keep  ")).toBe("  keep  ");
    expect(plainText(null)).toBe("");
  });
});

describe("recordValues", () => {
  it("sets display and raw values only for paths the API returned", () => {
    const values = recordValues(
      { number: { value: "INC1", display_value: "INC1" }, state: { value: "2", display_value: "In Progress" } },
      ["number", "state", "missing"],
    );
    expect(values).toEqual({
      "record.number": "INC1",
      "raw.number": "INC1",
      "record.state": "In Progress",
      "raw.state": "2",
    });
  });
});

describe("rowValues", () => {
  it("keys display values by field and stored values under raw.", () => {
    expect(rowValues({ state: { value: "1", display_value: "Open" } })).toEqual({ state: "Open", "raw.state": "1" });
  });
});

describe("recordFieldPaths", () => {
  it("collects every record and raw path a template uses, plus sys_id", () => {
    const template = starterTemplate("document", [
      { name: "number", label: "Number" },
      { name: "short_description", label: "Short description" },
    ]);
    template.blocks.push({ type: "text", text: "{{raw.caller_id}} {{record.caller_id.email}}" });
    expect(recordFieldPaths(template).sort()).toEqual(
      ["caller_id", "caller_id.email", "number", "short_description", "sys_id"].sort(),
    );
  });

  it("changes the data signature only when what is fetched changes", () => {
    const template = starterTemplate("document", [{ name: "number", label: "Number" }]);
    const before = dataSignature(template);
    template.blocks.push({ type: "heading", text: "Plain words" });
    expect(dataSignature(template)).toBe(before);
    template.blocks.push({ type: "heading", text: "{{record.priority}}" });
    expect(dataSignature(template)).not.toBe(before);
  });
});

describe("specimenValues", () => {
  it("labels known fields and leaves unknown ones unset", () => {
    const values = specimenValues(
      ["number", "caller_id.email", "nope"],
      [
        { name: "number", label: "Number", type: "string" },
        { name: "caller_id", label: "Caller", type: "reference", reference: "sys_user" },
      ],
    );
    expect(values["record.number"]).toBe("‹Number›");
    expect(values["record.caller_id.email"]).toBe("‹Caller › email›");
    expect(values["record.nope"]).toBeUndefined();
  });
});
