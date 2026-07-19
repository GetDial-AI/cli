import { listTargets, targetId } from "../../lib/local-targets.ts";

export type ListOptions = { json: boolean };

export async function runLocalTargetList(opts: ListOptions): Promise<number> {
  const targets = listTargets();
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, targets }));
    return 0;
  }
  if (targets.length === 0) {
    console.log(
      "no local targets registered. add one with `dial local-target add url <url>` or `dial local-target add cmd <path>`.",
    );
    return 0;
  }
  for (const t of targets) {
    console.log(`${t.kind.padEnd(4)}  ${targetId(t)}`);
  }
  return 0;
}
