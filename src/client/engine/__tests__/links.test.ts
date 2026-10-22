import { describe, expect, it } from "vitest";
import { asciiUrl, recordUrl, safeUrl } from "../links";

describe("safeUrl", () => {
  const base = "https://acme.service-now.com/";

  it.each([
    ["https://example.com/a", "https://example.com/a"],
    ["HTTP://example.com", "HTTP://example.com"],
    ["mailto:a@b.c", "mailto:a@b.c"],
    ["tel:+15551234", "tel:+15551234"],
    ["www.example.com/page", "https://www.example.com/page"],
    ["/incident_list.do", "https://acme.service-now.com/incident_list.do"],
  ])("allows %s", (raw, expected) => {
    expect(safeUrl(raw, base)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "vbscript:x",
    "//evil.example.com",
    "",
    "   ",
    "file:///etc/passwd",
  ])("refuses %s", raw => {
    expect(safeUrl(raw, base)).toBeNull();
  });

  it("drops an instance path when there is no instance to resolve it against", () => {
    expect(safeUrl("/incident.do")).toBeNull();
  });
});

describe("asciiUrl", () => {
  it("percent-encodes anything outside printable ASCII", () => {
    expect(asciiUrl("https://x.com/é ü")).toBe("https://x.com/%C3%A9%20%C3%BC");
  });
});

describe("recordUrl", () => {
  it("builds a form link, encoding the parts", () => {
    expect(recordUrl("https://i.com/", "incident", "abc")).toBe("https://i.com/incident.do?sys_id=abc");
  });
});
