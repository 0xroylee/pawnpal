import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true, watch: null, ws: false },
});

try {
  const { runBaseline } = await server.ssrLoadModule("/training/baseline.ts");
  await runBaseline(process.argv.includes("--ollama-no-thinking"));
} finally {
  await server.close();
}
