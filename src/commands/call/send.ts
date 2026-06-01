import { readAuth } from "../../lib/state.ts";
import { apiPost } from "../../lib/api.ts";

type CallRow = {
  id: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  instruction: string | null;
};
type CallResponse = { call: CallRow };

export type CallSendOptions = {
  to: string;
  outboundInstruction: string;
  language: string;
  fromNumberId?: string;
  json: boolean;
};

export async function runCallSend(opts: CallSendOptions): Promise<number> {
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

  const res = await apiPost<CallResponse>(
    "/api/v1/calls",
    {
      to: opts.to,
      fromNumberId,
      outboundInstruction: opts.outboundInstruction,
      language: opts.language,
    },
    auth.apiKey,
  );
  if (!res.ok) {
    fail(opts.json, "call_failed", res.error, { status: res.status });
    return 2;
  }

  const c = res.data.call;
  const waitCmd = `dial wait-for call.ended -f callId=${c.id} --json`;
  const followUpQuestion =
    "Want me to wait for the call to finish and report back (duration, final status, transcript)?";

  if (opts.json) {
    console.log(JSON.stringify({
      ok: true,
      call: c,
      agentHint: {
        action: "ask_user_about_waiting",
        kind: "post_call_followup",
        question: followUpQuestion,
        waitCommand: waitCmd,
        onYes: waitCmd,
        onNo: null,
        useStructuredToolIfAvailable: true,
      },
    }));
  } else {
    console.log(`call initiated.`);
    console.log(`  from:      ${c.from}`);
    console.log(`  to:        ${c.to}`);
    console.log(`  status:    ${c.status}`);
    console.log(`  call id:   ${c.id}`);
    console.log(``);
    console.log(`The call has been dispatched. To learn when it ends (duration, final`);
    console.log(`status, transcript availability), wait for the call.ended event:`);
    console.log(``);
    console.log(`    ${waitCmd}`);
    console.log(``);
    console.log(`Suggestion: ask the user whether they'd like you to wait for the call`);
    console.log(`to finish and report back, e.g.`);
    console.log(``);
    console.log(`    "${followUpQuestion}"`);
    console.log(``);
    console.log(`If yes → run the wait-for above and report when it returns.`);
    console.log(`If no  → you're done; they can run the wait-for themselves later.`);
  }
  return 0;
}

function fail(json: boolean, code: string, message: string, extra?: Record<string, unknown>): void {
  if (json) console.log(JSON.stringify({ ok: false, code, message, ...extra }));
  else console.error(message);
}
