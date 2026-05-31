import { readAuth } from "../../lib/state.ts";
import { apiPost } from "../../lib/api.ts";

type MessageRow = {
  id: string;
  sid: string;
  from: string;
  to: string;
  body: string;
  channel: "sms";
  status: string;
};
type SendResponse = { message: MessageRow };

export type MessageSendOptions = {
  to: string;
  body: string;
  fromNumberId?: string;
  json: boolean;
};

export async function runMessageSend(opts: MessageSendOptions): Promise<number> {
  const auth = readAuth();
  if (!auth) {
    fail(opts.json, "not_signed_in", "Not signed in. Run `dial signup` and `dial onboard` first.");
    return 1;
  }

  const fromNumberId = opts.fromNumberId ?? auth.phoneNumberId;
  if (!fromNumberId) {
    fail(opts.json, "no_from_number", "No default phoneNumberId in auth. Pass --from-number-id <id>.");
    return 1;
  }

  const res = await apiPost<SendResponse>(
    "/api/v1/messages",
    { to: opts.to, body: opts.body, channel: "sms", fromNumberId },
    auth.apiKey,
  );
  if (!res.ok) {
    fail(opts.json, "send_failed", res.error, { status: res.status });
    return 2;
  }

  const m = res.data.message;
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, message: m }));
  } else {
    console.log(`sent.`);
    console.log(`  channel:  ${m.channel}`);
    console.log(`  from:     ${m.from}`);
    console.log(`  to:       ${m.to}`);
    console.log(`  body:     ${m.body}`);
    console.log(`  status:   ${m.status}`);
    console.log(`  sid:      ${m.sid}`);
  }
  return 0;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
