import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { request } from "undici";
import {
  type LocalTarget,
  type UrlTarget,
  type CmdTarget,
  DEFAULT_SIGNATURE_HEADER,
  listTargets,
  targetId,
  timeoutMs,
} from "./local-targets.ts";

export type DispatchAttempt = {
  ok: boolean;
  status?: number;
  exitCode?: number | null;
  timedOut?: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
};

export type DispatchResult = {
  target: LocalTarget;
  attempts: DispatchAttempt[];
  delivered: boolean;
};

export type LogFn = (entry: Record<string, unknown>) => void;

const MAX_CAPTURE_BYTES = 4 * 1024;

function clipCapture(buf: Buffer | string): string {
  const s = typeof buf === "string" ? buf : buf.toString("utf8");
  if (s.length <= MAX_CAPTURE_BYTES) return s;
  return s.slice(0, MAX_CAPTURE_BYTES) + `…[truncated, total ${s.length} chars]`;
}

async function attemptUrl(target: UrlTarget, body: string): Promise<DispatchAttempt> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (target.bearer) headers["Authorization"] = `Bearer ${target.bearer}`;
  if (target.secret) {
    const sig = createHmac("sha256", target.secret).update(body).digest("hex");
    headers[target.signatureHeader ?? DEFAULT_SIGNATURE_HEADER] = sig;
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs(target));
  try {
    const res = await request(target.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    return { ok, status: res.statusCode };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, timedOut: true, error: "timeout" };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(t);
  }
}

async function attemptCmd(target: CmdTarget, eventJson: string): Promise<DispatchAttempt> {
  return new Promise<DispatchAttempt>((resolve) => {
    const argv = [...(target.args ?? []), eventJson];
    const child = spawn(target.path, argv, {
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: process.env.HOME ?? "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch { /* already exited */ }
      resolve({
        ok: false,
        timedOut: true,
        error: "timeout",
        stdout: clipCapture(stdout),
        stderr: clipCapture(stderr),
      });
    }, timeoutMs(target));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        error: err.message,
        stdout: clipCapture(stdout),
        stderr: clipCapture(stderr),
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        exitCode: code,
        stdout: clipCapture(stdout),
        stderr: clipCapture(stderr),
      });
    });
  });
}

async function dispatchOne(target: LocalTarget, body: string, eventJson: string): Promise<DispatchResult> {
  const attempts: DispatchAttempt[] = [];
  for (let i = 0; i < 2; i += 1) {
    const attempt = target.kind === "url" ? await attemptUrl(target, body) : await attemptCmd(target, eventJson);
    attempts.push(attempt);
    if (attempt.ok) return { target, attempts, delivered: true };
  }
  return { target, attempts, delivered: false };
}

export async function fanout(event: unknown, log: LogFn): Promise<DispatchResult[]> {
  const targets = listTargets();
  if (targets.length === 0) return [];

  const eventJson = JSON.stringify(event);

  const results = await Promise.all(
    targets.map(async (target) => {
      const result = await dispatchOne(target, eventJson, eventJson);
      log({
        ts: new Date().toISOString(),
        lifecycle: "local_target_dispatch",
        kind: target.kind,
        id: targetId(target),
        delivered: result.delivered,
        attempts: result.attempts,
      });
      return result;
    }),
  );

  return results;
}
