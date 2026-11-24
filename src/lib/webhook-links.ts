// Dashboard links that open the webhook form, for an agent that lacks a secret a webhook needs:
// `<dashboard>/webhooks?new=1&…` opens the create form prefilled, `?edit=<id>&…` opens that
// webhook's edit form. They carry public fields and names only, never a header or query value.
// Documented at https://docs.getdial.ai/documentation/platform/webhooks.
//
// Mirrors the hosted server's frontend/src/lib/webhooks/dashboard-link.ts, so the Local MCP's
// list_webhooks / get_webhook hint matches the remote one word for word. Import-free, like
// dashboard.ts: callers pass the page URL in.

/** What the agent calls to create or change a webhook: MCP tool names, or CLI commands. */
export interface WebhookVerbs {
  create: string;
  update: string;
}

export const MCP_WEBHOOK_VERBS: WebhookVerbs = {
  create: "create_webhook",
  update: "update_webhook",
};

export const CLI_WEBHOOK_VERBS: WebhookVerbs = {
  create: "`dial webhook create`",
  update: "`dial webhook update`",
};

/** The dashboard webhooks page, from the dashboard URL (`dashboardUrl(baseUrl())`). */
export function webhooksPageUrl(dashboard: string): string {
  return `${dashboard.replace(/\/+$/, "")}/webhooks`;
}

/**
 * Next-step guidance returned with list / get: the agent can manage webhooks itself, and when it
 * lacks a secret it offers the user these dashboard links instead of asking for the secret in
 * chat. `webhookIds` get one edit link each.
 */
export function webhookDashboardHint(
  pageUrl: string,
  webhookIds: readonly string[],
  verbs: WebhookVerbs = MCP_WEBHOOK_VERBS,
): string {
  const example = `${pageUrl}?new=1&url=${encodeURIComponent("https://example.com/dial/webhook")}&event=message.received&header=Authorization`;
  const edits = webhookIds.map((id) => `- Edit ${id}: ${pageUrl}?edit=${encodeURIComponent(id)}`);
  return [
    `You can create and change webhooks yourself with ${verbs.create} and ${verbs.update}.`,
    "If a custom header or query parameter needs a secret you don't have (an endpoint token, say), " +
      "don't ask the user to paste it into the chat. Offer them a dashboard link instead; it opens the form " +
      "for them to enter the secret and save:",
    `- New webhook: ${pageUrl}?new=1, plus any of url=<endpoint URL>, event=<event type>, ` +
      "number=<number id>, header=<header name>, query=<query parameter name> to prefill the form " +
      `(repeat a parameter for each value, URL-encode each value). Example: ${example}`,
    ...edits,
    "Add header=<name> or query=<name> to an edit link to open those for the user to fill in. " +
      "Links carry names only: never put a secret value in one.",
  ].join("\n");
}
