import { useEffect, useState, type FormEvent } from "react";
import { t } from "../i18n/t.js";
import {
  parent,
  type BrainSettings,
  type BrainTest,
  type ModelList,
} from "./client.js";

const ollamaUrl = "http://127.0.0.1:11434/v1";

export function CoachSettings({
  wizard,
  onDone,
}: {
  wizard: boolean;
  onDone: () => void;
}) {
  const [settings, setSettings] = useState<BrainSettings>();
  const [paused, setPaused] = useState(false);
  const [custom, setCustom] = useState(false);
  const [discovery, setDiscovery] = useState<ModelList>();
  const [result, setResult] = useState<BrainTest>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void parent
      .coach()
      .then(async ({ paused, enabled, baseUrl, model, timeoutMs }) => {
        if (!active) return;
        const config = { enabled, baseUrl, model, timeoutMs };
        setSettings(config);
        setPaused(paused);
        setCustom(config.baseUrl !== ollamaUrl);
        const models = await parent.models(config);
        if (active) setDiscovery(models);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!settings)
    return (
      <p role={failed ? "alert" : "status"}>
        {t(failed ? "library.error" : "parent.loading")}
      </p>
    );
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const change = (patch: Partial<BrainSettings>) => {
    setSettings({ ...settings, ...patch });
    setResult(undefined);
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await parent.updateCoach(
        wizard ? { ...settings, enabled: true } : settings,
      );
      onDone();
    });
  };
  const pull = discovery?.suggested
    ? `ollama pull ${discovery.suggested}`
    : undefined;

  return (
    <>
      <h1>{t("parent.coach")}</h1>
      {wizard && <p>{t("parent.coachOptional")}</p>}
      {paused && <p role="status">{t("parent.coachPaused")}</p>}
      <form className="pp-library__form" onSubmit={save}>
        {!wizard && (
          <label className="pp-parent__check">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => change({ enabled: event.target.checked })}
            />
            {t("parent.coachEnabled")}
          </label>
        )}
        {custom ? (
          <>
            <label>
              {t("parent.serverUrl")}
              <input
                type="url"
                value={settings.baseUrl}
                required
                onChange={(event) => {
                  setDiscovery(undefined);
                  change({ baseUrl: event.target.value });
                }}
              />
            </label>
            <label>
              {t("parent.apiKey")}
              <input
                type="password"
                autoComplete="off"
                value={settings.apiKey ?? ""}
                onChange={(event) => {
                  setDiscovery(undefined);
                  change({ apiKey: event.target.value });
                }}
              />
            </label>
          </>
        ) : (
          discovery?.connected === false && (
            <p>
              {t("parent.ollamaMissing")}{" "}
              <a href="https://ollama.com" target="_blank" rel="noreferrer">
                {t("parent.installOllama")}
              </a>
            </p>
          )
        )}
        {discovery?.connected &&
          !discovery.models.length &&
          !custom &&
          pull && (
            <div className="pp-parent__command">
              <p>{t("parent.noModels")}</p>
              <code>{pull}</code>
              <button
                className="pp-btn pp-btn--secondary"
                type="button"
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(pull);
                    setCopied(true);
                  })
                }
              >
                {t(copied ? "parent.copied" : "parent.copy")}
              </button>
            </div>
          )}
        {discovery?.models.length ? (
          <label>
            {t("parent.model")}
            <select
              value={settings.model}
              onChange={(event) => change({ model: event.target.value })}
            >
              <option value="">{t("parent.selectModel")}</option>
              {settings.model && !discovery.models.includes(settings.model) && (
                <option value={settings.model}>{settings.model}</option>
              )}
              {discovery.models.map((model) => (
                <option key={model} value={model}>
                  {model === discovery.suggested
                    ? t("parent.suggested", { model })
                    : model}
                </option>
              ))}
            </select>
          </label>
        ) : (
          custom && (
            <label>
              {t("parent.model")}
              <input
                value={settings.model}
                onChange={(event) => change({ model: event.target.value })}
              />
            </label>
          )
        )}
        <div className="pp-library__actions">
          <button
            type="button"
            className="pp-btn pp-btn--secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => setDiscovery(await parent.models(settings)))
            }
          >
            {t("parent.checkAgain")}
          </button>
          <button
            type="button"
            className="pp-btn pp-btn--ghost"
            disabled={busy}
            onClick={() => {
              setCustom(!custom);
              setDiscovery(undefined);
              change({
                baseUrl: custom ? ollamaUrl : "",
                model: "",
                apiKey: undefined,
              });
            }}
          >
            {t(custom ? "parent.useOllama" : "parent.otherServer")}
          </button>
          <button
            type="button"
            className="pp-btn pp-btn--secondary"
            disabled={busy || !settings.model}
            onClick={() =>
              void run(async () => setResult(await parent.testCoach(settings)))
            }
          >
            {t("parent.test")}
          </button>
        </div>
        {result && (
          <div role="status">
            <p>{result.text}</p>
            <p>
              {t(
                result.source === "llm"
                  ? "parent.testPassed"
                  : "parent.testFallback",
                { seconds: (result.elapsedMs / 1000).toFixed(2) },
              )}
            </p>
            {result.elapsedMs > 3000 && <p>{t("parent.testSlow")}</p>}
          </div>
        )}
        {failed && <p role="alert">{t("library.error")}</p>}
        <div className="pp-library__actions">
          <button
            type="submit"
            className="pp-btn pp-btn--primary"
            disabled={busy || ((wizard || settings.enabled) && !settings.model)}
          >
            {t(wizard ? "parent.useModel" : "parent.save")}
          </button>
          {wizard && (
            <button
              type="button"
              className="pp-btn pp-btn--ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await parent.updateCoach({
                    ...settings,
                    enabled: false,
                    baseUrl: ollamaUrl,
                    model: "",
                    apiKey: "",
                  });
                  onDone();
                })
              }
            >
              {t("parent.skipCoach")}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
