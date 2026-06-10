import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineVersionedFile } from "./versioned-file.ts";

let tmp: string;

const ThingV2 = z.object({ name: z.string(), count: z.number() });
type Thing = z.infer<typeof ThingV2>;

function plant(name: string, content: unknown, mode = 0o600) {
  writeFileSync(join(tmp, name), JSON.stringify(content), { mode });
}

describe("versioned-file", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-vfile-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function thingFile(version: number, migrations: Record<number, (older: unknown) => unknown> = {}) {
    return defineVersionedFile<Thing>({
      dir: () => tmp,
      base: "thing",
      version,
      schema: ThingV2,
      migrations,
    });
  }

  it("returns null when no version of the file exists", () => {
    assert.equal(thingFile(1).read(), null);
  });

  it("round-trips through the current version's filename", () => {
    const f = thingFile(2);
    f.write({ name: "a", count: 1 });
    assert.equal(f.path, join(tmp, "thing.v2.json"));
    assert.deepEqual(f.read(), { name: "a", count: 1 });
    assert.deepEqual(readdirSync(tmp), ["thing.v2.json"]);
  });

  it("writes 0600 files by default and creates the parent dir", () => {
    const f = defineVersionedFile<Thing>({
      dir: () => join(tmp, "nested"),
      base: "thing",
      version: 1,
      schema: ThingV2,
      migrations: {},
    });
    f.write({ name: "a", count: 1 });
    assert.equal(statSync(join(tmp, "nested", "thing.v1.json")).mode & 0o777, 0o600);
    assert.equal(statSync(join(tmp, "nested")).mode & 0o777, 0o700);
  });

  it("respects a custom file mode", () => {
    const f = defineVersionedFile<Thing>({
      dir: () => tmp,
      base: "thing",
      version: 1,
      schema: ThingV2,
      migrations: {},
      mode: 0o644,
    });
    f.write({ name: "a", count: 1 });
    assert.equal(statSync(join(tmp, "thing.v1.json")).mode & 0o777, 0o644);
  });

  it("adopts the legacy unversioned file as v0 via the first migration", () => {
    plant("thing.json", { name: "legacy", count: 7 });
    const f = thingFile(1, { 0: (x) => x });
    assert.deepEqual(f.read(), { name: "legacy", count: 7 });
    assert.equal(existsSync(join(tmp, "thing.v1.json")), true);
    assert.equal(existsSync(join(tmp, "thing.json")), false);
  });

  it("walks back to the nearest older version and runs the chain forward", () => {
    plant("thing.v1.json", { title: "old", n: 3 });
    const f = thingFile(3, {
      1: (v1) => ({ label: (v1 as { title: string }).title, n: (v1 as { n: number }).n }),
      2: (v2) => ({ name: (v2 as { label: string }).label, count: (v2 as { n: number }).n }),
    });
    assert.deepEqual(f.read(), { name: "old", count: 3 });
    assert.equal(existsSync(join(tmp, "thing.v3.json")), true);
    assert.equal(existsSync(join(tmp, "thing.v1.json")), false);
  });

  it("prefers the nearest version and leaves files it did not migrate from", () => {
    plant("thing.json", { name: "v0", count: 0 });
    plant("thing.v1.json", { name: "v1", count: 1 });
    const f = thingFile(2, { 0: (x) => x, 1: (x) => x });
    assert.deepEqual(f.read(), { name: "v1", count: 1 });
    assert.equal(existsSync(join(tmp, "thing.v1.json")), false);
    assert.equal(existsSync(join(tmp, "thing.json")), true);
  });

  it("returns null and preserves the old file when a migration throws", () => {
    plant("thing.json", { name: "legacy", count: 7 });
    const f = thingFile(1, {
      0: () => {
        throw new Error("boom");
      },
    });
    assert.equal(f.read(), null);
    assert.equal(existsSync(join(tmp, "thing.json")), true);
    assert.equal(existsSync(join(tmp, "thing.v1.json")), false);
  });

  it("returns null and preserves the old file when the migrated value fails the schema", () => {
    plant("thing.json", { name: "legacy", count: 7 });
    const f = thingFile(1, { 0: () => ({ wrong: true }) });
    assert.equal(f.read(), null);
    assert.equal(existsSync(join(tmp, "thing.json")), true);
  });

  it("returns null and preserves the old file when there is no migration for its version", () => {
    plant("thing.v1.json", { name: "v1", count: 1 });
    const f = thingFile(2, {});
    assert.equal(f.read(), null);
    assert.equal(existsSync(join(tmp, "thing.v1.json")), true);
  });

  it("returns null on corrupt JSON at the current version", () => {
    writeFileSync(join(tmp, "thing.v1.json"), "{not json", { mode: 0o600 });
    assert.equal(thingFile(1).read(), null);
  });

  it("returns null on corrupt JSON at an older version without deleting it", () => {
    writeFileSync(join(tmp, "thing.json"), "{not json", { mode: 0o600 });
    const f = thingFile(1, { 0: (x) => x });
    assert.equal(f.read(), null);
    assert.equal(existsSync(join(tmp, "thing.json")), true);
  });

  it("returns null when the current version fails the schema", () => {
    plant("thing.v1.json", { wrong: true });
    assert.equal(thingFile(1).read(), null);
  });

  it("rejects insecure permissions when secure, on current and legacy files", () => {
    const secure = defineVersionedFile<Thing>({
      dir: () => tmp,
      base: "thing",
      version: 1,
      schema: ThingV2,
      migrations: { 0: (x) => x },
      secure: true,
    });
    plant("thing.v1.json", { name: "a", count: 1 });
    chmodSync(join(tmp, "thing.v1.json"), 0o644);
    assert.throws(() => secure.read(), /insecure permissions/);
    rmSync(join(tmp, "thing.v1.json"));
    plant("thing.json", { name: "legacy", count: 7 }, 0o644);
    assert.throws(() => secure.read(), /insecure permissions/);
  });

  it("reads group/other-readable files when not secure", () => {
    plant("thing.v1.json", { name: "a", count: 1 }, 0o644);
    assert.deepEqual(thingFile(1).read(), { name: "a", count: 1 });
  });

  it("leaves no temp file behind after a write", () => {
    const f = thingFile(1);
    f.write({ name: "a", count: 1 });
    assert.deepEqual(readdirSync(tmp), ["thing.v1.json"]);
  });

  it("clear removes the current, older, and legacy files", () => {
    plant("thing.json", { name: "v0", count: 0 });
    plant("thing.v1.json", { name: "v1", count: 1 });
    plant("thing.v2.json", { name: "v2", count: 2 });
    thingFile(2).clear();
    assert.deepEqual(readdirSync(tmp), []);
  });

  it("clear is a no-op when nothing exists", () => {
    thingFile(1).clear();
    assert.equal(existsSync(join(tmp, "thing.v1.json")), false);
  });
});
