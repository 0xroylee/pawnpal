import { Check, Star } from "lucide-react";
import type { CoachMessage } from "../coach/coachState.js";
import { t, type MessageKey } from "../i18n/t.js";

const gradeKeys = {
  great: "grade.great",
  good: "grade.good",
  oops: "grade.oops",
  bigoops: "grade.bigoops",
} as const satisfies Record<NonNullable<CoachMessage["grade"]>, MessageKey>;

export function GradeChip({
  grade,
}: {
  grade: NonNullable<CoachMessage["grade"]>;
}) {
  return (
    <span className={`pp-grade pp-grade--${grade}`}>
      <span className="pp-grade__icon">
        {grade === "great" ? (
          <Star aria-hidden="true" focusable="false" />
        ) : grade === "good" ? (
          <Check aria-hidden="true" focusable="false" />
        ) : grade === "oops" ? (
          "?"
        ) : (
          "!!"
        )}
      </span>
      {t(gradeKeys[grade])}
    </span>
  );
}
