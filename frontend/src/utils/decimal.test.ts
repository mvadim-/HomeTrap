import { describe, expect, it } from "vitest";

import {
  decimalInput,
  productCents,
  sameNumber,
  subtractDecimals,
} from "./decimal";

describe("decimal utilities", () => {
  it("normalizes localized decimals but rejects exponent notation", () => {
    expect(decimalInput(" 9\u00a0583,500 ")).toEqual({
      valid: true,
      normalized: "9583.500",
      numeric: 9583.5,
    });
    expect(decimalInput("1e3")).toEqual({ valid: false, normalized: null, numeric: null });
  });

  it("compares equivalent decimal representations", () => {
    expect(sameNumber("44,6800", "44.68")).toBe(true);
    expect(sameNumber("invalid", "0")).toBe(false);
  });

  it("rounds products to cents using ROUND_HALF_UP", () => {
    expect(productCents("10.075", "1")).toBe(1008n);
    expect(productCents("-10.075", "1")).toBe(-1008n);
  });

  it("subtracts decimal strings without losing precision", () => {
    expect(subtractDecimals("9583.500", "9500.000")).toBe("83.500");
    expect(subtractDecimals("1.2", "2.05")).toBe("-0.85");
  });
});
