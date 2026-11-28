import { LockKeyhole, Star } from "lucide-react";
import { badgeIds, type Badge } from "../../shared/game/rewards.js";
import { t } from "../i18n/t.js";

export function RewardStars({
  count,
  animated = false,
}: {
  count: number;
  animated?: boolean;
}) {
  return (
    <span
      className={`pp-stars${animated ? " is-animated" : ""}`}
      role="img"
      aria-label={t("rewards.stars", { count })}
    >
      {[1, 2, 3].map((position) => (
        <Star
          key={position}
          aria-hidden="true"
          className={position <= count ? "on" : "off"}
        />
      ))}
    </span>
  );
}

export function BadgeShelf({ badges }: { badges: Badge[] }) {
  return (
    <section className="pp-rewards__shelf">
      <h2>{t("rewards.shelf")}</h2>
      <ul>
        {badgeIds.map((id) => {
          const badge = badges.find((badge) => badge.id === id);
          return (
            <li key={id}>
              {badge ? (
                <Star aria-hidden="true" className="pp-rewards__earned" />
              ) : (
                <LockKeyhole aria-hidden="true" />
              )}
              <span>{t(`rewards.badge.${id}`)}</span>
              {badge ? (
                <time dateTime={badge.earnedAt}>
                  {new Date(badge.earnedAt).toLocaleDateString()}
                </time>
              ) : (
                <span>{t("rewards.locked")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
