import { describe, expect, it } from "vitest";
import { arrangeKeys, orderOf, readPresentation, serializePresentation } from "../presentation";

const keys = (list: { item: { key: string }; hidden: boolean }[]) =>
  list.map(entry => (entry.hidden ? `${entry.item.key}!` : entry.item.key));
const slides = (...names: string[]) => names.map(key => ({ key }));

describe("arrangeKeys", () => {
  it("keeps the saved order and hidden flags", () => {
    const generated = slides("cover:1", "record:a:1", "record:b:1");
    const order = [{ key: "record:b:1" }, { key: "cover:1", hidden: true }, { key: "record:a:1" }];
    expect(keys(arrangeKeys(generated, [], order))).toEqual(["record:b:1", "cover:1!", "record:a:1"]);
  });

  it("drops saved keys whose slide is gone", () => {
    const generated = slides("record:a:1");
    expect(keys(arrangeKeys(generated, [], [{ key: "record:gone:1" }, { key: "record:a:1" }]))).toEqual(["record:a:1"]);
  });

  it("places a new record among the record slides, after the one it follows", () => {
    const generated = slides("cover:1", "record:a:1", "record:new:1", "record:b:1");
    const custom = slides("custom:x");
    const order = [{ key: "cover:1" }, { key: "record:a:1" }, { key: "custom:x" }, { key: "record:b:1" }];
    expect(keys(arrangeKeys(generated, custom, order))).toEqual([
      "cover:1",
      "record:a:1",
      "record:new:1",
      "custom:x",
      "record:b:1",
    ]);
  });

  it("puts a new first record before the next record slide", () => {
    const generated = slides("record:new:1", "record:a:1");
    const custom = slides("custom:x");
    const order = [{ key: "custom:x" }, { key: "record:a:1" }];
    expect(keys(arrangeKeys(generated, custom, order))).toEqual(["custom:x", "record:new:1", "record:a:1"]);
  });

  it("keeps a custom slide the order lost track of, at the end", () => {
    expect(keys(arrangeKeys(slides("record:a:1"), slides("custom:x"), [{ key: "record:a:1" }]))).toEqual([
      "record:a:1",
      "custom:x",
    ]);
  });

  it("round-trips through orderOf", () => {
    const placed = arrangeKeys(slides("a:1", "b:1"), [], [{ key: "b:1", hidden: true }, { key: "a:1" }]);
    expect(orderOf(placed.map(entry => ({ key: entry.item.key, hidden: entry.hidden })))).toEqual([
      { key: "b:1", hidden: true },
      { key: "a:1" },
    ]);
  });
});

describe("readPresentation", () => {
  it("reads garbage as an empty presentation", () => {
    expect(readPresentation("not json")).toMatchObject({ slides: [], order: [] });
    expect(readPresentation(null)).toMatchObject({ slides: [], order: [] });
  });

  it("serializes canonically", () => {
    const once = serializePresentation(readPresentation({ version: 1, slides: [], order: [{ key: "cover:1" }] }));
    expect(serializePresentation(readPresentation(once))).toBe(once);
  });
});
