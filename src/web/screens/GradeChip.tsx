import { Check, Star } from "lucide-react";
import type { CoachMessage } from "../coach/coachState.js";
import { t, type MessageKey } from "../i18n/t.js";

export type ChipGrade = NonNullable<CoachMessage["grade"]> | "ungraded";

const gradeKeys = {
  great: "grade.great",
  good: "grade.good",
  oops: "grade.oops",
  bigoops: "grade.bigoops",
  ungraded: "review.ungraded",
} as const satisfies Record<ChipGrade, MessageKey>;

export function GradeChip({ grade }: { grade: ChipGrade }) {
  return (
    <span className={`pp-grade pp-grade--${grade}`}>
      <span className="pp-grade__icon" aria-hidden="true">
        {grade === "great" ? (
          <Star aria-hidden="true" focusable="false" />
        ) : grade === "good" ? (
          <Check aria-hidden="true" focusable="false" />
        ) : grade === "oops" ? (
          "?"
        ) : grade === "bigoops" ? (
          "!!"
        ) : (
          "–"
        )}
      </span>
      {t(gradeKeys[grade])}
    </span>
  );
}
