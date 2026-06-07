import { createServer } from "node:http";

/** A route handler: return a response for a request, or undefined for 404. */
export type MockRoute = (
  method: string,
  url: string,
  body: string,
  headers?: Record<string, string | string[] | undefined>,
) => { status: number; json: unknown } | undefined;

/**
 * Spin up a throwaway HTTP server on a random localhost port and return its base URL.
 * Set `process.env.DIAL_API_URL` to it so `lib/api.ts` calls hit the mock. Excluded from
 * the build (see tsconfig); used only by *.test.ts at runtime under tsx.
 */
export async function startMockApi(route: MockRoute): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const r = route(req.method ?? "GET", req.url ?? "/", body, req.headers);
      res.setHeader("content-type", "application/json");
      if (!r) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "no route" }));
        return;
      }
      res.statusCode = r.status;
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
