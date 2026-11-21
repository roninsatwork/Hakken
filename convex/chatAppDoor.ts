import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { EYE_BUILDERS } from "./chatAppEyes";
import { runTool } from "./chatAppTools";
import { OPEN_HEADERS, json } from "./chatAppsHttp";
import { CHART_VIEW_HTML } from "./utils/chatAppChartView";
import {
  CHART_VIEW_MIME,
  CHART_VIEW_URI,
  RPC,
  type RpcRequest,
  SERVER_CAPABILITIES,
  serverInfo,
  serverInstructions,
  SUPPORTED_VERSIONS,
  eraOf,
  toolsFor,
  isNotification,
  parseRpc,
  rpcError,
  rpcResult,
  toolAnswer,
} from "./utils/chatAppMcp";
import { publicOrigin, unauthorizedHeader } from "./utils/chatApps";

/**
 * Ask Hakken in ChatGPT and Claude: the MCP door, `/mcp`
 * (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, phase 2).
 * Streamable HTTP, answered in plain JSON, keeping no session.
 *
 * Every request, first: the pass, the person, the company, the switch and the
 * person's limit (`chatAppPasses.checkPassInternal`). No pass, or a pass that
 * no longer works, gets a 401 that points the app at the sign-in, which is the
 * only thing that starts it (Claude starts sign-in on a 401 and nothing else).
 * Then the request is answered for the pass's company, and each tool's question
 * goes in the log.
 */

const MOST_BODY = 256 * 1024;

const refusalWords = {
  switchedOff: "Linking ChatGPT and Claude is switched off for this company.",
  tooMany: "Too many questions in a minute. Wait a moment, then ask again.",
} as const;

function answer(body: unknown, status: number, version?: string): Response {
  return json(body, status, version ? { "MCP-Protocol-Version": version } : {});
}

export const handleMcp = httpAction(async (ctx, request) => {
  const origin = publicOrigin(process.env.SITE_URL);
  const pass = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!pass) {
    return json({ error: "invalid_token", error_description: "Sign in from the app first." }, 401, { "WWW-Authenticate": unauthorizedHeader(origin) });
  }
  const check = await ctx.runMutation(internal.chatAppPasses.checkPassInternal, { accessPass: pass });
  if (!check.ok) {
    if (check.status === 401) {
      return json({ error: "invalid_token", error_description: "This pass has run out or been cut off. Sign in again from the app." }, 401, { "WWW-Authenticate": unauthorizedHeader(origin, "invalid_token") });
    }
    const why = check.why === "tooMany" ? "tooMany" : "switchedOff";
    await ctx.runMutation(internal.chatAppPasses.logQuestionInternal, { ...(check.grantId ? { grantId: check.grantId } : {}), method: "refused", outcome: "refused", reason: why });
    return json({ error: why === "tooMany" ? "rate_limited" : "access_denied", error_description: refusalWords[why] }, check.status, why === "tooMany" ? { "Retry-After": "60" } : {});
  }

  const text = (await request.text()).slice(0, MOST_BODY);
  const parsed = parseRpc(text);
  if (!parsed.ok) return answer(rpcError(null, parsed.code, parsed.message), 400);
  const rpc: RpcRequest = parsed.request;
  if (isNotification(rpc)) return new Response(null, { status: 202, headers: OPEN_HEADERS });

  const era = eraOf(rpc, request.headers.get("MCP-Protocol-Version"));
  if (!era.ok) return answer(rpcError(rpc.id, era.code, era.message, era.data), era.status);
  const reply = (result: Record<string, unknown>) => answer(rpcResult(rpc.id, result, era.era), 200, era.version);

  switch (rpc.method) {
    case "initialize":
      return reply({ protocolVersion: era.version, capabilities: SERVER_CAPABILITIES, serverInfo: serverInfo(check.platformName), instructions: serverInstructions(check.platformName) });
    case "server/discover":
      return reply({ supportedVersions: [...SUPPORTED_VERSIONS], capabilities: SERVER_CAPABILITIES, serverInfo: serverInfo(check.platformName), instructions: serverInstructions(check.platformName) });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: toolsFor(Object.keys(EYE_BUILDERS)), ...(era.era === "stateless" ? { ttlMs: 60 * 60 * 1000, cacheScope: "public" } : {}) });
    case "resources/list":
      return reply({
        resources: [{ uri: CHART_VIEW_URI, name: "days-chart", title: "Days chart", description: "One figure each day against the dates before.", mimeType: CHART_VIEW_MIME }],
        ...(era.era === "stateless" ? { ttlMs: 60 * 60 * 1000, cacheScope: "public" } : {}),
      });
    case "resources/templates/list":
      return reply({ resourceTemplates: [] });
    case "prompts/list":
      return reply({ prompts: [] });
    case "resources/read": {
      if (rpc.params?.uri !== CHART_VIEW_URI) return answer(rpcError(rpc.id, RPC.invalidParams, "No such resource."), era.era === "stateless" ? 404 : 200, era.version);
      return reply({
        contents: [{
          uri: CHART_VIEW_URI,
          mimeType: CHART_VIEW_MIME,
          text: CHART_VIEW_HTML,
          // Reads nothing from anywhere: every figure comes in the tool's answer.
          _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
        }],
      });
    }
    case "tools/call": {
      const name = typeof rpc.params?.name === "string" ? rpc.params.name : "";
      const args = rpc.params?.arguments && typeof rpc.params.arguments === "object" && !Array.isArray(rpc.params.arguments) ? (rpc.params.arguments as Record<string, unknown>) : {};
      let outcome;
      try {
        outcome = await runTool(ctx, { companyId: check.companyId, origin, platformName: check.platformName }, name, args);
      } catch {
        outcome = { answer: { problem: "That couldn't be read just now. Try again in a moment." }, isError: true, reason: "failed" };
      }
      await ctx.runMutation(internal.chatAppPasses.logQuestionInternal, {
        grantId: check.grantId,
        method: "tools/call",
        tool: name.slice(0, 64),
        ...("detail" in outcome && outcome.detail ? { detail: outcome.detail } : {}),
        ...(outcome.website ? { website: outcome.website } : {}),
        ...(outcome.period ? { period: outcome.period } : {}),
        outcome: outcome.isError || outcome.reason === "switchedOff" ? "refused" : "answered",
        ...(outcome.reason ? { reason: outcome.reason } : {}),
      });
      return reply(toolAnswer(outcome.answer, outcome.isError));
    }
    default:
      return answer(rpcError(rpc.id, RPC.methodNotFound, `There's no method called ${rpc.method.slice(0, 60)}.`), era.era === "stateless" ? 404 : 200, era.version);
  }
});

/** No stream is offered and no session is kept: GET and DELETE are refused, as both eras allow. */
export const handleMcpOther = httpAction(async () => new Response(null, { status: 405, headers: { ...OPEN_HEADERS, Allow: "POST" } }));
