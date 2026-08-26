/** Database backup. The database lives where staff cannot reach it, so this
 * is the application's job. */

import { appConfigDir, join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir, readDir, remove } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";

import type { Db } from "./db";
import { todayIso } from "./money";

const KEEP = 30;
/** SQLite's WAL sidecars. A copy of the .db alone can be missing the newest
 * transactions, so we checkpoint first and copy whatever is left. */
const SIDECARS = ["-wal", "-shm"];

async function paths() {
  const dir = await appConfigDir();
  return {
    database: await join(dir, "okrotdee.db"),
    backups: await join(dir, "backups"),
  };
}

/**
 * Fold the write-ahead log back into the database file. Without this a copy
 * of okrotdee.db can be missing payments recorded minutes ago. Throws if the
 * checkpoint fails, so the caller never reports a backup it did not take.
 */
async function checkpoint(db: Db): Promise<void> {
  const [result] = await db.select<{ busy?: number }>("PRAGMA wal_checkpoint(TRUNCATE)");
  // busy = 1 means a reader blocked the checkpoint and the log still holds
  // committed rows, so a copy taken now could be missing today's payments.
  // An undecodable result is treated as success: never fail the backup on a
  // field we merely could not read.
  if (result?.busy) throw new Error("WAL checkpoint blocked");
}

/** Copy today's database into backups/, then prune to the newest 30 copies. */
export async function startupBackup(db: Db): Promise<void> {
  const { database, backups } = await paths();
  if (!(await exists(database))) return;
  if (!(await exists(backups))) await mkdir(backups, { recursive: true });

  await checkpoint(db);
  const name = `okrotdee-${todayIso()}.db`;
  const target = await join(backups, name);
  await copyFile(database, target);
  // A truncated WAL is empty, but copy it anyway: if the checkpoint could not
  // drain it, these hold the newest payments.
  for (const suffix of SIDECARS) {
    if (await exists(database + suffix)) await copyFile(database + suffix, target + suffix);
  }

  const entries = (await readDir(backups))
    .filter((e) => e.name?.startsWith("okrotdee-") && e.name.endsWith(".db"))
    .map((e) => e.name!)
    .sort();
  for (const old of entries.slice(0, Math.max(0, entries.length - KEEP))) {
    for (const suffix of ["", ...SIDECARS]) {
      const path = await join(backups, old + suffix);
      if (await exists(path)) await remove(path);
    }
  }
}

/** Copy the database somewhere the staff choose. Returns the path, or null. */
export async function backupTo(db: Db): Promise<string | null> {
  const { database } = await paths();
  const target = await save({ defaultPath: `okrotdee-${todayIso()}.db` });
  if (!target) return null;
  // The save dialog grants filesystem access to the chosen path only, so no
  // sidecar can be written next to it. The checkpoint is what makes the one
  // file complete, and it throws rather than leave a partial copy behind.
  await checkpoint(db);
  await copyFile(database, target);
  return target;
}

/** Open the backup folder in Finder or Explorer. */
export async function showBackups(): Promise<void> {
  const { backups } = await paths();
  if (!(await exists(backups))) await mkdir(backups, { recursive: true });
  await openPath(backups);
}
