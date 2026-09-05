import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type LockInfo = { hostname: string; port: number; pid: number };

/** One fixed path in the OS temp dir: every opencode process checks the same file (Design Notes). */
const LOCK_PATH = join(tmpdir(), "opencode-session-viewer.lock");

/** Missing file, invalid JSON, or wrong shape all read as "no lock" rather than throwing. */
export function readLock(): LockInfo | undefined {
  try {
    const raw = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
    if (typeof raw?.hostname === "string" && typeof raw?.port === "number" && typeof raw?.pid === "number") {
      return raw as LockInfo;
    }
  } catch {
    // missing or invalid: no lock
  }
  return undefined;
}

export function writeLock(info: LockInfo): void {
  writeFileSync(LOCK_PATH, JSON.stringify(info));
}

/** Only deletes the file if it still names `pid`, so a stale dispose() can't clobber a newer owner. */
export function releaseLock(pid: number): void {
  if (readLock()?.pid !== pid) return;
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    // already gone
  }
}

/** `process.kill(pid, 0)` probes liveness without signaling; throws ESRCH once the pid is gone. */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
