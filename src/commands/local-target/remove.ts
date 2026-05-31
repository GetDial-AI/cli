import { removeTarget } from "../../lib/local-targets.ts";

export type RemoveOptions = {
  id: string;
  json: boolean;
};

export async function runLocalTargetRemove(opts: RemoveOptions): Promise<number> {
  const { removed } = removeTarget(opts.id);
  if (opts.json) {
    console.log(JSON.stringify({ ok: removed, removed, id: opts.id }));
  } else if (removed) {
    console.log(`removed: ${opts.id}`);
  } else {
    console.error(`not found: ${opts.id}`);
  }
  return removed ? 0 : 1;
}
