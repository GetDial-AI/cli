import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { addUrlTarget } from "../../lib/ops/local-targets.ts";

const inputSchema = {
  url: z.string().min(1).describe("Loopback HTTP endpoint the listen daemon POSTs each event JSON to"),
  secret: z.string().optional().describe("HMAC-SHA256 key; the daemon signs each request body and sends the hex digest"),
  signatureHeader: z.string().optional().describe("Header for the HMAC signature (default X-Dial-Signature; only with secret)"),
  bearer: z.string().optional().describe("Static bearer token, sent as Authorization: Bearer <token>"),
  timeoutSeconds: z.number().int().positive().optional().describe("Per-attempt timeout (default 5)"),
};

export const addUrlTargetTool: ToolModule = {
  name: "add_url_target",
  config: {
    title: "Add URL Fan-out Target",
    description: "Register a loopback HTTP endpoint the local listen daemon delivers each event to.",
    inputSchema,
    outputSchema: {
      added: z.boolean().describe("False if the target was already registered"),
      url: z.string(),
    },
    annotations: { openWorldHint: false },
  },
  run: async (args) =>
    jsonResult(
      addUrlTarget({
        url: args.url as string,
        secret: args.secret as string | undefined,
        signatureHeader: args.signatureHeader as string | undefined,
        bearer: args.bearer as string | undefined,
        timeoutSeconds: args.timeoutSeconds as number | undefined,
      }),
    ),
};
