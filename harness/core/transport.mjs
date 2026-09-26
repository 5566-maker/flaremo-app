// Non-exiting transport over the /memory/mcp JSON-RPC endpoint.
// request() never calls process.exit — the CLI wrapper maps results onto the
// documented exit-code contract.

import { resolveCredentials } from "./credentials.mjs";
import { flaremoHome } from "./paths.mjs";

export const DEFAULT_TIMEOUT_MS = 8000;
export const HOOK_TIMEOUT_MS = 2500;

/**
 * @returns {Promise<{ok:boolean, status:number, data?:any, unreachable?:boolean, auth?:boolean, toolError?:boolean, error?:string}>}
 */
export async function request(tool, args = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env, home = flaremoHome(env) } = {}) {
  const { url, pat } = resolveCredentials(env, home);
  const endpoint = `${url.replace(/\/+$/, "")}/memory/mcp`;
  const headers = { "Content-Type": "application/json" };
  if (pat) headers.Authorization = `Bearer ${pat}`;

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      unreachable: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const status = res.status;
  let text = "";
  let data = null;
  try {
    text = await res.text();
    data = JSON.parse(text);
  } catch {
    // Non-JSON body: status alone decides the outcome below.
  }

  if (!res.ok) {
    return {
      ok: false,
      status,
      // 5xx = transient server side: callers treat it like a network failure
      // (snapshot fallback for reads, outbox queue for writes). 4xx stays a
      // hard error.
      unreachable: status >= 500,
      auth: status === 401 || status === 403,
      error: `HTTP ${status}: ${text.slice(0, 300)}`,
    };
  }
  if (data?.error) {
    return { ok: false, status, error: `MCP ${data.error.code}: ${data.error.message}` };
  }
  const structured = data?.result?.structuredContent ?? data?.result;
  if (data?.result?.isError || structured?.error) {
    return {
      ok: false,
      status,
      toolError: true,
      error: structured?.error?.message ?? "tool call failed",
    };
  }
  return { ok: true, status, data: structured };
}
