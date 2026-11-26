import { describe, expect, it } from "vitest";
import { qs, searchString, withParams } from "@/lib/url";
import { progressPercent, progressTone } from "@/components/patterns/progress-tone";
import { niceStep } from "@/components/patterns/bar-chart";

describe("qs / searchString / withParams", () => {
  it("drops empty values and keeps insertion order", () => {
    expect(qs({ q: "pipe", empty: "", none: undefined, nil: null, page: 2 })).toBe("?q=pipe&page=2");
    expect(searchString({ a: "1", b: "2" })).toBe("a=1&b=2");
  });
  it("returns an empty string when nothing is set", () => {
    expect(qs({})).toBe("");
    expect(qs({ q: undefined, page: "" })).toBe("");
    expect(withParams("/stock", { low: undefined })).toBe("/stock");
  });
  it("maps booleans: true is 1, false is dropped", () => {
    expect(qs({ flagged: true, all: false })).toBe("?flagged=1");
  });
  it("keeps zero (it is a real value)", () => {
    expect(qs({ page: 0 })).toBe("?page=0");
  });
  it("applies overrides in place and removes keys overridden with empty values", () => {
    const base = { q: "valve", system: "hydrant", page: 3 };
    expect(qs(base, { page: undefined })).toBe("?q=valve&system=hydrant");
    expect(qs(base, { system: "sprinkler" })).toBe("?q=valve&system=sprinkler&page=3");
    expect(qs(base, { view: "matrix" })).toBe("?q=valve&system=hydrant&page=3&view=matrix");
    expect(base).toEqual({ q: "valve", system: "hydrant", page: 3 });
  });
  it("encodes values", () => {
    expect(qs({ q: "a&b c" })).toBe("?q=a%26b+c");
  });
  it("prefixes a base path", () => {
    expect(withParams("/items", { view: "matrix", basis: "sell" })).toBe("/items?view=matrix&basis=sell");
    expect(withParams("/items", { view: "matrix" }, { view: undefined })).toBe("/items");
  });
});

describe("progressTone", () => {
  it("progress mode: neutral at zero, info while under way, success when complete", () => {
    expect(progressTone(0)).toBe("neutral");
    expect(progressTone(1)).toBe("info");
    expect(progressTone(99.9)).toBe("info");
    expect(progressTone(100)).toBe("success");
    expect(progressTone(120)).toBe("success");
  });
  it("progress mode with a count and a max", () => {
    expect(progressTone(3, 5)).toBe("info");
    expect(progressTone(5, 5)).toBe("success");
    expect(progressTone(0, 5)).toBe("neutral");
    expect(progressTone(0, 0)).toBe("neutral");
  });
  it("budget mode: green below 80, amber from 80 to 100, red past 100", () => {
    expect(progressTone(0, 100, "budget")).toBe("success");
    expect(progressTone(79.9, 100, "budget")).toBe("success");
    expect(progressTone(80, 100, "budget")).toBe("warning");
    expect(progressTone(99, 100, "budget")).toBe("warning");
    expect(progressTone(100, 100, "budget")).toBe("warning");
    expect(progressTone(100.1, 100, "budget")).toBe("danger");
  });
  it("progressPercent is safe for a zero or bad max and does not clamp", () => {
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(Number.NaN, 100)).toBe(0);
    expect(progressPercent(3, 4)).toBe(75);
    expect(progressPercent(150)).toBe(150);
  });
});

describe("niceStep", () => {
  it("rounds up to 1, 2 or 5 times a power of ten", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(130)).toBe(200);
    expect(niceStep(420000)).toBe(500000);
    expect(niceStep(1000)).toBe(1000);
  });
});
