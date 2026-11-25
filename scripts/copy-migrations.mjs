import { cp } from "node:fs/promises";

await cp(
  new URL("../src/server/db/migrations", import.meta.url),
  new URL("../dist/server/db/migrations", import.meta.url),
  { recursive: true },
);
