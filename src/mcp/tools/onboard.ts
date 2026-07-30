import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import { onboard } from "../../lib/ops/account.ts";
import { readAuth, authFilePath } from "../../lib/state.ts";
import {
  installSkill,
  isSupportedAgent,
  SUPPORTED_AGENTS,
  type AgentName,
  type InstallResult,
} from "../../lib/skill-install.ts";
import { supervisorAvailability } from "../../lib/supervisor/index.ts";
import { baseUrl } from "../../lib/api.ts";
import { dashboardUrl } from "../../lib/dashboard.ts";

const inputSchema = {
  code: z
    .string()
    .min(1)
    .optional()
    .describe(
      "6-digit OTP from the sign-up email. Omit if the account is already signed in — the tool will just install the requested --agent skills and skip verification.",
    ),
  verificationId: z
    .string()
    .optional()
    .describe("Explicit verification id (defaults to the local pending signup)"),
  inboundInstruction: z
    .string()
    .optional()
    .describe("System prompt for inbound calls to a newly provisioned number (new accounts)"),
  agents: z
    .array(z.string())
    .optional()
    .describe("Agent names to install the Dial skill into (e.g. claude-code, cursor)"),
};

export const onboardTool: ToolModule = {
  name: "onboard",
  config: {
    title: "Onboard",
    description:
      "Verify the sign-up OTP and finish onboarding: saves the API key locally and optionally installs " +
      "the Dial skill into named agents. Returns the account summary (the raw API key is never returned).",
    inputSchema,
    outputSchema: {
      apiKeyFingerprint: z.string().describe("Last 4 chars of the saved API key"),
      apiKeyPath: z.string().describe("Where the key was saved"),
      accountId: z.string(),
      email: z
        .string()
        .nullable()
        .describe(
          "Address that signs in to the dashboard (a code is emailed to it). Null when the CLI never saw the signup — an explicit verificationId. Pass it on to the user: after an agent onboards for them, they usually don't know which address was used.",
        ),
      phoneNumber: z.string().nullable(),
      phoneNumberId: z.string().nullable(),
      dashboardUrl: z
        .string()
        .describe(
          "Where the user manages the account in a browser. Tell them about it once onboarding succeeds, then keep working from the CLI — it's only needed for paying, team sharing, and carrier (10DLC) registration.",
        ),
      skills: z.array(z.object({}).passthrough()).describe("Per-agent skill install results"),
      supervisor: z.object({}).passthrough().describe("Listen daemon availability on this machine"),
      listenAvailable: z.boolean(),
    },
    annotations: { openWorldHint: true },
  },
  run: async (args) => {
    // Skill-install-only branch — mirror runOnboard(): if no --code and we're
    // already signed in, skip verification and just install the requested skills.
    if (!args.code) {
      const auth = readAuth();
      if (!auth) {
        throw new Error(
          "Not signed in. Run `dial signup <email>` first, then invoke this tool with the OTP as `code`.",
        );
      }
      const skills: Array<InstallResult | { agent: string; error: string }> = [];
      for (const requested of (args.agents as string[] | undefined) ?? []) {
        if (!isSupportedAgent(requested)) {
          skills.push({
            agent: requested,
            error: `unknown agent "${requested}". Supported: ${SUPPORTED_AGENTS.join(", ")}.`,
          });
          continue;
        }
        try {
          skills.push(installSkill(requested as AgentName));
        } catch (err) {
          skills.push({
            agent: requested,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const supervisor = supervisorAvailability();
      return jsonResult({
        alreadySignedIn: true,
        apiKeyFingerprint: auth.apiKey.slice(-4),
        apiKeyPath: authFilePath(),
        accountId: auth.accountId,
        // Built by hand rather than spread, so both fields have to be added here
        // explicitly to match the full-onboard path below.
        email: auth.email || null,
        phoneNumber: auth.phoneNumber ?? null,
        phoneNumberId: auth.phoneNumberId ?? null,
        dashboardUrl: dashboardUrl(baseUrl()),
        skills,
        supervisor,
        listenAvailable: supervisor.available,
      });
    }
    const r = await onboard({
      code: args.code as string,
      verificationId: args.verificationId as string | undefined,
      inboundInstruction: args.inboundInstruction as string | undefined,
      agents: args.agents as string[] | undefined,
    });
    // Never surface the raw API key to the model; it's saved to disk for the CLI to read.
    const { apiKey: _omit, ...safe } = r;
    void _omit;
    return jsonResult({
      ...safe,
      listenAvailable: r.supervisor.available,
    });
  },
};
