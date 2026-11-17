import { useEffect } from "react";
import { t } from "../i18n/t.js";
import { horseyPieces } from "./pieces.js";

const promotions = [
  { code: "q", key: "promotion.queen" },
  { code: "r", key: "promotion.rook" },
  { code: "b", key: "promotion.bishop" },
  { code: "n", key: "promotion.knight" },
] as const;

export function PromotionPicker({
  color,
  onChoose,
  onCancel,
}: {
  color: "w" | "b";
  onChoose: (piece: "q" | "r" | "b" | "n") => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="pp-promotion-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="pp-card pp-promotion"
        role="dialog"
        aria-modal="true"
        aria-label={t("promotion.aria")}
      >
        {promotions.map(({ code, key }) => (
          <button
            className="pp-btn pp-btn--secondary"
            type="button"
            key={code}
            onClick={() => onChoose(code)}
          >
            {horseyPieces[`${color}${code.toUpperCase()}`]?.()}
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );
}
