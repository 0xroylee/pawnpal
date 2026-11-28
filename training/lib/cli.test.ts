import { parseCliArgs } from "./cli.ts";

describe("parseCliArgs", () => {
  it("parses flag/value pairs", () => {
    expect(parseCliArgs(["--input", "games.pgn", "--limit", "12"])).toEqual({
      input: "games.pgn",
      limit: "12",
    });
  });

  it("requires flags to have values", () => {
    expect(() => parseCliArgs(["--input"])).toThrow(
      "Missing value for --input",
    );
  });

  it("rejects positional arguments and duplicate flags", () => {
    expect(() => parseCliArgs(["games.pgn"])).toThrow("Expected a --flag");
    expect(() => parseCliArgs(["--input", "a", "--input", "b"])).toThrow(
      "Duplicate flag --input",
    );
  });

  it("reports missing required flags", () => {
    expect(() => parseCliArgs(["--input", "games.pgn"], ["output"])).toThrow(
      "Missing required flag --output",
    );
  });
});
