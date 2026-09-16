import { getCall, type TranscriptTurn } from "../../lib/ops/calls.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";

/**
 * A silence long enough to call out. Three seconds is past a natural beat between
 * speakers but short enough to catch an agent thinking too long, which is what
 * anyone reading a transcript for pacing is looking for.
 */
const NOTABLE_PAUSE_MS = 3000;

/** ms from call start → "m:ss.t", the stamp each transcript line carries. */
function formatOffset(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

/**
 * Print the transcript with each turn stamped, and call out the long silences
 * between them. The flat string cannot show a pause, which is the whole reason
 * the timed turns exist.
 */
function printTimedTranscript(turns: TranscriptTurn[]): void {
  console.log(`transcript:`);
  turns.forEach((turn, i) => {
    const previous = turns[i - 1];
    if (previous) {
      const pauseMs = turn.startMs - previous.endMs;
      if (pauseMs >= NOTABLE_PAUSE_MS) {
        console.log(`            ... ${(pauseMs / 1000).toFixed(1)}s pause`);
      }
    }
    const speaker = turn.speaker === "agent" ? "agent " : "person";
    console.log(`  ${formatOffset(turn.startMs).padStart(7)}  ${speaker}  ${turn.text}`);
  });
}

export type CallGetOptions = {
  callId: string;
  json: boolean;
};

export async function runCallGet(opts: CallGetOptions): Promise<number> {
  try {
    const c = await getCall(opts.callId);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, call: c }));
      return 0;
    }
    console.log(`id:         ${c.id}`);
    console.log(`direction:  ${c.direction}`);
    console.log(`from:       ${c.from}`);
    console.log(`to:         ${c.to}`);
    console.log(`status:     ${c.status}`);
    console.log(`duration:   ${c.duration}s`);
    console.log(`created:    ${c.createdAt}`);
    if (c.instruction) {
      console.log(`instruction:`);
      console.log(c.instruction);
    }
    if (c.transcriptTurns?.length) {
      printTimedTranscript(c.transcriptTurns);
    } else if (c.transcript) {
      console.log(`transcript:`);
      console.log(c.transcript);
    }
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(opts.json, e);
    throw e;
  }
}
