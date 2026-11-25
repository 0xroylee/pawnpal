import pipCheering from "../../../design/assets/pip/pip-cheering.svg";
import pipEncouraging from "../../../design/assets/pip/pip-encouraging.svg";
import pipHappy from "../../../design/assets/pip/pip-happy.svg";
import pipSurprised from "../../../design/assets/pip/pip-surprised.svg";
import pipThinking from "../../../design/assets/pip/pip-thinking.svg";
import type { CoachPip } from "../coach/coachState.js";
import { t } from "../i18n/t.js";

const pipImages: Record<CoachPip, string> = {
  happy: pipHappy,
  thinking: pipThinking,
  surprised: pipSurprised,
  cheering: pipCheering,
  encouraging: pipEncouraging,
};

export function Pip({ mood }: { mood: CoachPip }) {
  return (
    <img
      className="pp-coach__pip"
      data-pip-mood={mood}
      src={pipImages[mood]}
      alt={t("coach.pipAlt")}
    />
  );
}
