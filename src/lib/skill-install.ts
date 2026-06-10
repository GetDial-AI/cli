import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_NAME = "dial-cli";

export const SUPPORTED_AGENTS = [
  "claude-code",
  "cursor",
  "codex",
  "opencode",
  "pi",
  "openclaw",
  "nanoclaw",
  "hermes",
] as const;
export type AgentName = (typeof SUPPORTED_AGENTS)[number];

export function isSupportedAgent(name: string): name is AgentName {
  return (SUPPORTED_AGENTS as readonly string[]).includes(name);
}

/**
 * Where SKILL.md lands for each supported agent. Paths follow each tool's
 * documented skill location, verified against the upstream docs:
 *
 *   - claude-code: ~/.claude/skills/<name>/SKILL.md           (docs.claude.com)
 *   - cursor:      ~/.cursor/skills/<name>/SKILL.md           (cursor.com/docs/skills)
 *   - codex:       ~/.agents/skills/<name>/SKILL.md           (developers.openai.com/codex/skills)
 *   - opencode:    ~/.config/opencode/skills/<name>/SKILL.md  (opencode.ai/docs/skills)
 *   - pi:          ~/.pi/agent/skills/<name>/SKILL.md         (pi.dev/docs/latest/skills)
 *   - openclaw:    ~/.openclaw/skills/<name>/SKILL.md         (docs.openclaw.ai/tools/skills-config)
 *   - hermes:      ~/.hermes/skills/<name>/SKILL.md           (hermes-agent.nousresearch.com)
 *   - nanoclaw:    <cwd>/.claude/skills/<name>/SKILL.md       (docs.nanoclaw.dev — project-scoped)
 */
function targetPath(agent: AgentName, home: string, cwd: string): string {
  switch (agent) {
    case "claude-code":
      return join(home, ".claude", "skills", SKILL_NAME, "SKILL.md");
    case "cursor":
      return join(home, ".cursor", "skills", SKILL_NAME, "SKILL.md");
    case "codex":
      return join(home, ".agents", "skills", SKILL_NAME, "SKILL.md");
    case "opencode":
      return join(home, ".config", "opencode", "skills", SKILL_NAME, "SKILL.md");
    case "pi":
      return join(home, ".pi", "agent", "skills", SKILL_NAME, "SKILL.md");
    case "openclaw":
      return join(home, ".openclaw", "skills", SKILL_NAME, "SKILL.md");
    case "hermes":
      return join(home, ".hermes", "skills", SKILL_NAME, "SKILL.md");
    case "nanoclaw":
      return join(cwd, ".claude", "skills", SKILL_NAME, "SKILL.md");
  }
}


function packageRoot(): string {
  // This file resolves to dist/lib/skill-install.js at runtime. The package
  // root is two levels up. During `tsx` (tests / dev), src/lib/... → also two
  // levels up still lands inside cli/.
  const here = fileURLToPath(import.meta.url);
  return resolve(dirname(here), "..", "..");
}

export function tarballPath(): string {
  return join(packageRoot(), "skills.tar.gz");
}

export function readSkillMarkdown(tarball = tarballPath()): string {
  if (!existsSync(tarball)) {
    throw new Error(
      `Dial skill tarball not found at ${tarball}. ` +
        `Re-run \`npm install -g @getdial/cli\` (or, from a checkout, \`npm run build:skill\`).`,
    );
  }
  const tmp = mkdtempSync(join(tmpdir(), "dial-skill-"));
  try {
    execFileSync("tar", ["-xzf", tarball, "-C", tmp], { stdio: "pipe" });
    const skillFile = join(tmp, "skills", SKILL_NAME, "SKILL.md");
    if (!existsSync(skillFile)) {
      throw new Error(`skills.tar.gz does not contain skills/${SKILL_NAME}/SKILL.md (looked in ${tmp})`);
    }
    return readFileSync(skillFile, "utf8");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export type InstallResult = {
  agent: AgentName;
  path: string;
  written: boolean;
  unchanged?: boolean;
};

export type UninstallSkillResult = {
  agent: AgentName;
  /** The skill's directory (`…/skills/dial-cli`), not the SKILL.md inside it. */
  path: string;
  removed: boolean;
};

/** Removes the agent's installed `dial-cli` skill directory, if present. */
export function uninstallSkill(agent: AgentName, opts: { home?: string; cwd?: string } = {}): UninstallSkillResult {
  const home = opts.home ?? process.env.HOME ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const skillDir = dirname(targetPath(agent, home, cwd));
  if (!existsSync(skillDir)) {
    return { agent, path: skillDir, removed: false };
  }
  rmSync(skillDir, { recursive: true, force: true });
  return { agent, path: skillDir, removed: true };
}

export function installSkill(agent: AgentName, opts: { home?: string; cwd?: string } = {}): InstallResult {
  const home = opts.home ?? process.env.HOME ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const body = readSkillMarkdown();
  const path = targetPath(agent, home, cwd);
  mkdirSync(dirname(path), { recursive: true });

  if (existsSync(path)) {
    try {
      const existing = readFileSync(path, "utf8");
      if (existing === body) {
        return { agent, path, written: false, unchanged: true };
      }
    } catch {
      // unreadable existing file — overwrite below
    }
  }

  writeFileSync(path, body, { mode: 0o644 });
  statSync(path);
  return { agent, path, written: true };
}
