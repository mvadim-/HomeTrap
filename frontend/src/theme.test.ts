import { describe, expect, it } from "vitest";

import portalCss from "./pages/portal.css?raw";
import themeCss from "./theme.css?raw";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tokenPattern = (token: string, value: string) =>
  new RegExp(`${token}:\\s*${escapeRegExp(value)}`, "i");

const ruleBody = (css: string, selector: string) => {
  const match = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, "i"));

  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
};

const lightTokens = {
  "--color-bg": "#f6f5f1",
  "--color-surface": "#ffffff",
  "--color-surface-muted": "#fbfaf7",
  "--color-text": "#2f3833",
  "--color-text-muted": "#8c958e",
  "--color-primary": "#4e7a6a",
  "--color-primary-soft": "#dfeae4",
  "--color-on-primary": "#ffffff",
  "--color-border": "#e7e5dd",
  "--chart-gas": "#eb6834",
  "--chart-elec": "#eda100",
  "--chart-water": "#2a78d6",
  "--chart-rent": "#1baf7a",
  "--chart-util": "#4a3aa7",
};

const darkTokens = {
  "--color-bg": "#141613",
  "--color-surface": "#1f211d",
  "--color-surface-muted": "#24261f",
  "--color-text": "#e9eae4",
  "--color-text-muted": "#8a9089",
  "--color-primary": "#7fab97",
  "--color-primary-soft": "#2a3630",
  "--color-on-primary": "#14251e",
  "--color-border": "#33362f",
  "--chart-gas": "#d95926",
  "--chart-elec": "#c98500",
  "--chart-water": "#3987e5",
  "--chart-rent": "#199e70",
  "--chart-util": "#9085e9",
};

describe("theme tokens", () => {
  it("matches the approved light palette", () => {
    const root = ruleBody(themeCss, ":root");

    Object.entries(lightTokens).forEach(([token, value]) => {
      expect(root).toMatch(tokenPattern(token, value));
    });
    expect(root).toMatch(tokenPattern("--radius-md", "12px"));
    expect(root).toMatch(
      tokenPattern(
        "--shadow-card",
        "0 1px 2px rgba(47, 56, 51, 0.05), 0 4px 14px rgba(47, 56, 51, 0.04)",
      ),
    );
  });

  it("matches the approved explicit dark palette without card shadows", () => {
    const darkRoot = ruleBody(themeCss, ':root[data-theme="dark"]');

    Object.entries(darkTokens).forEach(([token, value]) => {
      expect(darkRoot).toMatch(tokenPattern(token, value));
    });
    expect(darkRoot).toMatch(tokenPattern("--shadow-card", "none"));
  });

  it("uses the shared card token for bordered portal surfaces", () => {
    const cardRuleMatch = portalCss.match(
      /\.metric-card,\s*\.section-card,\s*\.apartment-card\s*\{([^}]*)\}/i,
    );
    const detailSurfaceRule = portalCss.match(
      /\.apartment-fact,\s*\.stats-summary-tile\s*\{([^}]*)\}/i,
    );

    expect(cardRuleMatch, "Missing shared portal card rule").not.toBeNull();
    const cardRule = cardRuleMatch?.[1] ?? "";
    expect(cardRule).toMatch(/border:\s*1px\s+solid\s+var\(--color-border\)/i);
    expect(cardRule).toMatch(/box-shadow:\s*var\(--shadow-card\)/i);
    expect(detailSurfaceRule, "Missing shared detail card rule").not.toBeNull();
    const detailRule = detailSurfaceRule?.[1] ?? "";
    expect(detailRule).toMatch(/border:\s*1px\s+solid\s+var\(--color-border\)/i);
    expect(detailRule).toMatch(/box-shadow:\s*var\(--shadow-card\)/i);
  });
});
