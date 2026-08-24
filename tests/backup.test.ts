/**
 * The WAL checkpoint is the whole of C2: without it a copy of okroddee.db can
 * be missing payments taken minutes ago. These tests stand in for the Tauri
 * filesystem plugin and assert the checkpoint really runs, and runs first.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const files = new Set<string>(["/config/okroddee.db"]);

vi.mock("@tauri-apps/api/path", () => ({
  appConfigDir: async () => "/config",
  join: async (...parts: string[]) => parts.join("/"),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: async () => "/usb/okroddee-backup.db",
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  copyFile: async (from: string, to: string) => {
    calls.push(`copy ${from} -> ${to}`);
    files.add(to);
  },
  exists: async (path: string) => files.has(path),
  mkdir: async (path: string) => void files.add(path),
  readDir: async () => [...files].map((name) => ({ name: name.split("/").pop()! })),
  remove: async (path: string) => void files.delete(path),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: async () => undefined }));

const { backupTo, startupBackup } = await import("../src/backup");

/** A Db that records every statement it is asked to run. */
function recordingDb(options: { fail?: boolean; busy?: number } = {}) {
  return {
    async select<T>(sql: string): Promise<T[]> {
      calls.push(`sql ${sql}`);
      if (options.fail) throw new Error("database is locked");
      return [{ busy: options.busy ?? 0, log: 0, checkpointed: 0 } as T];
    },
    async execute() {
      return { lastInsertId: 0 };
    },
  };
}

beforeEach(() => {
  calls.length = 0;
  files.clear();
  files.add("/config/okroddee.db");
});

describe("startupBackup", () => {
  it("checkpoints the WAL before copying, so the copy has the newest payments", async () => {
    await startupBackup(recordingDb());
    expect(calls[0]).toBe("sql PRAGMA wal_checkpoint(TRUNCATE)");
    expect(calls[1]).toMatch(/^copy \/config\/okroddee\.db -> \/config\/backups\/okroddee-/);
  });

  it("copies the WAL sidecars when they survive the checkpoint", async () => {
    files.add("/config/okroddee.db-wal");
    files.add("/config/okroddee.db-shm");
    await startupBackup(recordingDb());
    expect(calls.filter((c) => c.endsWith("-wal")).length).toBe(1);
    expect(calls.filter((c) => c.endsWith("-shm")).length).toBe(1);
  });

  it("copies no sidecar the checkpoint has removed", async () => {
    await startupBackup(recordingDb());
    expect(calls.some((c) => c.includes("-wal") || c.includes("-shm"))).toBe(false);
  });

  it("fails loudly instead of writing a backup it cannot vouch for", async () => {
    await expect(startupBackup(recordingDb({ fail: true }))).rejects.toThrow(
      "database is locked",
    );
    expect(calls.some((c) => c.startsWith("copy"))).toBe(false);
  });

  it("refuses to back up a log the checkpoint could not drain", async () => {
    await expect(startupBackup(recordingDb({ busy: 1 }))).rejects.toThrow(
      "WAL checkpoint blocked",
    );
    expect(calls.some((c) => c.startsWith("copy"))).toBe(false);
  });
});

describe("backupTo", () => {
  it("checkpoints before copying to the chosen path", async () => {
    expect(await backupTo(recordingDb())).toBe("/usb/okroddee-backup.db");
    expect(calls).toEqual([
      "sql PRAGMA wal_checkpoint(TRUNCATE)",
      "copy /config/okroddee.db -> /usb/okroddee-backup.db",
    ]);
  });
});
