import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const bundledMigrations = fileURLToPath(
  new URL("./migrations", import.meta.url),
);

export function transaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function migrate(
  db: DatabaseSync,
  path: string,
  directory = bundledMigrations,
) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  )`);
  const versionQuery = db.prepare(
    "SELECT coalesce(max(version), 0) AS version FROM schema_migrations",
  );
  for (const name of readdirSync(directory)
    .filter((file) => /^\d{3}-.*\.sql$/.test(file))
    .sort()) {
    const version = Number(name.slice(0, 3));
    if (version <= Number(versionQuery.get()?.version)) continue;
    try {
      transaction(db, () => {
        const previous = Number(versionQuery.get()?.version);
        if (version <= previous) return;
        backup(path, previous);
        db.exec(readFileSync(join(directory, name), "utf8"));
        db.prepare(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        ).run(version, name, new Date().toISOString());
      });
    } catch (error) {
      throw new Error(
        `Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}

function backup(path: string, version: number) {
  // The migration holds the writer lock. Read the committed state, including WAL.
  const filename = `${path}.bak-${version}`;
  const staging = `${filename}.${randomUUID()}.tmp`;
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    source.prepare("VACUUM INTO ?").run(staging);
    renameSync(staging, filename);
  } finally {
    source.close();
    rmSync(staging, { force: true });
  }
}
