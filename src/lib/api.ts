import { request } from "undici";
import { logger } from "./log.ts";

const DEFAULT_BASE = "https://dial.up.railway.app";

export function baseUrl(): string {
  return process.env.DIAL_API_URL ?? DEFAULT_BASE;
}

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

export async function apiPost<T>(path: string, body: unknown, apiKey?: string): Promise<ApiResult<T>> {
  return apiRequest<T>("POST", path, body, apiKey);
}

export async function apiGet<T>(path: string, apiKey?: string): Promise<ApiResult<T>> {
  return apiRequest<T>("GET", path, undefined, apiKey);
}

export async function apiPatch<T>(path: string, body: unknown, apiKey?: string): Promise<ApiResult<T>> {
  return apiRequest<T>("PATCH", path, body, apiKey);
}

async function apiRequest<T>(method: "GET" | "POST" | "PATCH", path: string, body: unknown, apiKey?: string): Promise<ApiResult<T>> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  try {
    const res = await request(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.body.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { ok: true, status: res.statusCode, data: parsed as T };
    }
    const errMsg = (parsed as { error?: string } | null)?.error ?? text ?? `HTTP ${res.statusCode}`;
    return { ok: false, status: res.statusCode, error: errMsg };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pingBackend(): Promise<{ reachable: boolean; latencyMs: number | null }> {
  const start = Date.now();
  try {
    const res = await request(`${baseUrl()}/`, { method: "GET" });
    await res.body.dump();
    return { reachable: res.statusCode < 500, latencyMs: Date.now() - start };
  } catch (err) {
    logger.warn({ err, url: baseUrl() }, "backend unreachable");
    return { reachable: false, latencyMs: null };
  }
}
