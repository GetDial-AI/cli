import { createGroup, type GroupNotAdded } from "../../lib/ops/groups.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type GroupCreateOptions = {
  /** The channel to create the group on. Only "whatsapp" today; omitted, the API defaults to it. */
  channel?: string;
  /** Flexible ref: number id, owned E.164, or nickname. Exclusive with fromNumberId. */
  fromNumber?: string;
  /** Defaults to the saved number when neither from flag is given. */
  fromNumberId?: string;
  name?: string;
  participant?: string[];
  json: boolean;
};

/** The API's limits, checked locally so a typo is a flag error rather than a 400. */
const MAX_NAME = 100;
const MAX_PARTICIPANTS = 256;

/** A not-added reason in plain English. An unrecognized reason reads like `not_added`. */
export function notAddedReason(reason: GroupNotAdded["reason"] | string): string {
  return reason === "privacy_restricted"
    ? "their privacy settings only let contacts add them"
    : "they couldn't be added";
}

export async function runGroupCreate(opts: GroupCreateOptions): Promise<number> {
  if (opts.channel !== undefined && opts.channel !== "whatsapp") {
    console.error(
      "error: --channel must be whatsapp (groups can only be created on WhatsApp today).",
    );
    return 2;
  }
  const name = opts.name?.trim() ?? "";
  if (!name) {
    console.error("error: --name is required.");
    return 2;
  }
  if (name.length > MAX_NAME) {
    console.error(`error: --name must be at most ${MAX_NAME} characters.`);
    return 2;
  }
  const participants = opts.participant ?? [];
  if (participants.length === 0) {
    console.error("error: provide at least one --participant <e164>.");
    return 2;
  }
  if (participants.length > MAX_PARTICIPANTS) {
    console.error(`error: at most ${MAX_PARTICIPANTS} --participant are allowed.`);
    return 2;
  }
  try {
    const res = await createGroup({
      ...(opts.channel !== undefined ? { channel: opts.channel } : {}),
      fromNumber: opts.fromNumber,
      fromNumberId: opts.fromNumberId,
      name,
      participants,
    });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, ...res }));
      return 0;
    }
    console.log(`created.`);
    console.log(`  group:    ${res.group.id}`);
    console.log(`  name:     ${res.group.name ?? "—"}`);
    for (const n of res.notAdded) {
      // A participant the line could not name still gets a line — dropping it would
      // read as "everyone was added".
      console.log(`  not added: ${n.number ?? "(unknown number)"} — ${notAddedReason(n.reason)}`);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
