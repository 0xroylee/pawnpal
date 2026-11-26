import { randomBytes } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";

export function isTempPath(path: string): boolean {
  return /\.tmp-[0-9a-f]{16}$/.test(path);
}

export async function writeFileAtomic(
  path: string,
  data: string | Buffer,
): Promise<void> {
  await writeAtomically(path, async (output) => {
    if (!output.write(data)) await once(output, "drain");
  });
}

export async function writeStreamAtomic(
  path: string,
  fill: (write: (chunk: string) => Promise<void>) => Promise<void>,
): Promise<void> {
  await writeAtomically(path, async (output) => {
    await fill(async (chunk) => {
      if (!output.write(chunk)) await once(output, "drain");
    });
  });
}

async function writeAtomically(
  path: string,
  write: (output: WriteStream) => Promise<void>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${randomBytes(8).toString("hex")}`;
  const output = createWriteStream(temporaryPath, {
    encoding: "utf8",
    flags: "wx",
  });
  const completion = finished(output);

  try {
    await write(output);
    output.end();
    await completion;
    await rename(temporaryPath, path);
  } catch (error) {
    output.destroy();
    await completion.catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}
