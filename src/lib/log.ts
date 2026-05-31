import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import pino from "pino";

export function appendJsonl(file: string, obj: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(obj) + "\n");
}

export const logger = pino(
  {
    level: process.env.DIAL_LOG_LEVEL ?? "warn",
    base: { name: "dial-cli" },
  },
  pino.transport({
    target: "pino-pretty",
    options: {
      destination: 2, // stderr
      colorize: true,
      translateTime: "SYS:HH:MM:ss.l",
      ignore: "pid,hostname,name",
    },
  })
);

export function rotateIfLarge(file: string, maxBytes: number): void {
  let size = 0;
  try { size = statSync(file).size; } catch { return; }
  if (size <= maxBytes) return;
  const raw = readFileSync(file, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const keep = lines.slice(Math.floor(lines.length / 2));
  writeFileSync(file, keep.join("\n") + "\n");
}
