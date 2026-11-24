import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dashboardUrl } from "./dashboard.ts";
import { CLI_WEBHOOK_VERBS, webhookDashboardHint, webhooksPageUrl } from "./webhook-links.ts";

const PAGE = "https://getdial.ai/dashboard/webhooks";

describe("webhooksPageUrl", () => {
  it("is the dashboard's webhooks page, for production and a trailing-slash base", () => {
    assert.equal(webhooksPageUrl(dashboardUrl("https://api.getdial.ai")), PAGE);
    assert.equal(webhooksPageUrl("https://getdial.ai/dashboard/"), PAGE);
  });
});

describe("webhookDashboardHint", () => {
  it("names the create link and one edit link per webhook", () => {
    const hint = webhookDashboardHint(PAGE, ["wh_1", "wh_2"]);
    assert.ok(hint.includes(`${PAGE}?new=1`));
    assert.ok(hint.includes(`${PAGE}?edit=wh_1`));
    assert.ok(hint.includes(`${PAGE}?edit=wh_2`));
  });

  it("gives a create example whose query carries only public names", () => {
    const example = webhookDashboardHint(PAGE, [], CLI_WEBHOOK_VERBS).match(/Example: (\S+)/)?.[1];
    assert.ok(example);
    const params = new URL(example).searchParams;
    assert.equal(params.get("new"), "1");
    assert.equal(params.get("url"), "https://example.com/dial/webhook");
    assert.deepEqual(params.getAll("event"), ["message.received"]);
    assert.deepEqual(params.getAll("header"), ["Authorization"]);
  });
});
