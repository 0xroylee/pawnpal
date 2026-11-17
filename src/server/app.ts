import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Hono } from "hono";

export type AppOptions = {
  version: string;
  staticDir: string;
  dev: boolean;
  coi?: boolean;
};

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};

async function fileIfPresent(path: string): Promise<Uint8Array | undefined> {
  try {
    if (!(await stat(path)).isFile()) return undefined;
    return await readFile(path);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

export function createApp({
  version,
  staticDir,
  dev,
  coi = true,
}: AppOptions): Hono {
  const app = new Hono();

  if (coi) {
    app.use("*", async (context, next) => {
      await next();
      context.header("Cross-Origin-Opener-Policy", "same-origin");
      context.header("Cross-Origin-Embedder-Policy", "require-corp");
    });
  }

  app.get("/api/health", (context) => context.json({ ok: true, version, dev }));
  app.all("/api/*", (context) => context.json({ error: "Not found" }, 404));
  app.get("*", async (context) => {
    const root = resolve(staticDir);
    let requestedPath: string;
    try {
      requestedPath = resolve(root, `.${decodeURIComponent(context.req.path)}`);
    } catch {
      return context.text("Not found", 404);
    }

    const contained =
      requestedPath === root || requestedPath.startsWith(`${root}${sep}`);
    const requestedFile = contained
      ? await fileIfPresent(requestedPath)
      : undefined;
    const isFallbackRoute =
      context.req.path === "/" || extname(context.req.path) === "";
    const file =
      requestedFile ??
      (isFallbackRoute
        ? await fileIfPresent(resolve(root, "index.html"))
        : undefined);

    if (!file) return context.text("Not found", 404);
    const servedPath = requestedFile
      ? requestedPath
      : resolve(root, "index.html");
    const type =
      contentTypes[extname(servedPath).toLowerCase()] ??
      "application/octet-stream";
    return context.body(new Uint8Array(file), 200, { "Content-Type": type });
  });

  app.notFound((context) => context.text("Not found", 404));
  return app;
}
