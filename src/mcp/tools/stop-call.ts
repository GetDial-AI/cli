import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { stopCall } from "../../lib/ops/calls.ts";
import { callSchema } from "../schemas.ts";

const inputSchema = {
  callId: z.string().min(1).describe("The call id (from place_call or list_calls)"),
};

export const stopCallTool: ToolModule = {
  name: "stop_call",
  config: {
    title: "Stop Call",
    description:
      "End a call that hasn't finished yet. A Queued or Ringing call is cancelled before it " +
      "connects (it ends as `canceled` and isn't charged); an In-Progress call is hung up " +
      "(it ends as `completed`). Returns the call with `status.cancelPending: true` — it " +
      "reaches Terminated a moment later, so use wait_for_event on `call.ended` to confirm. " +
      "Fails if the call has already ended.",
    inputSchema,
    outputSchema: { call: callSchema },
    annotations: { destructiveHint: true, openWorldHint: true },
  },
  run: async (args) => jsonResult({ call: await stopCall(args.callId as string) }),
};
