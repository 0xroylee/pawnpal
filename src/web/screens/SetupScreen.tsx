import { useState, type ReactNode } from "react";
import type { Color } from "chess.js";
import {
  defaultDifficulty,
  difficulties,
  isDifficulty,
  type Difficulty,
} from "../../shared/game/difficulty.js";
import { horseyPieces } from "../board/pieces.js";
import { t, type MessageKey } from "../i18n/t.js";

export type StartGameOptions = {
  kidColor: Color | "random";
  level: Difficulty;
};

export function SetupScreen({
  onStart,
  initialLevel = defaultDifficulty,
  disabled = false,
  children,
}: {
  onStart: (options: StartGameOptions) => void;
  initialLevel?: Difficulty;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [kidColor, setKidColor] = useState<Color | "random">("w");
  const [level, setLevel] = useState(initialLevel);
  const choices: Array<{
    color: Color | "random";
    label: MessageKey;
    piece: string;
  }> = [
    { color: "w" as const, label: "setup.white", piece: "wK" },
    { color: "b" as const, label: "setup.black", piece: "bK" },
    { color: "random" as const, label: "setup.random", piece: "wN" },
  ];

  return (
    <main className="pp-app pp-setup">
      <section className="pp-card pp-setup__card">
        <div className="pp-setup__mascot" aria-hidden="true">
          ♞
        </div>
        <h1>{t("setup.heading")}</h1>
        <p>{t("setup.subheading")}</p>
        <div
          className="pp-segment"
          role="group"
          aria-label={t("setup.colorLabel")}
        >
          {choices.map((choice) => (
            <button
              type="button"
              key={choice.color}
              aria-pressed={kidColor === choice.color}
              onClick={() => setKidColor(choice.color)}
            >
              {horseyPieces[choice.piece]?.()}
              {t(choice.label)}
            </button>
          ))}
        </div>
        <div className="pp-setup__level">
          <label htmlFor="opponent-level">{t("setup.level")}</label>
          <select
            id="opponent-level"
            value={level}
            disabled={disabled}
            aria-describedby="opponent-level-description opponent-level-stars"
            onChange={(event) => {
              const selected = Number(event.target.value);
              if (isDifficulty(selected)) setLevel(selected);
            }}
          >
            {difficulties.map((option) => (
              <option key={option} value={option}>
                {t(`setup.level.${option}.name`)}
              </option>
            ))}
          </select>
          <div
            className="pp-setup__stars"
            id="opponent-level-stars"
            role="img"
            aria-label={t("setup.stars", { level })}
          >
            {"★".repeat(level)}
          </div>
          <p id="opponent-level-description">
            {t(`setup.level.${level}.description`)}
          </p>
        </div>
        <button
          className="pp-btn pp-btn--primary pp-btn--hero"
          type="button"
          disabled={disabled}
          onClick={() => onStart({ kidColor, level })}
        >
          {t("setup.play")}
        </button>
        {children}
      </section>
    </main>
  );
}
