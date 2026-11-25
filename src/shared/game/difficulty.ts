export const difficulties = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type Difficulty = (typeof difficulties)[number];
export const defaultDifficulty: Difficulty = difficulties[0];

export function isDifficulty(value: unknown): value is Difficulty {
  return difficulties.some((difficulty) => difficulty === value);
}
