import { listNumbers } from "../../lib/ops/numbers.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type NumberListOptions = { json: boolean };

export async function runNumberList(opts: NumberListOptions): Promise<number> {
  try {
    const { numbers, defaultNumberId } = await listNumbers();
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, numbers, defaultNumberId }));
      return 0;
    }
    if (numbers.length === 0) {
      console.log("no phone numbers. provision one with `dial number purchase`.");
      return 0;
    }
    for (const n of numbers) {
      const tag = n.id === defaultNumberId ? "  (default)" : "";
      const nickname = n.nickname ? `  "${n.nickname}"` : "";
      console.log(`${n.number}  id=${n.id}  ${n.country}${nickname}${tag}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
