function inputNumber(value: string): string {
  return value.trim().replace(/\s/g, "").replace(",", ".");
}

const DECIMAL_INPUT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function normalizeDecimalInput(value: string): string {
  return inputNumber(value);
}

export function decimalInput(value: string | null): {
  valid: boolean;
  normalized: string | null;
  numeric: number | null;
} {
  if (value === null || value.trim() === "") {
    return { valid: true, normalized: null, numeric: null };
  }
  const normalized = inputNumber(value);
  const numeric = Number(normalized);
  if (!DECIMAL_INPUT.test(normalized) || !Number.isFinite(numeric)) {
    return { valid: false, normalized: null, numeric: null };
  }
  return { valid: true, normalized, numeric };
}

export function numberValue(value: string | null): number | null {
  return decimalInput(value).numeric;
}

export function sameNumber(first: string | null, second: string | null): boolean {
  const left = decimalInput(first);
  const right = decimalInput(second);
  return left.valid && right.valid && left.numeric === right.numeric;
}

function decimalParts(value: string): { sign: bigint; digits: bigint; scale: number } {
  const parsed = decimalInput(value);
  if (!parsed.valid || parsed.normalized === null) return { sign: 1n, digits: 0n, scale: 0 };
  const sign = parsed.normalized.startsWith("-") ? -1n : 1n;
  const unsigned = parsed.normalized.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  return {
    sign,
    digits: BigInt(`${whole || "0"}${fraction}`),
    scale: fraction.length,
  };
}

export function productCents(first: string, second: string): bigint {
  const left = decimalParts(first);
  const right = decimalParts(second);
  const sign = left.sign * right.sign;
  const product = left.digits * right.digits;
  const scale = left.scale + right.scale;
  if (scale <= 2) return sign * product * (10n ** BigInt(2 - scale));
  const divisor = 10n ** BigInt(scale - 2);
  const rounded = product / divisor + (product % divisor * 2n >= divisor ? 1n : 0n);
  return sign * rounded;
}

export function amountCents(value: string): bigint {
  return productCents(value, "1");
}

export function subtractDecimals(first: string, second: string): string {
  const left = decimalParts(first);
  const right = decimalParts(second);
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.sign * left.digits * (10n ** BigInt(scale - left.scale));
  const rightValue = right.sign * right.digits * (10n ** BigInt(scale - right.scale));
  const result = leftValue - rightValue;
  const sign = result < 0n ? "-" : "";
  const digits = (result < 0n ? -result : result).toString().padStart(scale + 1, "0");
  return scale ? `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}` : `${sign}${digits}`;
}
