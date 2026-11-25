import { useEffect, useState } from "react";
import { t } from "../i18n/t.js";
import { parent, type TabletSettings } from "./client.js";

export function NetworkSettings() {
  const [value, setValue] = useState<TabletSettings>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  useEffect(() => {
    let active = true;
    void parent
      .network()
      .then((state) => {
        if (active) setValue(state);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const change = async (enabled: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await parent.updateNetwork(enabled);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(
        window.location.hostname,
      );
      if (!enabled && !local) {
        setDisconnected(true);
        return;
      }
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 120));
        const state = await parent.network().catch(() => undefined);
        if (!state || state.changing) continue;
        setValue(state);
        setFailed(state.failed || state.enabled !== enabled);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  if (disconnected) return <p role="status">{t("network.disabledOnTablet")}</p>;
  return (
    <>
      <h1>{t("network.title")}</h1>
      <p>{t("network.description")}</p>
      {value ? (
        <>
          <label className="pp-parent__check">
            <input
              type="checkbox"
              checked={value.enabled}
              disabled={busy}
              onChange={(event) => void change(event.target.checked)}
            />
            {t("network.enable")}
          </label>
          {value.enabled &&
            (value.devices.length ? (
              <ul className="pp-network__devices">
                {value.devices.map(({ url, qr }) => (
                  <li key={url}>
                    <img
                      src={qr}
                      alt={t("network.qr", { url })}
                      width={160}
                      height={160}
                    />
                    <a href={url}>{url}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("network.noAddresses")}</p>
            ))}
        </>
      ) : (
        !failed && <p role="status">{t("parent.loading")}</p>
      )}
      {busy && <p role="status">{t("network.changing")}</p>}
      {failed && <p role="alert">{t("network.failed")}</p>}
    </>
  );
}
