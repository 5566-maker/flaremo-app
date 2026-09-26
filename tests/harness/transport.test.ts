import { describe, expect, it } from "vitest";
// @ts-expect-error plain-JS modules without types
import { request } from "../../harness/core/transport.mjs";
import { fakeMcpServer, makeEnv, tmpHome } from "./helpers";

describe("transport request", () => {
  it("5xx is unreachable (snapshot fallback / outbox queue territory)", async () => {
    const home = tmpHome();
    const srv = await fakeMcpServer();
    try {
      srv.mode.status = 503;
      const res = await request(
        "memory_compile",
        {},
        {
          env: makeEnv(home, srv.url),
          home,
        },
      );
      expect(res.ok).toBe(false);
      expect(res.unreachable).toBe(true);
      expect(res.status).toBe(503);
    } finally {
      await srv.close();
    }
  });

  it("4xx is a hard error, not unreachable", async () => {
    const home = tmpHome();
    const srv = await fakeMcpServer();
    try {
      srv.mode.status = 400;
      const res = await request(
        "memory_compile",
        {},
        {
          env: makeEnv(home, srv.url),
          home,
        },
      );
      expect(res.ok).toBe(false);
      expect(res.unreachable).toBe(false);
      expect(res.status).toBe(400);

      srv.mode.status = 401;
      const auth = await request(
        "memory_compile",
        {},
        {
          env: makeEnv(home, srv.url),
          home,
        },
      );
      expect(auth.unreachable).toBe(false);
      expect(auth.auth).toBe(true);
    } finally {
      await srv.close();
    }
  });

  it("network failure is unreachable with status 0", async () => {
    const home = tmpHome();
    const res = await request(
      "memory_compile",
      {},
      { env: makeEnv(home, "http://127.0.0.1:1"), home, timeoutMs: 2000 },
    );
    expect(res.ok).toBe(false);
    expect(res.unreachable).toBe(true);
    expect(res.status).toBe(0);
  });
});
