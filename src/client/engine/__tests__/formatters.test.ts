import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fillTokens, setFormatLocale, tokensIn } from "../tokens";

beforeAll(() => setFormatLocale("en-US"));
afterAll(() => setFormatLocale(undefined));

const fill = (text: string, values: Record<string, string> = {}) => fillTokens(text, values);

describe("token formatters", () => {
  it("still reads the token name for fetching", () => {
    expect(tokensIn('{{record.opened_at | date:"d MMM yyyy"}} {{ record.state|upper }}')).toEqual([
      "record.opened_at",
      "record.state",
    ]);
  });

  it("changes case", () => {
    expect(fill("{{x | upper}} {{x|lower}} {{x | title}}", { x: "heLLo wide-world" })).toBe(
      "HELLO WIDE-WORLD hello wide-world Hello Wide-World",
    );
  });

  it("fills in a default for an empty value, and for an unknown token while still reporting it", () => {
    const unknown = new Set<string>();
    expect(fillTokens("{{x | default:\"None\"}} {{y | default:'n/a'}}", { x: " " }, unknown)).toBe("None n/a");
    expect([...unknown]).toEqual(["y"]);
  });

  it("truncates by characters with an ellipsis", () => {
    expect(fill("{{x | truncate:6}}", { x: "abcdefghij" })).toBe("abcde…");
    expect(fill("{{x | truncate:20}}", { x: "short" })).toBe("short");
  });

  it("formats a date from the stored value when there is one", () => {
    const values = { "record.due": "Saturday", "raw.due": "2026-03-07" };
    expect(fill('{{record.due | date:"EEEE d MMMM yyyy"}}', values)).toBe("Saturday 7 March 2026");
    expect(fill("{{record.due | date:\"yyyy-MM-dd 'week'\"}}", values)).toBe("2026-03-07 week");
  });

  it("leaves a value that is not a date alone", () => {
    expect(fill('{{x | date:"yyyy"}}', { x: "soon" })).toBe("soon");
  });

  it("groups numbers and fixes decimals", () => {
    expect(fill("{{x | number}} {{x | number:2}}", { x: "1234567.891" })).toBe("1,234,567.891 1,234,567.89");
  });

  it("reads a stored duration", () => {
    expect(fill("{{record.d | duration}}", { "record.d": "2 Days 4 Hours", "raw.d": "1970-01-03 04:05:00" })).toBe(
      "2d 4h 5m",
    );
  });

  it("turns true and false into words", () => {
    expect(
      fill('{{record.a | yesno:"On","Off"}} {{record.b | yesno}}', {
        "record.a": "true",
        "raw.a": "true",
        "record.b": "false",
        "raw.b": "false",
      }),
    ).toBe("On No");
  });

  it("chains formatters left to right, the first reading the stored value", () => {
    expect(fill('{{record.d | date:"MMM" | upper}}', { "record.d": "x", "raw.d": "2026-01-15" })).toBe("JAN");
  });

  it("ignores formatters it does not know", () => {
    expect(fill("{{x | sparkle}}", { x: "plain" })).toBe("plain");
  });

  it("keeps tokens it is not filling when asked to", () => {
    expect(fillTokens("{{a | upper}} {{b}}", { a: "x" }, undefined, { keepUnknown: true })).toBe("X {{b}}");
  });
});
