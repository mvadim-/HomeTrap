import { describe, expect, it } from "vitest";

import { niceScale } from "./ticks";

describe("niceScale", () => {
  it.each([
    [361, 400, 100],
    [15, 16, 4],
    [8, 8, 2],
    [0.8, 0.8, 0.2],
    [0, 1, 0.25],
  ])("rounds %s to a readable scale", (value, max, step) => {
    expect(niceScale(value)).toEqual({ max, step });
  });
});
