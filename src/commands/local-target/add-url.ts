import { addTarget, LocalTargetError, DEFAULT_SIGNATURE_HEADER } from "../../lib/local-targets.ts";

export type AddUrlOptions = {
  url: string;
  secret?: string;
  signatureHeader?: string;
  bearer?: string;
  timeoutSeconds?: number;
  json: boolean;
};

export async function runLocalTargetAddUrl(opts: AddUrlOptions): Promise<number> {
  try {
    const { added } = addTarget({
      kind: "url",
      url: opts.url,
      secret: opts.secret,
      signatureHeader: opts.signatureHeader ?? (opts.secret ? DEFAULT_SIGNATURE_HEADER : undefined),
      bearer: opts.bearer,
      timeoutSeconds: opts.timeoutSeconds,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, added, url: opts.url }));
    } else {
      console.log(added ? `added url target: ${opts.url}` : `url target already registered: ${opts.url}`);
    }
    return 0;
  } catch (err) {
    const code = err instanceof LocalTargetError ? err.code : "add_failed";
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) console.log(JSON.stringify({ ok: false, code, message }));
    else console.error(`add url failed: ${message}`);
    return 2;
  }
}
