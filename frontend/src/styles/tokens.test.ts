import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Rule {
  selector: string;
  body: string;
}

const css = readFileSync("src/styles/tokens.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// Splits CSS into top-level rules; at-rules keep their inner text as the body.
function parseRules(text: string): Rule[] {
  const rules: Rule[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) break;
    let depth = 1;
    let j = open + 1;
    while (depth > 0 && j < text.length) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
      j++;
    }
    rules.push({ selector: text.slice(i, open).trim().replace(/\s+/g, " "), body: text.slice(open + 1, j - 1) });
    i = j;
  }
  return rules;
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const rules = parseRules(css);
const rootRule = rules.find((r) => r.selector === ":root");
const darkMedia = rules.find((r) => r.selector === "@media (prefers-color-scheme: dark)");
const darkMediaBlock = parseRules(darkMedia?.body ?? "").find((r) => r.selector === ':root:not([data-theme="light"])');
const darkAttrBlock = rules.find((r) => r.selector === ':root[data-theme="dark"]');
const accentRules = rules.filter((r) => /\[data-accent="\w+"\]/.test(r.selector));

const hues = ["rose", "peach", "lemon", "mint", "sky", "lavender"];

function accentTokens(hue: string): Record<string, string> {
  const rule = accentRules.find((r) => r.selector.includes(`[data-accent="${hue}"]`));
  return declarations(rule?.body ?? "");
}

function resolve(dark: boolean, accent: string): Record<string, string> {
  const merged = {
    ...declarations(rootRule!.body),
    ...(dark ? declarations(darkAttrBlock!.body) : {}),
    ...accentTokens(accent),
  };
  const value = (name: string, depth = 0): string => {
    const raw = merged[name];
    if (raw === undefined || depth > 10) throw new Error(`unresolved ${name}`);
    const ref = /^var\((--[\w-]+)\)$/.exec(raw);
    return ref ? value(ref[1], depth + 1) : raw;
  };
  return Object.fromEntries(Object.keys(merged).map((k) => [k, value(k)]));
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a hex color: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((o) => {
    const c = parseInt(m[1].slice(o, o + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground token, background token]
const textPairs: [string, string][] = [
  ["--ink", "--bg"],
  ["--ink", "--surface"],
  ["--ink", "--surface-2"],
  ["--muted", "--bg"],
  ["--muted", "--surface"],
  ["--muted", "--surface-2"],
  ["--danger", "--bg"],
  ["--danger", "--surface"],
  ["--danger", "--danger-fill"],
  ["--success", "--bg"],
  ["--success", "--surface"],
  ["--primary-text", "--primary-bg"],
  ["--selected-text", "--selected-bg"],
  ["--accent-ink", "--surface"],
  ["--cat-food-fg", "--cat-food-bg"],
  ["--cat-transport-fg", "--cat-transport-bg"],
  ["--cat-bills-fg", "--cat-bills-bg"],
  ["--cat-entertainment-fg", "--cat-entertainment-bg"],
  ["--cat-unknown-fg", "--cat-unknown-bg"],
  ...hues.map((h): [string, string] => [`--${h}-ink`, `--${h}-fill`]),
];

const nonTextPairs: [string, string][] = [
  ["--focus-ring", "--bg"],
  ["--focus-ring", "--surface"],
  ["--line-strong", "--surface"],
  ["--line-strong", "--bg"],
  ...["food", "transport", "bills", "entertainment", "unknown"].map((c): [string, string] => [
    `--cat-${c}-strong`,
    "--surface",
  ]),
];

describe("design tokens", () => {
  it("only references tokens that are defined, without fallbacks", () => {
    const defined = new Set<string>();
    const files = readdirSync("src/styles").filter((f) => f.endsWith(".css"));
    const texts = files.map((f) => readFileSync(`src/styles/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
    for (const t of texts) for (const m of t.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
    const used: string[] = [];
    for (const t of texts) {
      for (const m of t.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
        used.push(m[1]);
        expect(m[2], `${m[1]} has a fallback`).toBeUndefined();
      }
    }
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  it("finds every block it needs", () => {
    expect(rootRule).toBeDefined();
    expect(darkMediaBlock).toBeDefined();
    expect(darkAttrBlock).toBeDefined();
    expect(accentRules.length).toBeGreaterThanOrEqual(hues.length);
  });

  it("defines Lavender as the default accent", () => {
    const lavender = accentRules.find((r) => r.selector.includes('[data-accent="lavender"]'));
    expect(lavender?.selector).toContain(":root");
  });

  it("keeps the two dark blocks identical", () => {
    expect(declarations(darkMediaBlock!.body)).toEqual(declarations(darkAttrBlock!.body));
  });

  it("defines a token for every hue accent", () => {
    for (const hue of hues) {
      expect(Object.keys(accentTokens(hue)).sort()).toEqual(["--accent-fill", "--accent-ink", "--accent-strong"]);
    }
  });

  for (const dark of [false, true]) {
    for (const accent of hues) {
      const mode = dark ? "dark" : "light";
      describe(`${mode}, accent ${accent}`, () => {
        const tokens = resolve(dark, accent);

        it.each(textPairs)("%s on %s is at least 4.5:1", (fg, bg) => {
          expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
        });

        it.each(nonTextPairs)("%s on %s is at least 3:1", (fg, bg) => {
          expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
        });
      });
    }
  }
});
