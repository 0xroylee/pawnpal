import { useState, type ReactNode } from "react";
import type { Color } from "chess.js";
import { Check } from "lucide-react";
import {
  defaultDifficulty,
  difficulties,
  type Difficulty,
} from "../../shared/game/difficulty.js";
import type { LevelSuggestion } from "../../shared/game/library.js";
import { horseyPieces } from "../board/pieces.js";
import { t, type MessageKey } from "../i18n/t.js";
import { Pip } from "./Pip.js";

export type StartGameOptions = {
  kidColor: Color | "random";
  level: Difficulty;
};
const levelEmoji = {
  1: "🐌",
  2: "🐱",
  3: "🦫",
  4: "🦊",
  5: "🦉",
  6: "🐻",
  7: "🦁",
  8: "🐉",
} as const satisfies Record<Difficulty, string>;

export function SetupScreen({
  onStart,
  initialLevel = defaultDifficulty,
  disabled = false,
  children,
  beatenLevels = [],
  suggestion,
  onSuggestion,
}: {
  onStart: (options: StartGameOptions) => void;
  initialLevel?: Difficulty;
  disabled?: boolean;
  children?: ReactNode;
  beatenLevels?: Difficulty[];
  suggestion?: LevelSuggestion | null;
  onSuggestion?: (response: "accepted" | "declined") => void;
}) {
  const [kidColor, setKidColor] = useState<Color | "random">("w");
  const [level, setLevel] = useState(initialLevel);
  const choices: Array<{
    color: Color | "random";
    label: MessageKey;
    piece: string;
  }> = [
    { color: "w", label: "setup.white", piece: "wK" },
    { color: "b", label: "setup.black", piece: "bK" },
    { color: "random", label: "setup.random", piece: "wN" },
  ];
  return (
    <main className="pp-app pp-hero pp-setup">
      <div className="pp-hello">
        <Pip mood="happy" className="pp-hello__pip" />
        <div className="pp-bubble">
          <h1 className="pp-hello__title">{t("setup.heading")}</h1>
          <p aria-live="polite">
            {suggestion
              ? t(
                  suggestion.direction === "up"
                    ? "library.levelUp"
                    : "library.levelDown",
                  { level: suggestion.level },
                )
              : t(`setup.level.${level}.description`)}
          </p>
          {suggestion && (
            <div className="pp-bubble__actions">
              {(["accepted", "declined"] as const).map((response) => (
                <button
                  key={response}
                  type="button"
                  className={`pp-btn ${response === "accepted" ? "pp-btn--secondary pp-btn--sm" : "pp-btn--ghost"}`}
                  disabled={disabled}
                  onClick={() => onSuggestion?.(response)}
                >
                  {t(
                    response === "accepted"
                      ? "library.accept"
                      : "library.decline",
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <section aria-labelledby="setup-color">
        <h2 id="setup-color" className="pp-setup__label">
          {t("setup.subheading")}
        </h2>
        <div
          className="pp-setup__colors"
          role="group"
          aria-labelledby="setup-color"
        >
          {choices.map((choice) => (
            <button
              type="button"
              className="pp-tile"
              key={choice.color}
              aria-pressed={kidColor === choice.color}
              disabled={disabled}
              onClick={() => setKidColor(choice.color)}
            >
              {horseyPieces[choice.piece]?.()}
              {t(choice.label)}
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="setup-level">
        <h2 id="setup-level" className="pp-setup__label">
          {t("setup.pickOpponent")}
        </h2>
        <div
          className="pp-setup__levels"
          role="group"
          aria-labelledby="setup-level"
        >
          {difficulties.map((n) => (
            <button
              type="button"
              className="pp-level"
              data-level={n}
              aria-label={`${t(`setup.level.${n}.name`)}, ${t("setup.meter", { level: n })}${beatenLevels.includes(n) ? `, ${t("setup.beaten")}` : ""}`}
              key={n}
              aria-pressed={level === n}
              disabled={disabled}
              onClick={() => setLevel(n)}
            >
              {beatenLevels.includes(n) && (
                <span className="pp-level__beaten">
                  <Check aria-hidden="true" focusable="false" />
                  <span className="pp-sr-only">{t("setup.beaten")} </span>
                </span>
              )}
              <span className="pp-avatar" aria-hidden="true">
                {levelEmoji[n]}
              </span>
              <span className="pp-level__name">
                {t(`setup.level.${n}.name`)}{" "}
              </span>
              <span
                className="pp-meter"
                role="img"
                aria-label={t("setup.meter", { level: n })}
              >
                {difficulties.map((i) => (
                  <i key={i} className={i <= n ? "on" : undefined} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>
      <button
        className="pp-btn pp-btn--primary pp-btn--hero"
        type="button"
        disabled={disabled}
        onClick={() => onStart({ kidColor, level })}
      >
        {t("setup.play")}
      </button>
      {children}
    </main>
  );
}
