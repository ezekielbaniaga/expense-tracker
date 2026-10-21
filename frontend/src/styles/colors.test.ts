import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Raw colors live in tokens.css only; everything else uses tokens.
describe("stylesheets", () => {
  const files = readdirSync("src/styles").filter((f) => f.endsWith(".css") && f !== "tokens.css");

  it("finds the stylesheets to check", () => {
    expect(files).toEqual(expect.arrayContaining(["base.css", "layout.css", "components.css"]));
  });

  it.each(files)("%s has no hex or rgb() colors", (file) => {
    const css = readFileSync(`src/styles/${file}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\brgba?\(/i);
  });
});
