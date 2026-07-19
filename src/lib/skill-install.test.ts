import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  installSkill,
  isSupportedAgent,
  readSkillMarkdown,
  SKILL_NAME,
  SUPPORTED_AGENTS,
  uninstallSkill,
} from "./skill-install.ts";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..", "..");
const tarball = join(packageRoot, "skills.tar.gz");
const skillSource = join(packageRoot, "skills", SKILL_NAME, "SKILL.md");

let tmp: string;

describe("skill-install", () => {
  before(() => {
    // Make sure the tarball exists for the install path (build it if needed).
    if (!existsSync(tarball)) {
      execFileSync("tar", ["-czf", tarball, "skills"], { cwd: packageRoot, stdio: "pipe" });
    }
  });

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-skill-install-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("validates supported agent names", () => {
    for (const a of SUPPORTED_AGENTS) assert.equal(isSupportedAgent(a), true);
    assert.equal(isSupportedAgent("not-a-real-agent"), false);
  });

  it("readSkillMarkdown extracts SKILL.md from the tarball and matches the source", () => {
    const extracted = readSkillMarkdown();
    const source = readFileSync(skillSource, "utf8");
    assert.equal(extracted, source);
  });

  it("writes SKILL.md to claude-code's canonical user path", () => {
    const result = installSkill("claude-code", { home: tmp });
    assert.equal(result.written, true);
    assert.equal(result.path, join(tmp, `.claude/skills/${SKILL_NAME}/SKILL.md`));
    assert.equal(readFileSync(result.path, "utf8"), readFileSync(skillSource, "utf8"));
  });

  it("writes SKILL.md to codex's canonical user path (~/.agents/skills/)", () => {
    const result = installSkill("codex", { home: tmp });
    assert.equal(result.path, join(tmp, `.agents/skills/${SKILL_NAME}/SKILL.md`));
    assert.equal(existsSync(result.path), true);
  });

  it("writes SKILL.md to opencode's canonical user path", () => {
    const result = installSkill("opencode", { home: tmp });
    assert.equal(result.path, join(tmp, `.config/opencode/skills/${SKILL_NAME}/SKILL.md`));
  });

  it("writes SKILL.md to pi's canonical user path", () => {
    const result = installSkill("pi", { home: tmp });
    assert.equal(result.path, join(tmp, `.pi/agent/skills/${SKILL_NAME}/SKILL.md`));
  });

  it("writes SKILL.md to openclaw's canonical user path", () => {
    const result = installSkill("openclaw", { home: tmp });
    assert.equal(result.path, join(tmp, `.openclaw/skills/${SKILL_NAME}/SKILL.md`));
  });

  it("writes SKILL.md to <cwd>/.claude/skills/ for nanoclaw (project-scoped)", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "dial-nanoclaw-proj-"));
    try {
      const result = installSkill("nanoclaw", { home: tmp, cwd: projectDir });
      assert.equal(result.path, join(projectDir, `.claude/skills/${SKILL_NAME}/SKILL.md`));
      assert.equal(existsSync(result.path), true);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("writes SKILL.md to hermes's canonical user path", () => {
    const result = installSkill("hermes", { home: tmp });
    assert.equal(result.path, join(tmp, `.hermes/skills/${SKILL_NAME}/SKILL.md`));
  });

  it("writes SKILL.md to cursor's canonical user path (~/.cursor/skills/)", () => {
    const result = installSkill("cursor", { home: tmp });
    assert.equal(result.path, join(tmp, `.cursor/skills/${SKILL_NAME}/SKILL.md`));
  });

  it("reports unchanged on a second install when content matches", () => {
    const first = installSkill("claude-code", { home: tmp });
    assert.equal(first.written, true);
    const second = installSkill("claude-code", { home: tmp });
    assert.equal(second.written, false);
    assert.equal(second.unchanged, true);
  });

  it("rewrites when the existing file has drifted", () => {
    const path = installSkill("claude-code", { home: tmp }).path;
    writeFileSync(path, "OUTDATED");
    const second = installSkill("claude-code", { home: tmp });
    assert.equal(second.written, true);
    assert.notEqual(readFileSync(path, "utf8"), "OUTDATED");
  });

  it("uninstallSkill removes the installed skill directory", () => {
    const installed = installSkill("claude-code", { home: tmp });
    const result = uninstallSkill("claude-code", { home: tmp });
    assert.equal(result.removed, true);
    assert.equal(result.path, dirname(installed.path));
    assert.equal(existsSync(dirname(installed.path)), false);
  });

  it("uninstallSkill reports removed=false when the skill is absent", () => {
    const result = uninstallSkill("cursor", { home: tmp });
    assert.equal(result.removed, false);
    assert.equal(result.path, join(tmp, `.cursor/skills/${SKILL_NAME}`));
    assert.equal(existsSync(result.path), false);
  });

  it("uninstallSkill removes nanoclaw's cwd-scoped skill", () => {
    installSkill("nanoclaw", { home: tmp, cwd: tmp });
    const result = uninstallSkill("nanoclaw", { home: tmp, cwd: tmp });
    assert.equal(result.removed, true);
    assert.equal(result.path, join(tmp, `.claude/skills/${SKILL_NAME}`));
  });
});
