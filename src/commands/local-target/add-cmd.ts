import { addTarget, LocalTargetError } from "../../lib/local-targets.ts";

export type AddCmdOptions = {
  path: string;
  args: string[];
  timeoutSeconds?: number;
  json: boolean;
};

export async function runLocalTargetAddCmd(opts: AddCmdOptions): Promise<number> {
  try {
    const { added } = addTarget({
      kind: "cmd",
      path: opts.path,
      args: opts.args,
      timeoutSeconds: opts.timeoutSeconds,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, added, path: opts.path, args: opts.args }));
    } else {
      console.log(
        added ? `added cmd target: ${opts.path}` : `cmd target already registered: ${opts.path}`,
      );
    }
    return 0;
  } catch (err) {
    const code = err instanceof LocalTargetError ? err.code : "add_failed";
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) console.log(JSON.stringify({ ok: false, code, message }));
    else console.error(`add cmd failed: ${message}`);
    return 2;
  }
}
