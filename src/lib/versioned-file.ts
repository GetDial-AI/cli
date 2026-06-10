import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { logger } from "./log.ts";

/**
 * A structured state file whose schema version is part of its filename:
 * `<base>.v<N>.json`. Reads resolve the current version first, then walk
 * back through older versions down to the legacy unversioned `<base>.json`
 * (treated as v0) and migrate forward. See
 * docs/specs/2026-06-10-cli-uninstall-and-auto-update-design.md §B.
 */
export type VersionedFileOptions<T> = {
  /** Resolved lazily so HOME/XDG overrides apply per call, like paths(). */
  dir: () => string;
  base: string;
  /** Current schema version N; the live file is `<base>.v<N>.json`. */
  version: number;
  /** Schema for the current version. */
  schema: z.ZodSchema<T>;
  /** migrations[k] maps the payload of v_k to v_{k+1}; k=0 is legacy → v1. */
  migrations: Record<number, (older: unknown) => unknown>;
  /** Reject group/other-readable files on read (auth-class files). */
  secure?: boolean;
  /** File mode for writes. */
  mode?: number;
};

export type VersionedFile<T> = {
  read(): T | null;
  write(value: T): void;
  clear(): void;
  /** Absolute path of the current version's file. */
  readonly path: string;
};

const CHMOD_UNSUPPORTED_CODES = new Set(["ENOTSUP", "EOPNOTSUPP", "EPERM"]);

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && CHMOD_UNSUPPORTED_CODES.has(code)) {
      logger.warn({ err, code, path: dir }, "chmod 0700 unsupported, continuing");
      return;
    }
    throw err;
  }
}

function statIfExists(path: string) {
  try {
    return statSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function unlinkIfExists(path: string) {
  try {
    unlinkSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

export function defineVersionedFile<T>(opts: VersionedFileOptions<T>): VersionedFile<T> {
  const mode = opts.mode ?? 0o600;

  /** v0 is the legacy unversioned `<base>.json`. */
  const filePath = (version: number) =>
    join(opts.dir(), version === 0 ? `${opts.base}.json` : `${opts.base}.v${version}.json`);

  function parseAt(path: string): unknown | null {
    if (opts.secure) {
      const fileMode = statSync(path).mode & 0o777;
      if (fileMode & 0o077) {
        throw new Error(`${path} has insecure permissions (mode ${fileMode.toString(8)})`);
      }
    }
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      logger.warn({ err, path }, "failed to parse state file");
      return null;
    }
  }

  function validate(value: unknown, path: string): T | null {
    const result = opts.schema.safeParse(value);
    if (!result.success) {
      logger.warn({ path, issues: result.error.issues }, "state file did not match expected schema");
      return null;
    }
    return result.data;
  }

  function write(value: T): void {
    ensureDir(opts.dir());
    const path = filePath(opts.version);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2), { mode });
    try {
      chmodSync(tmp, mode);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (!code || !CHMOD_UNSUPPORTED_CODES.has(code)) throw err;
      logger.warn({ err, code, path: tmp }, "chmod unsupported, relying on create mode");
    }
    renameSync(tmp, path);
  }

  function migrateFrom(found: number, payload: unknown, foundPath: string): T | null {
    let value = payload;
    for (let step = found; step < opts.version; step++) {
      const migration = opts.migrations[step];
      if (!migration) {
        logger.warn({ path: foundPath, from: step, to: step + 1 }, "no migration registered for state file version");
        return null;
      }
      try {
        value = migration(value);
      } catch (err) {
        logger.warn({ err, path: foundPath, from: step, to: step + 1 }, "state file migration failed");
        return null;
      }
    }
    const migrated = validate(value, foundPath);
    if (migrated === null) return null;
    write(migrated);
    unlinkIfExists(foundPath);
    return migrated;
  }

  function read(): T | null {
    for (let version = opts.version; version >= 0; version--) {
      const path = filePath(version);
      if (!statIfExists(path)) continue;
      const payload = parseAt(path);
      if (payload === null) return null;
      if (version === opts.version) return validate(payload, path);
      return migrateFrom(version, payload, path);
    }
    return null;
  }

  function clear(): void {
    for (let version = opts.version; version >= 0; version--) {
      unlinkIfExists(filePath(version));
    }
  }

  return {
    read,
    write,
    clear,
    get path() {
      return filePath(opts.version);
    },
  };
}
