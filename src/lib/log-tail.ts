import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { matches, type MatchSpec } from "./event-filter.ts";

const POLL_INTERVAL_MS = 200;

export type TailHit = { line: string; obj: Record<string, unknown> };

/**
 * Polls a JSONL file from the given byte offset and resolves with the first
 * parsed line that satisfies `spec`. Returns null on timeout.
 *
 * Designed for the listen daemon's log: append-only, line-delimited JSON,
 * occasionally truncated by `rotateIfLarge` (handled by resetting position).
 */
export async function tailUntilMatch(
  file: string,
  spec: MatchSpec,
  startOffset: number,
  timeoutMs: number,
): Promise<TailHit | null> {
  const deadline = Date.now() + timeoutMs;
  let pos = startOffset;

  while (Date.now() < deadline) {
    const size = currentSize(file);
    if (size < pos) pos = 0; // log rotated
    if (size > pos) {
      const chunk = readRange(file, pos, size - pos);
      pos = size;
      for (const hit of parseLines(chunk)) {
        if (hit && matches(hit.obj, spec)) return hit;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

/**
 * Walks the file from the end backward and returns the most recent line that
 * matches `spec`. Useful as a fallback after a tail timeout.
 */
export function findLatestMatch(file: string, spec: MatchSpec): TailHit | null {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]) as Record<string, unknown>;
      if (matches(obj, spec)) return { line: lines[i], obj };
    } catch { continue; }
  }
  return null;
}

export function currentSize(file: string): number {
  try { return statSync(file).size; } catch { return 0; }
}

function readRange(file: string, offset: number, length: number): string {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, offset);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function parseLines(chunk: string): Array<TailHit | null> {
  return chunk.split("\n").filter(Boolean).map((line) => {
    try { return { line, obj: JSON.parse(line) as Record<string, unknown> }; }
    catch { return null; }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
