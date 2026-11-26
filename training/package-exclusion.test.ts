import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJsonPath = fileURLToPath(
  new URL("../package.json", import.meta.url),
);
const trainingPackageJsonPath = fileURLToPath(
  new URL("./package.json", import.meta.url),
);

describe("training package boundary", () => {
  it("keeps training outside the npm package allowlist", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      files?: string[];
    };

    expect(packageJson.files).toEqual(expect.arrayContaining(["bin", "dist"]));
    expect(
      packageJson.files?.some(
        (entry) => entry === "training" || entry.startsWith("training/"),
      ),
    ).toBe(false);
  });

  it("does not create a nested package manifest", () => {
    expect(existsSync(trainingPackageJsonPath)).toBe(false);
  });
});
