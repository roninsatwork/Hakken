import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const PUBLIC_API_MAX_BODY_BYTES = 128 * 1024;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

function bodyTooLargeResponse() {
  return jsonResponse({
    ok: false,
    error: `Request body cannot exceed ${PUBLIC_API_MAX_BODY_BYTES} bytes.`,
  }, 413);
}

async function readBoundedJson(request: Request): Promise<
  | { ok: true; payload: unknown }
  | { ok: false; response: Response }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > PUBLIC_API_MAX_BODY_BYTES) {
    return { ok: false, response: bodyTooLargeResponse() };
  }

  if (!request.body) {
    return { ok: false, response: jsonResponse({ ok: false, error: "Invalid JSON request body." }, 400) };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > PUBLIC_API_MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, response: bodyTooLargeResponse() };
      }
      chunks.push(value);
    }

    const bodyBytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
    return { ok: true, payload: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: "Invalid JSON request body." }, 400) };
  } finally {
    reader.releaseLock();
  }
}

export const handlePublicApiPing = httpAction(async (ctx, request) => {
  const auth = await ctx.runMutation(internal.apiKeys.authenticatePublicRequest, {
    apiKey: getBearerToken(request),
    requiredScope: "run:read",
    method: request.method,
    path: new URL(request.url).pathname,
  });

  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.statusCode);
  }

  return jsonResponse({
    ok: true,
    companyId: auth.companyId,
    keyPrefix: auth.keyPrefix,
    scopes: auth.scopes,
    rateLimitPerMinute: auth.rateLimitPerMinute,
  });
});

export const handlePublicRunStatus = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  const auth = await ctx.runMutation(internal.apiKeys.authenticatePublicRequest, {
    apiKey: getBearerToken(request),
    requiredScope: "run:read",
    method: request.method,
    path: url.pathname,
  });

  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.statusCode);
  }

  if (!runId) {
    return jsonResponse({ ok: false, error: "Missing runId query parameter." }, 400);
  }

  const run = await ctx.runQuery(internal.agentRuns.getPublicRunStatusInternal, {
    runId: runId as Id<"agentRuns">,
    companyId: auth.companyId,
  });
  if (!run) {
    return jsonResponse({ ok: false, error: "Run not found." }, 404);
  }

  return jsonResponse({ ok: true, run });
});

export const handlePublicAgentRunTrigger = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const auth = await ctx.runMutation(internal.apiKeys.authenticatePublicRequest, {
    apiKey: getBearerToken(request),
    requiredScope: "agent:run",
    method: request.method,
    path: url.pathname,
  });

  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.statusCode);
  }

  const parsed = await readBoundedJson(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.payload;

  const body = payload && typeof payload === "object" ? payload as { agentId?: unknown; objective?: unknown } : {};
  if (typeof body.agentId !== "string" || !body.agentId.trim()) {
    return jsonResponse({ ok: false, error: "agentId is required." }, 400);
  }
  if (typeof body.objective !== "string" || !body.objective.trim()) {
    return jsonResponse({ ok: false, error: "objective is required." }, 400);
  }

  try {
    const run = await ctx.runMutation(internal.agentRuns.createPublicAgentRunInternal, {
      agentId: body.agentId as Id<"agents">,
      companyId: auth.companyId,
      objective: body.objective,
    });

    return jsonResponse({
      ok: true,
      runId: run.runId,
      status: run.status,
      statusUrl: `/api/public/v1/run-status?runId=${run.runId}`,
    }, 202);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create agent run.",
    }, 400);
  }
});

export const handlePublicWorkflowRunTrigger = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const auth = await ctx.runMutation(internal.apiKeys.authenticatePublicRequest, {
    apiKey: getBearerToken(request),
    requiredScope: "workflow:run",
    method: request.method,
    path: url.pathname,
  });

  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.statusCode);
  }

  const parsed = await readBoundedJson(request);
  if (!parsed.ok) return parsed.response;
  const payload = parsed.payload;

  const body = payload && typeof payload === "object"
    ? payload as { workflowId?: unknown; initialInput?: unknown }
    : {};
  if (typeof body.workflowId !== "string" || !body.workflowId.trim()) {
    return jsonResponse({ ok: false, error: "workflowId is required." }, 400);
  }

  const initialInput = body.initialInput === undefined
    ? undefined
    : typeof body.initialInput === "string"
      ? body.initialInput
      : JSON.stringify(body.initialInput);

  try {
    const run = await ctx.runMutation(internal.workflows.createPublicWorkflowRunInternal, {
      workflowId: body.workflowId as Id<"workflows">,
      companyId: auth.companyId,
      ...(initialInput !== undefined ? { initialInput } : {}),
    });

    return jsonResponse({
      ok: true,
      executionId: run.executionId,
      status: run.status,
    }, 202);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to create workflow run.",
    }, 400);
  }
});
