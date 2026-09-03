import { listGroups } from "../../lib/ops/groups.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type GroupListOptions = { json: boolean };

export async function runGroupList(opts: GroupListOptions): Promise<number> {
  try {
    const groups = await listGroups();
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, groups }));
      return 0;
    }
    if (groups.length === 0) {
      console.log("no groups. a group appears here once one of your lines is added to it.");
      return 0;
    }
    for (const g of groups) {
      // A name Dial could not read is rendered as a dash — never the literal "null",
      // and never the group id standing in for a name, which would read as one.
      const name = g.name ?? "—";
      console.log(`${g.id}  ${name}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
