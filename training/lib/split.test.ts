import { splitByGame } from "./split.ts";

describe("splitByGame", () => {
  it("keeps every game in one deterministic split and meets target proportions", () => {
    const records = Array.from({ length: 60 }, (_, gameIndex) =>
      Array.from({ length: 5 }, (_, recordIndex) => ({
        gameId: `game-${String(gameIndex).padStart(3, "0")}`,
        recordIndex,
      })),
    ).flat();
    const options = {
      seed: "fixture-1",
      ratios: [0.9, 0.05, 0.05] as const,
    };
    const result = splitByGame(records, options);
    const repeated = splitByGame(records, options);
    const gameSets = [
      new Set(result.train.map((record) => record.gameId)),
      new Set(result.validation.map((record) => record.gameId)),
      new Set(result.test.map((record) => record.gameId)),
    ];

    expect(result).toEqual(repeated);
    expect(
      result.train.length + result.validation.length + result.test.length,
    ).toBe(records.length);
    expect(gameSets[0]!.size + gameSets[1]!.size + gameSets[2]!.size).toBe(60);
    expect([...gameSets[0]!].some((gameId) => gameSets[1]!.has(gameId))).toBe(
      false,
    );
    expect([...gameSets[0]!].some((gameId) => gameSets[2]!.has(gameId))).toBe(
      false,
    );
    expect([...gameSets[1]!].some((gameId) => gameSets[2]!.has(gameId))).toBe(
      false,
    );

    for (const [actual, expected] of [
      [gameSets[0]!.size / 60, 0.9],
      [gameSets[1]!.size / 60, 0.05],
      [gameSets[2]!.size / 60, 0.05],
    ]) {
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.02);
    }
  });

  it("assigns all records with the same game ID together", () => {
    const result = splitByGame(
      [
        { gameId: "same-game", id: 1 },
        { gameId: "same-game", id: 2 },
        { gameId: "other-game", id: 3 },
      ],
      { seed: 3, ratios: [0.9, 0.05, 0.05] },
    );

    const destinations = [result.train, result.validation, result.test].filter(
      (split) => split.some((record) => record.gameId === "same-game"),
    );
    expect(destinations).toHaveLength(1);
    expect(
      destinations[0]
        ?.filter((record) => record.gameId === "same-game")
        .map((record) => record.id),
    ).toEqual([1, 2]);
  });
});
