/** Database backup. The database lives where staff cannot reach it, so this
 * is the application's job. */

import { appConfigDir, join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir, readDir, remove } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";

import { todayIso } from "./money";

const KEEP = 30;

async function paths() {
  const dir = await appConfigDir();
  return {
    database: await join(dir, "okroddee.db"),
    backups: await join(dir, "backups"),
  };
}

/** Copy today's database into backups/, then prune to the newest 30 copies. */
export async function startupBackup(): Promise<void> {
  const { database, backups } = await paths();
  if (!(await exists(database))) return;
  if (!(await exists(backups))) await mkdir(backups, { recursive: true });

  const target = await join(backups, `okroddee-${todayIso()}.db`);
  await copyFile(database, target);

  const entries = (await readDir(backups))
    .filter((e) => e.name?.startsWith("okroddee-") && e.name.endsWith(".db"))
    .map((e) => e.name!)
    .sort();
  for (const name of entries.slice(0, Math.max(0, entries.length - KEEP))) {
    await remove(await join(backups, name));
  }
}

/** Copy the database somewhere the staff choose. Returns the path, or null. */
export async function backupTo(): Promise<string | null> {
  const { database } = await paths();
  const target = await save({ defaultPath: `okroddee-${todayIso()}.db` });
  if (!target) return null;
  await copyFile(database, target);
  return target;
}

/** Open the backup folder in Finder or Explorer. */
export async function showBackups(): Promise<void> {
  const { backups } = await paths();
  if (!(await exists(backups))) await mkdir(backups, { recursive: true });
  await openPath(backups);
}
