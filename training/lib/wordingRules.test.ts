import { checkWording } from "./wordingRules.ts";

describe("checkWording", () => {
  it("accepts short, kind text without coordinates or digits", () => {
    expect(checkWording("Your knight can find a safer path.")).toEqual({
      ok: true,
    });
  });

  it.each([
    ["Look at e4.", "coordinate"],
    ["Try move 2.", "digits"],
    ["They can try again.", "third-person"],
    ["That was a careless move.", "blame"],
    [Array.from({ length: 26 }, () => "kind").join(" "), "too-many-words"],
  ] as const)("rejects wording for %s", (text, reason) => {
    expect(checkWording(text)).toEqual({ ok: false, reason });
  });
});
