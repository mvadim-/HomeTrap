import { describe, expect, it } from "vitest";

import { formatRate, formatRateSummary, formatReading, formatTariff } from "./format";

describe("number formatters", () => {
  it.each([
    ["197.91000", "197,91"],
    ["7.95689", "7,95689"],
    ["0", "0,00"],
    ["0.500", "0,50"],
    ["12", "12,00"],
  ])("formats tariff %s as %s", (value, expected) => {
    expect(formatTariff(value)).toBe(expected);
  });

  it.each([
    ["9582.000", "9\u00a0582"],
    ["9582.500", "9\u00a0582,5"],
    ["0", "0"],
    ["0.500", "0,5"],
    ["12", "12"],
  ])("formats reading %s as %s", (value, expected) => {
    expect(formatReading(value)).toBe(expected);
  });

  it.each([
    ["44.791700", "44,7917"],
    ["44.750000", "44,75"],
    ["0", "0,00"],
    ["0.500", "0,50"],
    ["12", "12,00"],
  ])("formats rate %s as %s", (value, expected) => {
    expect(formatRate(value)).toBe(expected);
  });

  it("rounds summary rates to exactly two decimal places", () => {
    expect(formatRateSummary("44.748000")).toBe("44,75");
  });
});
