/**
 * Where the database is kept. By default it sits beside the application's own
 * settings on this machine, but a shop can put it on an external disk — one
 * drive carried between the office and home, or a drive that is itself the
 * backup. The choice is a plain text file in the configuration directory:
 * Rust reads it at startup to grant the file scope for that drive, so it
 * cannot live in the browser's storage.
 */

import { appConfigDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";

const POINTER = "datadir.txt";

async function pointerPath(): Promise<string> {
  return join(await appConfigDir(), POINTER);
}

/** The folder holding okrotdee.db, chosen or default. */
export async function dataDir(): Promise<string> {
  const pointer = await pointerPath();
  if (await exists(pointer)) {
    const chosen = (await readTextFile(pointer)).trim();
    if (chosen) return chosen;
  }
  return appConfigDir();
}

export async function setDataDir(dir: string): Promise<void> {
  await writeTextFile(await pointerPath(), dir);
}

/** Go back to keeping the data on this machine. */
export async function clearDataDir(): Promise<void> {
  const pointer = await pointerPath();
  if (await exists(pointer)) await remove(pointer);
}
