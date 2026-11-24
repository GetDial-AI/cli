import {
  createWebhook,
  deleteWebhook,
  getWebhook,
  getWebhookSecret,
  listWebhooks,
  pingWebhook,
  updateWebhook,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type Webhook,
} from "../../lib/ops/webhooks.ts";
import { isDialError } from "../../lib/ops/errors.ts";
import { printDialError } from "../../lib/cli-error.ts";
import { baseUrl } from "../../lib/api.ts";
import { dashboardUrl } from "../../lib/dashboard.ts";
import {
  CLI_WEBHOOK_VERBS,
  webhookDashboardHint,
  webhooksPageUrl,
} from "../../lib/webhook-links.ts";
import { formatWebhookDetail } from "./format.ts";

// `dial webhook …`: server webhooks that receive account events over HTTPS. Each runner
// prints the webhook it touched (or the list), and every DialError the way the other verbs do.

async function run(json: boolean, body: () => Promise<void>): Promise<number> {
  try {
    await body();
    return 0;
  } catch (e) {
    if (isDialError(e)) return printDialError(json, e);
    throw e;
  }
}

function printWebhook(json: boolean, webhook: Webhook, verb?: string): void {
  if (json) console.log(JSON.stringify({ ok: true, webhook }));
  else {
    if (verb) console.log(`${verb}.`);
    console.log(formatWebhookDetail(webhook));
  }
}

/** The dashboard-links hint `list` and `get` end with (`hint` under --json). */
function hintFor(webhookIds: string[]): string {
  return webhookDashboardHint(
    webhooksPageUrl(dashboardUrl(baseUrl())),
    webhookIds,
    CLI_WEBHOOK_VERBS,
  );
}

export function runWebhookList(opts: { json: boolean }): Promise<number> {
  return run(opts.json, async () => {
    const webhooks = await listWebhooks();
    const hint = hintFor(webhooks.map((w) => w.id));
    if (opts.json) console.log(JSON.stringify({ ok: true, webhooks, hint }));
    else {
      console.log(
        webhooks.length === 0
          ? "no webhooks. add one with `dial webhook create --url <https-url>`."
          : webhooks.map(formatWebhookDetail).join("\n\n"),
      );
      console.log(`\n${hint}`);
    }
  });
}

export function runWebhookGet(opts: { id: string; json: boolean }): Promise<number> {
  return run(opts.json, async () => {
    const webhook = await getWebhook(opts.id);
    const hint = hintFor([webhook.id]);
    if (opts.json) console.log(JSON.stringify({ ok: true, webhook, hint }));
    else console.log(`${formatWebhookDetail(webhook)}\n\n${hint}`);
  });
}

export function runWebhookCreate(opts: CreateWebhookInput & { json: boolean }): Promise<number> {
  return run(opts.json, async () => {
    const webhook = await createWebhook(opts);
    printWebhook(opts.json, webhook, "created");
    if (!opts.json)
      console.log(`verify deliveries with its signing secret: dial webhook secret ${webhook.id}`);
  });
}

export function runWebhookUpdate(
  opts: UpdateWebhookInput & { id: string; json: boolean },
): Promise<number> {
  return run(opts.json, async () =>
    printWebhook(opts.json, await updateWebhook(opts.id, opts), "updated"),
  );
}

export function runWebhookDelete(opts: { id: string; json: boolean }): Promise<number> {
  return run(opts.json, async () => {
    await deleteWebhook(opts.id);
    if (opts.json) console.log(JSON.stringify({ ok: true, deleted: true, webhookId: opts.id }));
    else console.log(`deleted ${opts.id}.`);
  });
}

export function runWebhookSecret(opts: { id: string; json: boolean }): Promise<number> {
  return run(opts.json, async () => {
    const secret = await getWebhookSecret(opts.id);
    console.log(opts.json ? JSON.stringify({ ok: true, secret }) : secret);
  });
}

export function runWebhookPing(opts: { id: string; json: boolean }): Promise<number> {
  return run(opts.json, async () => {
    const eventId = await pingWebhook(opts.id);
    if (opts.json) console.log(JSON.stringify({ ok: true, eventId }));
    else
      console.log(
        `ping sent as ${eventId}. delivery is asynchronous: \`dial webhook get ${opts.id}\` shows the last ping once the endpoint answers 2xx.`,
      );
  });
}
