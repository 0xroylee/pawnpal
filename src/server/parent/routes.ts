import type { Hono, Context } from "hono";
import { z, type ZodType } from "zod";
import { LibraryFault } from "../db/fault.ts";
import type { Library } from "../db/library.ts";
import { llmSettingsSchema, rephraseSchema } from "../db/schemas.ts";
import type { CoachBrain } from "../llm/brain.ts";
import type { ParentGate } from "./gate.ts";
import { toDataURL } from "qrcode";
import { isLocalRequest, lanUrls, type NetworkMode } from "../network.ts";

export async function jsonBody<T>(
  context: Context,
  schema: ZodType<T>,
): Promise<T> {
  if (
    context.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    throw new LibraryFault(400, "Expected a JSON request");
  const result = schema.safeParse(await context.req.json().catch(() => null));
  if (!result.success) throw new LibraryFault(400, "Invalid request");
  return result.data;
}

const pin = z.string().regex(/^\d{4}$/);
const pinPair = z
  .object({ pin, confirm: pin })
  .refine((input) => input.pin === input.confirm);

export function installParentRoutes(
  api: Hono,
  library: Library,
  gate: ParentGate,
  brain: CoachBrain,
  network?: NetworkMode,
) {
  api.get("/parent/status", (context) =>
    context.json({
      ...gate.status(context),
      setup:
        !library.getSetting("onboarding-done") &&
        !library.listProfiles().length,
    }),
  );
  api.post("/parent/pin", async (context) => {
    if (gate.status(context).pinSet) gate.require(context);
    else if (network && !isLocalRequest(context))
      throw new LibraryFault(
        403,
        "Set the first PIN on the computer running Pawnpal",
      );
    gate.setPin(context, (await jsonBody(context, pinPair)).pin);
    return context.json({ ok: true });
  });
  api.post("/parent/unlock", async (context) => {
    gate.unlock(context, (await jsonBody(context, z.object({ pin }))).pin);
    return context.json({ ok: true });
  });
  api.use("/parent/settings/*", async (context, next) => {
    gate.require(context);
    await next();
  });
  api.get("/parent/settings/data", (context) =>
    context.json({ dataFolder: library.dataFolder }),
  );
  api.post("/parent/settings/finish-setup", (context) => {
    library.setSetting("onboarding-done", "true");
    return context.json({ ok: true });
  });
  api.post("/parent/settings/reset", async (context) => {
    await jsonBody(context, z.object({ confirm: z.literal("RESET") }));
    library.reset();
    brain.reset();
    gate.clear();
    if (network?.current().enabled) network.set(false);
    return context.json({ ok: true });
  });
  api.get("/parent/settings/coach", (context) => {
    const { apiKey, ...settings } = library.getLlmSettings();
    return context.json({
      ...settings,
      hasApiKey: Boolean(apiKey),
      paused: brain.status().paused,
    });
  });
  api.put("/parent/settings/coach", async (context) => {
    const input = await jsonBody(context, llmSettingsSchema);
    if (input.enabled && !input.model)
      throw new LibraryFault(400, "Select a model first");
    library.setSetting("llm", JSON.stringify(brain.configuration(input)));
    brain.reset();
    return context.json({ ok: true });
  });
  api.post("/parent/settings/coach/models", async (context) =>
    context.json(
      await brain.models(await jsonBody(context, llmSettingsSchema)),
    ),
  );
  api.post("/parent/settings/coach/test", async (context) => {
    const input = await jsonBody(context, llmSettingsSchema);
    if (!input.model) throw new LibraryFault(400, "Select a model first");
    return context.json(await brain.test(input));
  });
  api.get("/coach/status", (context) => context.json(brain.status()));
  api.get("/network", (context) =>
    context.json({
      showBanner:
        network?.current().enabled === true && isLocalRequest(context),
    }),
  );
  api.get("/parent/settings/network", async (context) => {
    const state = network?.current();
    const devices = state?.enabled
      ? await Promise.all(
          lanUrls(state.port).map(async (url) => ({
            url,
            qr: await toDataURL(url, { width: 160, margin: 3 }),
          })),
        )
      : [];
    return context.json({
      enabled: state?.enabled ?? false,
      changing: state?.changing ?? false,
      failed: state?.failed ?? false,
      devices,
    });
  });
  api.put("/parent/settings/network", async (context) => {
    if (!network)
      throw new LibraryFault(404, "Network settings are unavailable");
    const { enabled } = await jsonBody(
      context,
      z.object({ enabled: z.boolean() }),
    );
    network.set(enabled);
    return context.json({ ok: true });
  });
  api.post("/coach/rephrase", async (context) =>
    context.json(await brain.phrase(await jsonBody(context, rephraseSchema))),
  );
}
