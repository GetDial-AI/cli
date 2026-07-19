import {
  addTarget,
  removeTarget,
  listTargets,
  targetId,
  LocalTargetError,
  DEFAULT_SIGNATURE_HEADER,
  type LocalTarget,
} from "../local-targets.ts";
import { DialError } from "./errors.ts";

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof LocalTargetError) throw new DialError(err.code, err.message);
    throw err;
  }
}

export function addUrlTarget(opts: {
  url: string;
  secret?: string;
  signatureHeader?: string;
  bearer?: string;
  timeoutSeconds?: number;
}): { added: boolean; url: string } {
  const { added } = wrap(() =>
    addTarget({
      kind: "url",
      url: opts.url,
      secret: opts.secret,
      signatureHeader: opts.signatureHeader ?? (opts.secret ? DEFAULT_SIGNATURE_HEADER : undefined),
      bearer: opts.bearer,
      timeoutSeconds: opts.timeoutSeconds,
    }),
  );
  return { added, url: opts.url };
}

export function addCommandTarget(opts: {
  path: string;
  args?: string[];
  timeoutSeconds?: number;
}): { added: boolean; path: string; args: string[] } {
  const args = opts.args ?? [];
  const { added } = wrap(() =>
    addTarget({ kind: "cmd", path: opts.path, args, timeoutSeconds: opts.timeoutSeconds }),
  );
  return { added, path: opts.path, args };
}

export function removeLocalTarget(id: string): { removed: boolean; id: string } {
  const { removed } = removeTarget(id);
  return { removed, id };
}

export function listLocalTargets(): Array<{
  kind: LocalTarget["kind"];
  id: string;
  target: LocalTarget;
}> {
  return listTargets().map((t) => ({ kind: t.kind, id: targetId(t), target: t }));
}
