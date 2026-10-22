import { describe, expect, it } from "vitest";
import { formatFigure, layoutChart, readDate, readFigure, spanPoints } from "../chart";

const style = {
  family: "helvetica" as const,
  fontSize: 10,
  textColor: "#111111",
  mutedColor: "#666666",
  surface: "#ffffff",
};

describe("readFigure", () => {
  it.each([
    ["42", 42],
    ["1,234.5", 1234.5],
    ["-3", -3],
    ["", null],
    ["abc", null],
  ])("reads %j as %j", (text, expected) => {
    expect(readFigure(text)).toBe(expected);
  });
});

describe("readDate", () => {
  it("reads a stored date-time and refuses nonsense", () => {
    expect(readDate("2024-03-01 10:00:00")).not.toBeNull();
    expect(readDate("someday")).toBeNull();
  });
});

describe("spanPoints", () => {
  it("drops spans with no start and keeps milestones", () => {
    const points = spanPoints([
      { label: "a", start: "2024-01-01", end: "2024-01-05" },
      { label: "b", start: "", end: "2024-01-05" },
      { label: "c", start: "2024-01-02", end: "" },
    ]);
    expect(points.map(point => point.label)).toEqual(["a", "c"]);
  });
});

describe("formatFigure", () => {
  it("keeps whole numbers whole", () => {
    expect(formatFigure(3)).toBe("3");
  });
});

describe("layoutChart", () => {
  const points = [
    { label: "New", value: 5 },
    { label: "Closed", value: 2 },
  ];

  it.each(["column", "bar", "line", "area", "pie", "donut", "funnel"] as const)(
    "lays out a %s chart inside its box",
    chart => {
      const scene = layoutChart({ chart, height: 160, showValues: true }, points, 400, style);
      expect(scene.width).toBe(400);
      expect(scene.height).toBeGreaterThan(0);
      expect(scene.marks.length).toBeGreaterThan(0);
    },
  );
});
