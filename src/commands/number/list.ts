import { listNumbers, type PhoneNumberRow } from "../../lib/ops/numbers.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type NumberListOptions = { json: boolean };

/** One number as `dial number list` prints it without `--json`. */
export function formatNumberLine(n: PhoneNumberRow, defaultNumberId: string | null): string {
  const tag = n.id === defaultNumberId ? "  (default)" : "";
  const nickname = n.nickname ? `  "${n.nickname}"` : "";
  // Marked only when off. `--json` carries callingEnabled either way, but
  // this line is hand-built, so without this the switch would be invisible
  // in the CLI's default output.
  const calling = n.callingEnabled === false ? "  calling:off" : "";
  // Same reasoning: marked only when set, since the default is the AI agent answering.
  const forward = n.forwardTo ? `  forward:${n.forwardTo}` : "";
  // Shown whenever the number has a WhatsApp track, so a warming or failed one is visible.
  const whatsapp = n.whatsapp ? `  whatsapp:${n.whatsapp.status}` : "";
  // A number Dial moved onto a new line: the old E.164 still routes to the live one.
  const replaces = n.replaces?.length ? `  replaces:${n.replaces.map((r) => r.number).join(",")}` : "";
  const replacedBy = n.replacedBy ? `  replaced-by:${n.replacedBy.number}` : "";
  return `${n.number}  id=${n.id}  ${n.country}${nickname}${calling}${forward}${whatsapp}${replaces}${replacedBy}${tag}`;
}

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
    for (const n of numbers) console.log(formatNumberLine(n, defaultNumberId));
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
