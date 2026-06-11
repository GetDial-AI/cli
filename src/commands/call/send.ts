import { placeCall } from "../../lib/ops/calls.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

export type CallSendOptions = {
  to: string;
  outboundInstruction: string;
  /** Omitted → the server auto-detects from the destination number's country. */
  language?: string;
  voiceGender?: string;
  /** Same key across retries → the server returns the already-placed call instead of dialing again. */
  idempotencyKey?: string;
  fromNumberId?: string;
  json: boolean;
};

export async function runCallSend(opts: CallSendOptions): Promise<number> {
  try {
    const c = await placeCall({
      to: opts.to,
      outboundInstruction: opts.outboundInstruction,
      language: opts.language,
      voiceGender: opts.voiceGender,
      idempotencyKey: opts.idempotencyKey,
      fromNumberId: opts.fromNumberId,
    });

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
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
