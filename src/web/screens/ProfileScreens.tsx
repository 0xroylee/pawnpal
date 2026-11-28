import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LockKeyhole, Settings, UserRound } from "lucide-react";
import { Pip } from "./Pip.js";
import {
  avatars,
  type Avatar,
  type GamePage,
  type Profile,
  type ProfileStats,
  type ProfileSettings,
} from "../../shared/game/library.js";
import {
  difficulties,
  isDifficulty,
  type Difficulty,
} from "../../shared/game/difficulty.js";
import { library } from "../game/libraryClient.js";
import { t } from "../i18n/t.js";
import type { Badge } from "../../shared/game/rewards.js";
import { BadgeShelf } from "./Rewards.js";

const animals: Record<Avatar, [string, string, string?]> = {
  bear: [
    "#ab7152",
    "M7 14a6 6 0 1 1 8-8m10 0a6 6 0 1 1 8 8",
    "M10 25q10-10 20 0v5H10Z",
  ],
  fox: [
    "#dc7543",
    "M6 17 7 3l11 9h4L33 3l1 14Z",
    "M6 20q9 0 14 8 5-8 14-8-2 14-14 14T6 20Z",
  ],
  owl: [
    "#9b7172",
    "M6 18 8 4l10 9h4l10-9 2 14Z",
    "M9 19a6 6 0 0 1 11-3 6 6 0 1 1 0 8 6 6 0 0 1-11-5Z",
  ],
  cat: ["#d5a467", "M5 18 7 3l12 10h2L33 3l2 15Z", "M12 27h16l-8 6Z"],
  frog: [
    "#81a76e",
    "M5 19a7 7 0 1 1 14-3h2a7 7 0 1 1 14 3Z",
    "M9 25h22q-3 8-11 8T9 25Z",
  ],
  rabbit: [
    "#a393bc",
    "M12 17Q3 2 11 2q7 0 7 15h4Q22 2 29 2q8 0-1 15Z",
    "M13 24q7-5 14 0v6H13Z",
  ],
  panda: [
    "#53586a",
    "M7 14a6 6 0 1 1 8-8m10 0a6 6 0 1 1 8 8",
    "M8 22a12 11 0 1 0 24 0 12 11 0 1 0-24 0Z",
  ],
  penguin: [
    "#54788b",
    "M6 22q0-17 14-17t14 17Z",
    "M8 24q1-10 12-6 11-4 12 6-1 10-12 10T8 24Z",
  ],
  tiger: [
    "#e59b4e",
    "M6 16a7 7 0 1 1 11-8h6a7 7 0 1 1 11 8Z",
    "M7 22 15 25l-6 2m24-5-8 3 6 2M16 11l4 7 4-7Z",
  ],
  koala: [
    "#8293a8",
    "M9 23a8 8 0 1 1 6-13m10 0a8 8 0 1 1 6 13",
    "M15 25q5-6 10 0v6H15Z",
  ],
  dog: [
    "#b7926b",
    "M11 10Q2 12 3 25l6 2 5-15m15-2q9 2 8 15l-6 2-5-15",
    "M11 25q9-7 18 0v6H11Z",
  ],
  mouse: [
    "#a88b9a",
    "M5 15a7 7 0 1 1 11-8m8 0a7 7 0 1 1 11 8",
    "M13 27q7-5 14 0l-7 7Z",
  ],
};

export function ProfileAvatar({ avatar }: { avatar: Avatar }) {
  const [coat, ears, marking] = animals[avatar];
  return (
    <svg className="pp-profile-avatar" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="var(--pp-sun-soft)" />
      <path d={ears} fill={coat} />
      <ellipse cx="20" cy="22" rx="14" ry="12" fill={coat} />
      {marking && <path d={marking} fill="#fff2df" />}
      <circle cx="15" cy="21" r="1.55" fill="#25233a" />
      <circle cx="25" cy="21" r="1.55" fill="#25233a" />
      <path
        d="M18 26q2 2 4 0"
        fill="none"
        stroke="#25233a"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ProfileCard({ children }: { children: ReactNode }) {
  return (
    <main className="pp-app pp-setup">
      <section className="pp-card pp-setup__card pp-library">
        {children}
      </section>
    </main>
  );
}

export function ProfilePicker({
  profiles,
  onSelect,
  onCreate,
  onGuest,
  onParent,
  networkOn,
  onAbout,
}: {
  profiles: Profile[];
  onSelect: (profile: Profile) => void;
  onCreate: () => void;
  onGuest: () => void;
  onParent: () => void;
  networkOn?: boolean;
  onAbout: () => void;
}) {
  return (
    <main className="pp-app pp-hero pp-picker">
      <button
        className="pp-iconbtn pp-hero__corner"
        type="button"
        aria-label={t("parent.title")}
        onClick={onParent}
      >
        <Settings aria-hidden="true" focusable="false" />
      </button>
      <Pip mood="happy" className="pp-hero__pip" />
      <h1>{t("library.who")}</h1>
      {networkOn && <p className="pp-network__banner">{t("network.banner")}</p>}
      <div className="pp-picker__tiles">
        {profiles.map((profile) => (
          <button
            className="pp-profile"
            type="button"
            key={profile.id}
            onClick={() => onSelect(profile)}
          >
            <ProfileAvatar avatar={profile.avatar} />
            <span>{profile.name}</span>
          </button>
        ))}
        <button
          className="pp-profile pp-profile--guest"
          type="button"
          onClick={onGuest}
        >
          <span className="pp-avatar" aria-hidden="true">
            <UserRound />
          </span>
          <span>{t("library.guest")}</span>
        </button>
      </div>
      <div className="pp-library__actions">
        <button
          className="pp-btn pp-btn--ghost"
          type="button"
          onClick={onCreate}
        >
          <LockKeyhole aria-hidden="true" />
          {t("library.addProfile")}
        </button>
        <button
          className="pp-btn pp-btn--ghost"
          type="button"
          onClick={onAbout}
        >
          {t("about.title")}
        </button>
      </div>
    </main>
  );
}

export function CreateProfile({
  busy,
  failed,
  onBack,
  onCreate,
  profile,
  experience,
  initialLevel,
  children,
}: {
  busy: boolean;
  failed: boolean;
  onBack: () => void;
  onCreate: (
    profile: Pick<ProfileSettings, "name" | "avatar"> &
      Partial<ProfileSettings>,
  ) => void;
  profile?: Profile;
  experience?: boolean;
  initialLevel?: Difficulty;
  children?: ReactNode;
}) {
  const [avatar, setAvatar] = useState<Avatar>(profile?.avatar ?? avatars[0]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const age = String(data.get("age") ?? "");
    const level = Number(data.get("level"));
    if (name)
      onCreate({
        name,
        avatar,
        age: age ? Number(age) : null,
        ...(isDifficulty(level) ? { level } : {}),
        ...(profile
          ? {
              voiceOn: data.has("voiceOn"),
              soundOn: data.has("soundOn"),
              tryAgainOn: data.has("tryAgainOn"),
            }
          : {}),
      });
  };
  return (
    <ProfileCard>
      <h1>{t(profile ? "parent.editProfile" : "library.addProfile")}</h1>
      <form className="pp-library__form" onSubmit={submit}>
        <label>
          {t("library.name")}
          <input
            name="name"
            required
            maxLength={60}
            autoComplete="off"
            defaultValue={profile?.name}
          />
        </label>
        <label>
          {t("library.age")}
          <input
            name="age"
            type="number"
            min="1"
            max="120"
            defaultValue={profile?.age ?? undefined}
          />
        </label>
        {experience && (
          <label>
            {t("parent.experience")}
            <select
              name="level"
              defaultValue={
                initialLevel && initialLevel >= 5
                  ? 5
                  : initialLevel && initialLevel >= 3
                    ? 3
                    : 1
              }
            >
              <option value="1">{t("parent.never")}</option>
              <option value="3">{t("parent.aLittle")}</option>
              <option value="5">{t("parent.often")}</option>
            </select>
          </label>
        )}
        {profile && (
          <>
            <label>
              {t("setup.level")}
              <select name="level" defaultValue={profile.level}>
                {difficulties.map((level) => (
                  <option key={level} value={level}>
                    {t(`setup.level.${level}.name`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="pp-parent__check">
              <input
                type="checkbox"
                name="voiceOn"
                defaultChecked={profile.voiceOn}
              />
              {t("parent.voice")}
            </label>
            <label className="pp-parent__check">
              <input
                type="checkbox"
                name="soundOn"
                defaultChecked={profile.soundOn}
              />
              {t("parent.sound")}
            </label>
            <label className="pp-parent__check">
              <input
                type="checkbox"
                name="tryAgainOn"
                defaultChecked={profile.tryAgainOn}
              />
              {t("parent.tryAgain")}
            </label>
          </>
        )}
        <fieldset>
          <legend>{t("library.avatar")}</legend>
          <div className="pp-avatar-grid">
            {avatars.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={t(`library.avatar.${option}`)}
                aria-pressed={avatar === option}
                onClick={() => setAvatar(option)}
              >
                <ProfileAvatar avatar={option} />
              </button>
            ))}
          </div>
        </fieldset>
        {failed && <p role="alert">{t("library.error")}</p>}
        <div className="pp-library__actions">
          <button
            className="pp-btn pp-btn--primary"
            type="submit"
            disabled={busy}
          >
            {t(profile ? "parent.save" : "library.create")}
          </button>
          <button
            className="pp-btn pp-btn--ghost"
            type="button"
            onClick={onBack}
            disabled={busy}
          >
            {t("library.back")}
          </button>
        </div>
      </form>
      {children}
    </ProfileCard>
  );
}

export function ProfileHistory({
  profile,
  onBack,
  onReview,
}: {
  profile: Profile;
  onBack: () => void;
  onReview?: (id: string) => Promise<void>;
}) {
  const [page, setPage] = useState<GamePage>();
  const [stats, setStats] = useState<ProfileStats>();
  const [badges, setBadges] = useState<Badge[]>();
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([
      library.listGames(profile.id),
      library.stats(profile.id),
      library.badges(profile.id),
    ])
      .then(([result, stats, badges]) => {
        if (active) {
          setPage(result);
          setStats(stats);
          setBadges(badges);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt, profile.id]);

  const loadMore = async () => {
    if (!page?.nextCursor || loading) return;
    setLoading(true);
    try {
      const next = await library.listGames(profile.id, page.nextCursor);
      setPage({
        games: [...page.games, ...next.games],
        nextCursor: next.nextCursor,
      });
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProfileCard>
      <h1>{t("library.historyTitle", { name: profile.name })}</h1>
      {badges && <BadgeShelf badges={badges} />}
      {failed ? (
        <div className="pp-library__actions">
          <p role="alert">{t("library.error")}</p>
          <button
            className="pp-btn pp-btn--secondary"
            type="button"
            onClick={() => retry(attempt + 1)}
          >
            {t("library.retry")}
          </button>
        </div>
      ) : (
        !page && <p role="status">{t("library.loading")}</p>
      )}
      {stats && stats.levels.length > 0 && (
        <ul className="pp-library__results">
          {stats.levels.map((level) => (
            <li key={level.level}>{t("library.stats", level)}</li>
          ))}
        </ul>
      )}
      {page?.games.length === 0 && <p>{t("library.noGames")}</p>}
      {page && page.games.length > 0 && (
        <ul className="pp-library__results">
          {page.games.map((game) => {
            const blunders = stats?.recentBlunders.find(
              (item) => item.gameId === game.id,
            );
            return (
              <li key={game.id}>
                <span>
                  {t(
                    game.status === "finished" && game.result
                      ? `library.${game.result}`
                      : `library.${game.status}`,
                  )}
                </span>
                {blunders && (
                  <span>
                    {t("library.blunders", { count: blunders.blunders })}
                  </span>
                )}
                <time dateTime={game.startedAt}>
                  {new Date(game.startedAt).toLocaleDateString()}
                </time>
                {game.status === "finished" && onReview && (
                  <button
                    className="pp-btn pp-btn--secondary pp-btn--sm"
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setLoading(true);
                      setFailed(false);
                      void onReview(game.id)
                        .catch(() => setFailed(true))
                        .finally(() => setLoading(false));
                    }}
                  >
                    {t("review.history")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="pp-library__actions">
        {page?.nextCursor && (
          <button
            className="pp-btn pp-btn--secondary"
            type="button"
            disabled={loading}
            onClick={() => void loadMore()}
          >
            {t("library.moreGames")}
          </button>
        )}
        <button className="pp-btn pp-btn--ghost" type="button" onClick={onBack}>
          {t("library.back")}
        </button>
      </div>
    </ProfileCard>
  );
}
