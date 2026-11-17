import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
export const licenseFiles = [
  {
    source: "design/assets/pieces/horsey/LICENSE.md",
    destination: "licenses/horsey/LICENSE.md",
  },
  {
    source: "design/assets/fonts/OFL-Nunito.txt",
    destination: "licenses/nunito/OFL-Nunito.txt",
  },
] as const;

const horseyLicensePlugin: Plugin = {
  name: "pawnpal-license-copies",
  apply: "build",
  async closeBundle() {
    await Promise.all(
      licenseFiles.map(async ({ source, destination }) => {
        const sourcePath = resolve(repositoryRoot, source);
        const outputPath = resolve(repositoryRoot, "dist/web", destination);
        await mkdir(dirname(outputPath), { recursive: true });
        await copyFile(sourcePath, outputPath);
      }),
    );
  },
};

export default defineConfig({
  root: "src/web",
  publicDir: "../../public",
  plugins: [react(), horseyLicensePlugin],
  server: {
    fs: {
      allow: [repositoryRoot],
    },
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4747",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
});
