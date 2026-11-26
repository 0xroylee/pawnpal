import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true, watch: null, ws: false },
});

try {
  const { runBaseline, runPromptAblation } = await server.ssrLoadModule(
    "/training/baseline.ts",
  );
  if (process.argv.includes("--prompt-ablation")) await runPromptAblation();
  else await runBaseline(process.argv.includes("--ollama-no-thinking"));
} finally {
  await server.close();
}
