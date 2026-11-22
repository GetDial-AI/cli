import type { Webhook } from "../../lib/ops/webhooks.ts";

const INDENT = "  ";
const LABEL_WIDTH = 11;

function row(label: string, values: string[]): string[] {
  const head = `${INDENT}${`${label}:`.padEnd(LABEL_WIDTH)}`;
  const pad = " ".repeat(head.length);
  return values.map((v, i) => `${i === 0 ? head : pad}${v}`);
}

function eventsOf(w: Webhook): string {
  return w.eventTypes.includes("*") ? "* (every event)" : w.eventTypes.join(", ");
}

function numbersOf(w: Webhook): string {
  if (w.phoneNumberIds === null) return "every number";
  if (w.phoneNumberIds.length === 0) return "none (every number it covered was released)";
  return w.phoneNumberIds.join(", ");
}

function pairs(map: Record<string, string>, separator: string): string[] {
  const entries = Object.entries(map);
  if (entries.length === 0) return ["none"];
  return entries.map(([name, value]) => `${name}${separator}${value}`);
}

/** One webhook as `dial webhook get` / `list` / `create` / `update` print it without `--json`. */
export function formatWebhookDetail(w: Webhook): string {
  return [
    `${w.id}  ${w.targetUrl}`,
    ...row("events", [eventsOf(w)]),
    ...row("numbers", [numbersOf(w)]),
    ...row("headers", pairs(w.headers, ": ")),
    ...row("query", pairs(w.queryParams, "=")),
    ...row("secret", [w.secretMasked]),
    ...row("last ping", [w.lastPingSucceededAt ?? "never"]),
  ].join("\n");
}
