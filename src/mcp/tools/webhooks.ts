import { z } from "zod";
import type { ToolModule } from "../tool.ts";
import { jsonResult } from "../result.ts";
import {
  deleteWebhook,
  getWebhook,
  getWebhookSecret,
  listWebhooks,
  patchWebhook,
  pingWebhook,
  postWebhook,
  type WebhookBody,
} from "../../lib/ops/webhooks.ts";
import { baseUrl } from "../../lib/api.ts";
import { dashboardUrl } from "../../lib/dashboard.ts";
import { webhookDashboardHint, webhooksPageUrl } from "../../lib/webhook-links.ts";
import {
  WEBHOOK_DASHBOARD_HINT_DESCRIPTION,
  WEBHOOK_EVENT_TYPES_DESCRIPTION,
  WEBHOOK_ID_DESCRIPTION,
  WEBHOOK_TARGET_URL_DESCRIPTION,
  webhookSchema,
} from "../schemas.ts";

// The seven webhook tools, mirroring the hosted server's (frontend/src/lib/mcp/tools/*-webhook*.ts)
// name for name, input for input and description for description. Kept in one file: each is a
// one-line call to the webhook ops.

const webhookId = z.string().min(1).describe(WEBHOOK_ID_DESCRIPTION);
const stringMap = () => z.record(z.string(), z.string()).nullable().optional();

export const listWebhooksTool: ToolModule = {
  name: "list_webhooks",
  config: {
    title: "List Webhooks",
    description:
      "List the account's webhook subscriptions: each endpoint URL, the event types and numbers it covers, its custom " +
      "headers and query parameters (values masked), and when a ping last succeeded. Also returns a hint with " +
      "dashboard links that create a webhook or edit each one listed, for when the user should enter a secret themselves.",
    inputSchema: {},
    outputSchema: {
      webhooks: z.array(webhookSchema),
      hint: z.string().describe(WEBHOOK_DASHBOARD_HINT_DESCRIPTION),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  run: async () => {
    const webhooks = await listWebhooks();
    return jsonResult({
      webhooks,
      hint: webhookDashboardHint(
        webhooksPageUrl(dashboardUrl(baseUrl())),
        webhooks.map((w) => w.id),
      ),
    });
  },
};

export const getWebhookTool: ToolModule = {
  name: "get_webhook",
  config: {
    title: "Get Webhook",
    description:
      "Get one webhook subscription by id. Also returns a hint with the dashboard links that edit it or create a new " +
      "one, for when the user should enter a secret themselves.",
    inputSchema: { webhookId },
    outputSchema: {
      webhook: webhookSchema,
      hint: z.string().describe(WEBHOOK_DASHBOARD_HINT_DESCRIPTION),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  run: async (args) => {
    const webhook = await getWebhook(args.webhookId as string);
    return jsonResult({
      webhook,
      hint: webhookDashboardHint(webhooksPageUrl(dashboardUrl(baseUrl())), [webhook.id]),
    });
  },
};

export const createWebhookTool: ToolModule = {
  name: "create_webhook",
  config: {
    title: "Create Webhook",
    description:
      "Create a webhook subscription: Dial POSTs matching account events to targetUrl, signed with the webhook's " +
      "secret (X-Dial-Signature) and retried on failure. Returns the webhook, whose id is what get_webhook, " +
      "update_webhook, delete_webhook, ping_webhook and get_webhook_secret take.",
    inputSchema: {
      targetUrl: z.string().url().describe(WEBHOOK_TARGET_URL_DESCRIPTION),
      eventTypes: z.array(z.string()).min(1).describe(WEBHOOK_EVENT_TYPES_DESCRIPTION),
      phoneNumberIds: z
        .array(z.string().min(1))
        .nullable()
        .optional()
        .describe(
          "Ids of the numbers (from list_numbers) whose events this webhook receives. Omit or null for every number on the account.",
        ),
      headers: stringMap().describe(
        'Custom headers sent with every delivery, as {"Name": "value"}, e.g. {"Authorization": "Bearer …"}. Dial\'s own ' +
          "headers (Content-Type, X-Dial-*, Signature*) can't be set. Values are stored encrypted and returned masked.",
      ),
      queryParams: stringMap().describe(
        'Query parameters added to targetUrl on every delivery, as {"key": "value"}. Stored encrypted and returned masked.',
      ),
    },
    outputSchema: { webhook: webhookSchema },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  run: async (args) => jsonResult({ webhook: await postWebhook(args as WebhookBody) }),
};

export const updateWebhookTool: ToolModule = {
  name: "update_webhook",
  config: {
    title: "Update Webhook",
    description:
      "Change a webhook's URL, event types, numbers, custom headers or custom query parameters. Send at least one " +
      "field; fields you omit stay as they are. The signing secret doesn't change. Returns the updated webhook.",
    inputSchema: {
      webhookId,
      targetUrl: z.string().url().optional().describe(WEBHOOK_TARGET_URL_DESCRIPTION),
      eventTypes: z.array(z.string()).min(1).optional().describe(WEBHOOK_EVENT_TYPES_DESCRIPTION),
      phoneNumberIds: z
        .array(z.string().min(1))
        .nullable()
        .optional()
        .describe(
          "Replace the numbers this webhook covers; null covers every number again; omit to keep them.",
        ),
      headers: stringMap().describe(
        "Replaces every custom header with this set; null or {} removes them all; omit to keep them. Stored values are " +
          "never returned, so include every header you want to keep.",
      ),
      queryParams: stringMap().describe(
        "Replaces every custom query parameter with this set; null or {} removes them all; omit to keep them.",
      ),
    },
    outputSchema: { webhook: webhookSchema },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  run: async (args) => {
    const { webhookId: id, ...body } = args;
    return jsonResult({ webhook: await patchWebhook(id as string, body as WebhookBody) });
  },
};

export const deleteWebhookTool: ToolModule = {
  name: "delete_webhook",
  config: {
    title: "Delete Webhook",
    description: "Delete a webhook subscription. Events stop being delivered to its endpoint.",
    inputSchema: { webhookId },
    outputSchema: {
      deleted: z.literal(true).describe("Always true: the webhook no longer exists"),
      webhookId: z.string().describe("Id of the webhook that was deleted"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  run: async (args) => {
    const id = args.webhookId as string;
    await deleteWebhook(id);
    return jsonResult({ deleted: true, webhookId: id });
  },
};

export const pingWebhookTool: ToolModule = {
  name: "ping_webhook",
  config: {
    title: "Ping Webhook",
    description:
      "Send a webhook.ping event to a webhook, regardless of its event types, to check the endpoint is reachable and " +
      "verifies signatures. Delivery is asynchronous: the webhook's lastPingSucceededAt updates once the endpoint " +
      "returns 2xx. Returns the ping's eventId.",
    inputSchema: { webhookId },
    outputSchema: {
      eventId: z
        .string()
        .describe("Id of the webhook.ping event; it arrives as the X-Dial-Event-ID header"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  run: async (args) => jsonResult({ eventId: await pingWebhook(args.webhookId as string) }),
};

export const getWebhookSecretTool: ToolModule = {
  name: "get_webhook_secret",
  config: {
    title: "Get Webhook Secret",
    description:
      "Reveal a webhook's full signing secret (whsec_…), used to verify the X-Dial-Signature header on deliveries.",
    inputSchema: { webhookId },
    outputSchema: { secret: z.string().describe("The full signing secret") },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  run: async (args) => jsonResult({ secret: await getWebhookSecret(args.webhookId as string) }),
};
