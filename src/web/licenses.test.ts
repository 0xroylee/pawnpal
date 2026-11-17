import { describe, expect, it } from "vitest";
import { licenseFiles } from "../../vite.config.js";

describe("build license copies", () => {
  it("ships the horsey and Nunito license texts with their assets", () => {
    expect(licenseFiles).toContainEqual({
      source: "design/assets/pieces/horsey/LICENSE.md",
      destination: "licenses/horsey/LICENSE.md",
    });
    expect(licenseFiles).toContainEqual({
      source: "design/assets/fonts/OFL-Nunito.txt",
      destination: "licenses/nunito/OFL-Nunito.txt",
    });
  });
});
