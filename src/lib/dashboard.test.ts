import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dashboardUrl, dashboardHint } from "./dashboard.ts";

describe("dashboardUrl", () => {
  it("drops the api. label from the production API host", () => {
    assert.equal(dashboardUrl("https://api.getdial.ai"), "https://getdial.ai/dashboard");
  });

  it("leaves a local dev base alone apart from the path", () => {
    assert.equal(dashboardUrl("http://localhost:3000"), "http://localhost:3000/dashboard");
  });

  it("does not double the slash when the base has a trailing one", () => {
    assert.equal(dashboardUrl("https://api.getdial.ai/"), "https://getdial.ai/dashboard");
  });

  it("preserves a host with no api. label", () => {
    assert.equal(
      dashboardUrl("https://staging.getdial.ai"),
      "https://staging.getdial.ai/dashboard",
    );
  });

  it("only strips a leading api. LABEL, never a substring", () => {
    // "apiary" starts with "api" but its first label is not "api" — stripping by
    // substring would mangle the host into "ary.example.com".
    assert.equal(
      dashboardUrl("https://apiary.example.com"),
      "https://apiary.example.com/dashboard",
    );
  });
});

describe("dashboardHint", () => {
  const url = "https://getdial.ai/dashboard";

  it("names the address to sign in with when it is known", () => {
    const line = dashboardHint(url, "you@example.com");
    assert.ok(line.includes(url), "carries the dashboard url");
    assert.ok(line.includes("you@example.com"), "carries the sign-in address");
  });

  it("offers only the url when the address is unknown", () => {
    const line = dashboardHint(url, null);
    assert.ok(line.includes(url), "carries the dashboard url");
    assert.ok(!line.includes("@"), "mentions no address at all");
  });
});
