import { isDifficulty } from "../../shared/game/difficulty.js";
import type { LevelSuggestion } from "../../shared/game/library.js";
import { t } from "../i18n/t.js";

export function levelSuggestionText({ direction, level }: LevelSuggestion) {
  return t(direction === "up" ? "library.levelUp" : "library.levelDown", {
    level,
    name: isDifficulty(level) ? t(`setup.level.${level}.name`) : level,
  });
}
