import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { addTarget } from "./local-targets.ts";
import { fanout } from "./fanout.ts";

let tmp: string;

function startServer(
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => handler(req, res, Buffer.concat(chunks).toString("utf8")));
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve({ server, port: addr.port });
      else reject(new Error("no port"));
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("fanout url target", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-fanout-"));
    process.env.HOME = tmp;
    delete process.env.XDG_CONFIG_HOME;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("POSTs the event JSON, signs with HMAC, sends bearer, and reports delivered", async () => {
    let received: {
      body: string;
      signature: string | undefined;
      authorization: string | undefined;
    } | null = null;
    const { server, port } = await startServer((req, res, body) => {
      received = {
        body,
        signature: req.headers["x-dial-signature"] as string | undefined,
        authorization: req.headers.authorization as string | undefined,
      };
      res.statusCode = 200;
      res.end("ok");
    });

    try {
      addTarget({
        kind: "url",
        url: `http://127.0.0.1:${port}/dial`,
        secret: "shhh",
        bearer: "tok_123",
      });
      const event = { type: "message.received", body: "hello" };
      const results = await fanout(event, () => {});
      assert.equal(results.length, 1);
      assert.equal(results[0].delivered, true);
      assert.equal(results[0].attempts.length, 1);
      assert.equal(results[0].attempts[0].status, 200);

      assert.ok(received, "expected the server to receive the request");
      assert.equal(received?.body, JSON.stringify(event));
      assert.equal(received?.authorization, "Bearer tok_123");
      const expected = createHmac("sha256", "shhh").update(JSON.stringify(event)).digest("hex");
      assert.equal(received?.signature, expected);
    } finally {
      await close(server);
    }
  });

  it("retries once on non-2xx and reports delivered when the retry succeeds", async () => {
    let calls = 0;
    const { server, port } = await startServer((_req, res) => {
      calls += 1;
      if (calls === 1) {
        res.statusCode = 500;
        res.end("nope");
      } else {
        res.statusCode = 200;
        res.end("ok");
      }
    });

    try {
      addTarget({ kind: "url", url: `http://127.0.0.1:${port}/x` });
      const results = await fanout({ type: "ping" }, () => {});
      assert.equal(calls, 2);
      assert.equal(results[0].delivered, true);
      assert.equal(results[0].attempts.length, 2);
    } finally {
      await close(server);
    }
  });

  it("gives up after exactly two attempts if both fail", async () => {
    let calls = 0;
    const { server, port } = await startServer((_req, res) => {
      calls += 1;
      res.statusCode = 503;
      res.end("down");
    });

    try {
      addTarget({ kind: "url", url: `http://127.0.0.1:${port}/x` });
      const results = await fanout({ type: "ping" }, () => {});
      assert.equal(calls, 2);
      assert.equal(results[0].delivered, false);
      assert.equal(results[0].attempts.length, 2);
    } finally {
      await close(server);
    }
  });
});

describe("fanout cmd target", () => {
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "dial-fanout-cmd-"));
    process.env.HOME = tmp;
    delete process.env.XDG_CONFIG_HOME;
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeHandler(name: string, body: string): string {
    const path = join(tmp, name);
    writeFileSync(path, body, { mode: 0o755 });
    chmodSync(path, 0o755);
    return path;
  }

  it("spawns the executable with extra args, then event JSON as final arg, on success", async () => {
    const outFile = join(tmp, "received.txt");
    const path = writeHandler(
      "handler.sh",
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > ${JSON.stringify(outFile)}\nexit 0\n`,
    );
    addTarget({ kind: "cmd", path, args: ["--label", "x"] });

    const event = { type: "call.ended", id: "c_1" };
    const results = await fanout(event, () => {});
    assert.equal(results[0].delivered, true);
    assert.equal(results[0].attempts.length, 1);

    const { readFileSync } = await import("node:fs");
    const observed = readFileSync(outFile, "utf8").trim().split("\n");
    assert.deepEqual(observed, ["--label", "x", JSON.stringify(event)]);
  });

  it("retries once on non-zero exit, reports delivered when retry succeeds", async () => {
    const counterFile = join(tmp, "calls.txt");
    writeFileSync(counterFile, "0");
    const path = writeHandler(
      "flaky.sh",
      `#!/usr/bin/env bash
n=$(cat ${JSON.stringify(counterFile)})
n=$((n + 1))
echo -n "$n" > ${JSON.stringify(counterFile)}
if [ "$n" -eq 1 ]; then exit 1; fi
exit 0
`,
    );
    addTarget({ kind: "cmd", path });

    const results = await fanout({ type: "ping" }, () => {});
    assert.equal(results[0].delivered, true);
    assert.equal(results[0].attempts.length, 2);
    const { readFileSync } = await import("node:fs");
    assert.equal(readFileSync(counterFile, "utf8"), "2");
  });

  it("gives up after two failed attempts", async () => {
    const path = writeHandler("always-fail.sh", `#!/usr/bin/env bash\nexit 7\n`);
    addTarget({ kind: "cmd", path });
    const results = await fanout({ type: "ping" }, () => {});
    assert.equal(results[0].delivered, false);
    assert.equal(results[0].attempts.length, 2);
    assert.equal(results[0].attempts[0].exitCode, 7);
  });
});
