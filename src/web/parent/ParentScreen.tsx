import { useEffect, useState, type FormEvent } from "react";
import type { Profile, ProfileSettings } from "../../shared/game/library.js";
import type { Difficulty } from "../../shared/game/difficulty.js";
import { ApiError, library } from "../game/libraryClient.js";
import { t } from "../i18n/t.js";
import {
  CreateProfile,
  ProfileAvatar,
  ProfileCard,
} from "../screens/ProfileScreens.js";
import { CoachSettings } from "./CoachSettings.js";
import { NetworkSettings } from "./NetworkSettings.js";
import { parent } from "./client.js";

type Step =
  | "loading"
  | "welcome"
  | "create-pin"
  | "unlock"
  | "first-profile"
  | "first-coach"
  | "home"
  | "profiles"
  | "edit"
  | "coach"
  | "data"
  | "network"
  | "change-pin";

function PinForm({
  create,
  changing,
  retryAfterMs,
  onSubmit,
  onBack,
}: {
  create: boolean;
  changing?: boolean;
  retryAfterMs: number;
  onSubmit: (pin: string, confirmation: string) => Promise<void>;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"mismatch" | "wrong" | "generic">();
  const [lockedUntil, setLockedUntil] = useState(
    () => Date.now() + retryAfterMs,
  );
  const [now, setNow] = useState(Date.now);
  const seconds = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  useEffect(() => {
    if (seconds === 0) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [now, seconds]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const pin = String(data.get("pin") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    setError(undefined);
    if (create && pin !== confirm) {
      setError("mismatch");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(pin, confirm);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        const now = Date.now();
        setNow(now);
        setLockedUntil(now + 60_000);
      } else {
        setError(
          error instanceof ApiError && error.status === 401
            ? "wrong"
            : "generic",
        );
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <ProfileCard>
      <h1>
        {t(
          changing
            ? "parent.changePin"
            : create
              ? "parent.createPin"
              : "parent.unlock",
        )}
      </h1>
      <form
        className="pp-library__form"
        onSubmit={(event) => void submit(event)}
      >
        <label>
          {t("parent.pin")}
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            required
            autoComplete={create ? "new-password" : "current-password"}
          />
        </label>
        {create && (
          <label>
            {t("parent.pinConfirm")}
            <input
              name="confirm"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              autoComplete="new-password"
            />
          </label>
        )}
        {seconds > 0 && <p role="status">{t("parent.locked", { seconds })}</p>}
        {error && (
          <p role="alert">
            {t(
              error === "generic"
                ? "library.error"
                : error === "wrong"
                  ? "parent.pinWrong"
                  : "parent.pinMismatch",
            )}
          </p>
        )}
        <div className="pp-library__actions">
          <button
            className="pp-btn pp-btn--primary"
            type="submit"
            disabled={busy || seconds > 0}
          >
            {t(create ? "parent.savePin" : "parent.unlockButton")}
          </button>
          <button
            className="pp-btn pp-btn--ghost"
            type="button"
            disabled={busy}
            onClick={onBack}
          >
            {t("library.back")}
          </button>
        </div>
      </form>
    </ProfileCard>
  );
}

export function ParentScreen({
  wizard,
  legacyLevel,
  guestSoundOn,
  onGuest,
  onDone,
}: {
  wizard: boolean;
  legacyLevel?: Difficulty;
  guestSoundOn: boolean;
  onGuest: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>(wizard ? "welcome" : "loading");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<Profile>();
  const [retryAfter, setRetryAfter] = useState(0);
  const [dataFolder, setDataFolder] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (wizard) return;
    let active = true;
    void parent
      .status()
      .then((status) => {
        if (!active) return;
        setRetryAfter(status.retryAfterMs);
        setStep(
          status.unlocked ? "home" : status.pinSet ? "unlock" : "create-pin",
        );
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [wizard]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setStep("unlock");
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const goHome = () => {
    setFailed(false);
    setConfirm("");
    setStep("home");
  };
  const openProfiles = () =>
    void run(async () => {
      setProfiles(await library.listProfiles());
      setStep("profiles");
    });
  const continueSetup = () =>
    void run(async () => {
      const status = await parent.status();
      setRetryAfter(status.retryAfterMs);
      setStep(
        status.unlocked
          ? "first-profile"
          : status.pinSet
            ? "unlock"
            : "create-pin",
      );
    });
  const afterPin = () => setStep(wizard ? "first-profile" : "home");
  const updateProfile = (
    input: Pick<ProfileSettings, "name" | "avatar"> & Partial<ProfileSettings>,
  ) =>
    void run(async () => {
      if (step === "first-profile") {
        await library.createProfile({ soundOn: guestSoundOn, ...input });
        setStep("first-coach");
        return;
      }
      if (editing) await library.updateProfile(editing.id, input);
      else await library.createProfile(input);
      setProfiles(await library.listProfiles());
      setStep("profiles");
    });

  if (step === "welcome")
    return (
      <ProfileCard>
        <h1>{t("parent.welcome")}</h1>
        <p>{t("parent.welcomeDescription")}</p>
        <p>{t("parent.privacy")}</p>
        <div className="pp-library__actions">
          <button
            className="pp-btn pp-btn--primary"
            type="button"
            disabled={busy}
            onClick={continueSetup}
          >
            {t("parent.start")}
          </button>
          <button
            className="pp-btn pp-btn--ghost"
            type="button"
            onClick={onGuest}
          >
            {t("library.guest")}
          </button>
        </div>
        {failed && <p role="alert">{t("library.error")}</p>}
      </ProfileCard>
    );
  if (step === "create-pin" || step === "unlock" || step === "change-pin")
    return (
      <PinForm
        key={step}
        create={step !== "unlock"}
        changing={step === "change-pin"}
        retryAfterMs={step === "unlock" ? retryAfter : 0}
        onBack={
          step === "change-pin"
            ? goHome
            : wizard
              ? () => setStep("welcome")
              : onDone
        }
        onSubmit={async (pin, confirm) => {
          if (step === "unlock") await parent.unlock(pin);
          else await parent.pin(pin, confirm);
          afterPin();
        }}
      />
    );
  if (step === "first-profile" || step === "edit")
    return (
      <CreateProfile
        busy={busy}
        failed={failed}
        onCreate={updateProfile}
        profile={step === "edit" ? editing : undefined}
        experience={step === "first-profile"}
        initialLevel={legacyLevel}
        onBack={
          step === "first-profile"
            ? () => setStep("welcome")
            : () => setStep("profiles")
        }
      >
        {editing && step === "edit" && (
          <form
            className="pp-library__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (confirm !== editing.name) return;
              void run(async () => {
                await library.deleteProfile(editing.id);
                setProfiles(await library.listProfiles());
                setEditing(undefined);
                setConfirm("");
                setStep("profiles");
              });
            }}
          >
            <label>
              {t("parent.confirmDelete", { name: editing.name })}
              <input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              className="pp-btn pp-btn--secondary"
              type="submit"
              disabled={confirm !== editing.name || busy}
            >
              {t("parent.delete")}
            </button>
          </form>
        )}
      </CreateProfile>
    );
  if (step === "coach" || step === "first-coach")
    return (
      <ProfileCard>
        <CoachSettings
          wizard={step === "first-coach"}
          onDone={() => {
            if (step === "first-coach")
              void run(async () => {
                await parent.finishSetup();
                onDone();
              });
            else goHome();
          }}
        />
        {failed && <p role="alert">{t("library.error")}</p>}
        {step === "coach" && (
          <button
            className="pp-btn pp-btn--ghost"
            type="button"
            onClick={goHome}
          >
            {t("library.back")}
          </button>
        )}
      </ProfileCard>
    );
  if (step === "profiles")
    return (
      <ProfileCard>
        <h1>{t("parent.profiles")}</h1>
        <div className="pp-profile-grid">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              className="pp-btn pp-btn--secondary pp-profile-choice"
              type="button"
              onClick={() => {
                setEditing(profile);
                setConfirm("");
                setStep("edit");
              }}
            >
              <ProfileAvatar avatar={profile.avatar} />
              <span>{profile.name}</span>
            </button>
          ))}
        </div>
        <div className="pp-library__actions">
          <button
            className="pp-btn pp-btn--primary"
            type="button"
            onClick={() => {
              setEditing(undefined);
              setStep("edit");
            }}
          >
            {t("library.addProfile")}
          </button>
          <button
            className="pp-btn pp-btn--ghost"
            type="button"
            onClick={goHome}
          >
            {t("library.back")}
          </button>
        </div>
      </ProfileCard>
    );
  if (step === "network")
    return (
      <ProfileCard>
        <NetworkSettings />
        <button className="pp-btn pp-btn--ghost" type="button" onClick={goHome}>
          {t("library.back")}
        </button>
      </ProfileCard>
    );
  if (step === "data")
    return (
      <ProfileCard>
        <h1>{t("parent.data")}</h1>
        <p>{t("parent.dataFolder")}</p>
        <code className="pp-parent__path">{dataFolder}</code>
        {profiles.map((profile) => (
          <a
            key={profile.id}
            className="pp-btn pp-btn--secondary"
            href={`/api/profiles/${profile.id}/export`}
            download
          >
            {t("parent.export", { name: profile.name })}
          </a>
        ))}
        <form
          className="pp-library__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirm === "RESET")
              void run(async () => {
                await parent.reset(confirm);
                onDone();
              });
          }}
        >
          <label>
            {t("parent.confirmReset")}
            <input
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="pp-btn pp-btn--secondary"
            type="submit"
            disabled={busy || confirm !== "RESET"}
          >
            {t("parent.reset")}
          </button>
        </form>
        {failed && <p role="alert">{t("library.error")}</p>}
        <button className="pp-btn pp-btn--ghost" type="button" onClick={goHome}>
          {t("library.back")}
        </button>
      </ProfileCard>
    );
  return (
    <ProfileCard>
      <h1>{t("parent.title")}</h1>
      {step === "loading" ? (
        <p role={failed ? "alert" : "status"}>
          {t(failed ? "library.error" : "parent.loading")}
        </p>
      ) : (
        <div className="pp-parent__menu">
          <button
            className="pp-btn pp-btn--secondary"
            disabled={busy}
            type="button"
            onClick={() => setStep("network")}
          >
            {t("network.title")}
          </button>
          <button
            className="pp-btn pp-btn--secondary"
            disabled={busy}
            type="button"
            onClick={openProfiles}
          >
            {t("parent.profiles")}
          </button>
          <button
            className="pp-btn pp-btn--secondary"
            disabled={busy}
            type="button"
            onClick={() => setStep("coach")}
          >
            {t("parent.coach")}
          </button>
          <button
            className="pp-btn pp-btn--secondary"
            disabled={busy}
            type="button"
            onClick={() =>
              void run(async () => {
                const [{ dataFolder }, profiles] = await Promise.all([
                  parent.data(),
                  library.listProfiles(),
                ]);
                setDataFolder(dataFolder);
                setProfiles(profiles);
                setStep("data");
              })
            }
          >
            {t("parent.data")}
          </button>
          <button
            className="pp-btn pp-btn--secondary"
            disabled={busy}
            type="button"
            onClick={() => setStep("change-pin")}
          >
            {t("parent.changePin")}
          </button>
          {failed && <p role="alert">{t("library.error")}</p>}
        </div>
      )}
      <button className="pp-btn pp-btn--ghost" type="button" onClick={onDone}>
        {t("review.done")}
      </button>
    </ProfileCard>
  );
}
