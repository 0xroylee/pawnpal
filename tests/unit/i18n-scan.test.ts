import { describe, expect, it } from "vitest";
import { scanWebStrings } from "./i18n-scan.js";

describe("web translation scan", () => {
  it("finds no untranslated JSX text, UI attributes, or missing message keys", async () => {
    const findings = await scanWebStrings();
    expect(findings).toEqual([]);
  });
});
