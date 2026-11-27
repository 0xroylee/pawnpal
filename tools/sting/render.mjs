// Renders the sting with Playwright. Usage:
//   node tools/sting/render.mjs --stills 40,86,150,230   (PNG stills)
//   node tools/sting/render.mjs --full                   (59.94 fps master frames)
import { createServer } from "node:http";
import { mkdir, readFile, rm } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = fileURLToPath(new URL("./out/", import.meta.url));
const { values } = parseArgs({
  options: {
    stills: { type: "string" },
    full: { type: "boolean" },
    range: { type: "string" },
    scale: { type: "string", default: "1" },
  },
});

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  const path = normalize(
    join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)),
  );
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(path);
    res
      .writeHead(200, {
        "content-type": types[extname(path)] ?? "application/octet-stream",
      })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/tools/sting/sting.html`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1080, height: 1080 },
  deviceScaleFactor: Number(values.scale),
});
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(url);
console.log(JSON.stringify(await page.evaluate(() => window.ready)));
const stage = page.locator("#stage");

async function shot(f, file) {
  // Draw the frame, then wait until the browser has painted it twice, so a
  // heavy frame is never captured stale (a repeated frame followed by a jump).
  await page.evaluate(
    (f) =>
      new Promise((resolve) => {
        window.seek(f);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
    f,
  );
  await stage.screenshot({ path: file, animations: "disabled" });
}

try {
  if (values.stills) {
    await mkdir(join(out, "stills"), { recursive: true });
    for (const f of values.stills.split(",").map(Number)) {
      await shot(f, join(out, "stills", `f${String(f).padStart(3, "0")}.png`));
    }
  }
  if (values.range) {
    // master frames a..b (59.94 fps) for frame-by-frame checks
    const [a, b] = values.range.split(":").map(Number);
    const dir = join(out, "check");
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (let i = a; i <= b; i++)
      await shot(i / 2, join(dir, `${String(i).padStart(4, "0")}.png`));
  }
  if (values.full) {
    const dir = join(out, "frames");
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    // 30.03 s at 60000/1001 is 1800 master frames; each is half a 29.97 frame.
    const count = 1800;
    const t0 = Date.now();
    for (let i = 0; i < count; i++) {
      await shot(i / 2, join(dir, `${String(i).padStart(4, "0")}.png`));
      if (i % 60 === 0)
        console.log(
          `frame ${i}/${count} ${((Date.now() - t0) / 1000).toFixed(0)}s`,
        );
    }
  }
} finally {
  await browser.close();
  server.close();
}
