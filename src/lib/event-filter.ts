export type FieldFilter = { name: string; value: string };
export type RegexFilter = { name: string; regex: RegExp };

export function parseFieldArg(input: string): FieldFilter {
  const eq = input.indexOf("=");
  if (eq < 1) throw new Error(`invalid --field "${input}": expected name=value`);
  return { name: input.slice(0, eq), value: input.slice(eq + 1) };
}

export function parseRegexArg(input: string): RegexFilter {
  const eq = input.indexOf("=");
  if (eq < 1) throw new Error(`invalid --regex "${input}": expected name=pattern`);
  const name = input.slice(0, eq);
  const raw = input.slice(eq + 1);
  // Support /pattern/flags as well as bare pattern.
  const m = /^\/(.+)\/([gimsuy]*)$/.exec(raw);
  const regex = m ? new RegExp(m[1], m[2]) : new RegExp(raw);
  return { name, regex };
}

export type MatchSpec = {
  eventType: string;
  fields: FieldFilter[];
  regexes: RegexFilter[];
};

export function matches(obj: unknown, spec: MatchSpec): boolean {
  if (!obj || typeof obj !== "object") return false;
  const record = obj as Record<string, unknown>;
  if (record.type !== spec.eventType) return false;
  // Field/regex filters address the event's `data` payload by name, e.g.
  // `-f channel=sms` matches event.data.channel.
  const data = (record.data ?? {}) as Record<string, unknown>;
  for (const f of spec.fields) {
    if (String(data[f.name] ?? "") !== f.value) return false;
  }
  for (const r of spec.regexes) {
    if (!r.regex.test(String(data[r.name] ?? ""))) return false;
  }
  return true;
}
