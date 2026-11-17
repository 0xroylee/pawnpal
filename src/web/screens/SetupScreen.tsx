import { useState } from "react";
import type { Color } from "chess.js";
import { horseyPieces } from "../board/pieces.js";
import { t, type MessageKey } from "../i18n/t.js";

export type StartGameOptions = { kidColor: Color | "random"; fen?: string };

export function SetupScreen({
  onStart,
  disabled = false,
}: {
  onStart: (options: StartGameOptions) => void;
  disabled?: boolean;
}) {
  const [kidColor, setKidColor] = useState<Color | "random">("w");
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
        <button
          className="pp-btn pp-btn--primary pp-btn--hero"
          type="button"
          disabled={disabled}
          onClick={() => onStart({ kidColor })}
        >
          {t("setup.play")}
        </button>
      </section>
    </main>
  );
}
