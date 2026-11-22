/**
 * Ask Hakken in ChatGPT and Claude: Hakken's own address passes the MCP door
 * and its sign-in endpoints through to Convex
 * (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md). The
 * public paths (`/mcp`, `/oauth/token`, `/.well-known/…`) are rewritten here in
 * `next.config.ts`, so an app sees one name for the door, the sign-in and the
 * Allow page. Nothing is decided here: the request goes to Convex as it came,
 * and its answer comes back as it went.
 */

export const dynamic = "force-dynamic";

/** Each door, and the Convex HTTP route behind it (`convex/http.ts`). */
const CHAT_APP_DOORS: Readonly<Record<string, string>> = {
  "protected-resource": "/.well-known/oauth-protected-resource",
  "protected-resource-mcp": "/.well-known/oauth-protected-resource/mcp",
  "authorization-server": "/.well-known/oauth-authorization-server",
  token: "/oauth/token",
  register: "/oauth/register",
  mcp: "/mcp",
};

const ASKED_HEADERS = ["authorization", "content-type", "accept", "mcp-protocol-version", "mcp-method", "mcp-name", "origin"];
const ANSWERED_HEADERS = [
  "content-type", "cache-control", "pragma", "www-authenticate", "mcp-protocol-version",
  "access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers", "access-control-expose-headers", "access-control-max-age",
];
const MOST_BODY_BYTES = 1024 * 1024;

async function limitedBody(request: Request): Promise<ArrayBuffer | null> {
  const claimed = request.headers.get("Content-Length");
  if (claimed !== null && /^\d+$/.test(claimed) && Number(claimed) > MOST_BODY_BYTES) return null;
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MOST_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

function convexSite(): string | null {
  const site = (process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return site || null;
}

async function passThrough(request: Request, door: string): Promise<Response> {
  const path = CHAT_APP_DOORS[door];
  const site = convexSite();
  if (!path) return new Response("Not found", { status: 404 });
  if (!site) return Response.json({ error: "temporarily_unavailable", error_description: "The server isn't set up yet." }, { status: 503 });

  const headers = new Headers();
  for (const name of ASKED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  let body: ArrayBuffer | undefined;
  if (request.method === "POST") {
    const limited = await limitedBody(request);
    if (limited === null) return new Response("Too large", { status: 413 });
    body = limited;
  }
  const answer = await fetch(`${site}${path}`, { method: request.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(60_000) });
  const passed = new Headers();
  for (const name of ANSWERED_HEADERS) {
    const value = answer.headers.get(name);
    if (value !== null) passed.set(name, value);
  }
  return new Response(answer.body, { status: answer.status, headers: passed });
}

type DoorContext = { params: Promise<{ door: string }> };

export async function GET(request: Request, { params }: DoorContext) {
  return await passThrough(request, (await params).door);
}

export async function POST(request: Request, { params }: DoorContext) {
  return await passThrough(request, (await params).door);
}

export async function DELETE(request: Request, { params }: DoorContext) {
  return await passThrough(request, (await params).door);
}

export async function OPTIONS(request: Request, { params }: DoorContext) {
  return await passThrough(request, (await params).door);
}
