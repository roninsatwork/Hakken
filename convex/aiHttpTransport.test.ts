import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { executeRegisteredTool } from "./aiToolExecutionService";
import { HTTP_CONNECTOR_MAX_RESPONSE_BYTES, HTTP_CONNECTOR_TIMEOUT_MS } from "./httpConnectorPolicy";

afterEach(() => vi.unstubAllEnvs());

test("HTTP connectors use the bounded, DNS-pinned action with configured credentials", async () => {
  vi.stubEnv("CONNECTOR_SECRET_TEST_BASE", "https://api.example.com/v1");
  vi.stubEnv("CONNECTOR_SECRET_TEST_AUTH", "Bearer fixture-only");
  const runAction = vi.fn().mockResolvedValue({ status: 404, body: "missing", headers: {} });
  const result = await executeRegisteredTool({
    ctx: {
      runAction, runMutation: vi.fn(),
      runQuery: vi.fn().mockResolvedValue([
        { key: "base_url", providerRef: "test/base" },
        { key: "auth_header", providerRef: "test/auth" },
      ]),
    },
    toolId: "fixture-tool" as Id<"aiTools">,
    handlerMapping: "http.request", args: { method: "GET", path: "/orders" },
  });
  expect(runAction).toHaveBeenCalledWith(internal.outboundHttp.request, expect.objectContaining({
    url: "https://api.example.com/v1/orders", method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer fixture-only" },
    maxResponseBytes: HTTP_CONNECTOR_MAX_RESPONSE_BYTES, timeoutMs: HTTP_CONNECTOR_TIMEOUT_MS,
  }));
  expect(result).toMatchObject({ status: 404, ok: false, body: "missing", truncated: false });
});
