import { describe, expect, test } from "vitest";
import {
  buildInitialiseRequest,
  buildToolsListRequest,
  interpretInitialiseResult,
  MCP_MAX_DESCRIPTION_CHARS,
  MCP_PROTOCOL_VERSION,
  normaliseToolsPage,
  readJsonRpcResponse,
} from "./mcpProtocol";

/**
 * Reading what a tool server says.
 *
 * These are the cases a real server will eventually produce and a hostile one
 * would produce deliberately: an answer arriving as a stream rather than an
 * object, a reply to a different question, a tool named something a model
 * provider would reject, a description carrying characters that hide from a
 * reviewer. Each is cheap to test here and expensive to discover in production.
 */

describe("the opening handshake", () => {
  test("declares no client capabilities", () => {
    // `sampling` would let a server ask this platform to run a model on its
    // behalf. Declaring a capability is what invites its use, so none are.
    const request = buildInitialiseRequest(1, "Sonae");
    expect(request.params.capabilities).toEqual({});
    expect(request.params.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(request.jsonrpc).toBe("2.0");
  });

  test("introduces itself by the deployment's own name", () => {
    // A product cloned from this repo and renamed must not tell every server it
    // connects to that it is Sonae.
    expect(buildInitialiseRequest(1, "Northwind Assist").params.clientInfo.name)
      .toBe("Northwind Assist");
  });

  test("accepts a server speaking our version", () => {
    const outcome = interpretInitialiseResult({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "Acme Tools", version: "2.0.0" },
    });

    expect(outcome).toMatchObject({ ok: true, serverName: "Acme Tools", supportsTools: true });
  });

  test("accepts a server that insists on an older version we still speak", () => {
    const outcome = interpretInitialiseResult({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
    });

    expect(outcome.ok).toBe(true);
  });

  test("refuses a version we do not speak, naming it", () => {
    const outcome = interpretInitialiseResult({
      protocolVersion: "1999-01-01",
      capabilities: { tools: {} },
    });

    expect(outcome).toMatchObject({ ok: false });
    if (!outcome.ok) expect(outcome.reason).toContain("1999-01-01");
  });

  test("refuses a server that offers no tools, and says so plainly", () => {
    // Distinct from "this server is broken" — different problem, different fix
    // for whoever connected it.
    const outcome = interpretInitialiseResult({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { resources: {} },
    });

    expect(outcome).toMatchObject({ ok: false, reason: "This server does not offer any tools." });
  });

  test("refuses a server that says nothing about its version", () => {
    expect(interpretInitialiseResult({ capabilities: { tools: {} } }))
      .toMatchObject({ ok: false });
  });
});

describe("reading a reply", () => {
  test("reads a plain JSON answer", () => {
    const outcome = readJsonRpcResponse({
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, result: { tools: [] } }),
      expectedId: 7,
    });

    expect(outcome).toEqual({ ok: true, result: { tools: [] } });
  });

  test("reads an answer delivered as an event stream", () => {
    // The transport lets a server answer either way for the same request, so a
    // client must handle both without being told which to expect.
    const body = [
      "event: message",
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: 7, result: { tools: [] } })}`,
      "",
    ].join("\n");

    expect(readJsonRpcResponse({ contentType: "text/event-stream", body, expectedId: 7 }))
      .toEqual({ ok: true, result: { tools: [] } });
  });

  test("ignores the server's own chatter and finds the answer", () => {
    const body = [
      `data: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/message", params: {} })}`,
      "",
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: 99, result: { other: true } })}`,
      "",
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: 7, result: { tools: [{ ok: 1 }] } })}`,
      "",
    ].join("\n");

    expect(readJsonRpcResponse({ contentType: "text/event-stream", body, expectedId: 7 }))
      .toEqual({ ok: true, result: { tools: [{ ok: 1 }] } });
  });

  test("reassembles a payload split across data lines", () => {
    // The SSE standard joins multi-line data with newlines. A large reply is
    // split by whatever wrote it, so getting the join wrong means every big
    // tool list fails to parse while small ones work — the worst kind of bug.
    const body = [
      'data: {"jsonrpc":"2.0","id":7,',
      'data: "result":{"tools":[]}}',
      "",
    ].join("\n");

    expect(readJsonRpcResponse({ contentType: "text/event-stream", body, expectedId: 7 }))
      .toEqual({ ok: true, result: { tools: [] } });
  });

  test("surfaces a server's refusal as its own message", () => {
    const outcome = readJsonRpcResponse({
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, error: { code: -32602, message: "Unknown method" } }),
      expectedId: 7,
    });

    expect(outcome).toMatchObject({ ok: false });
    if (!outcome.ok) expect(outcome.reason).toContain("Unknown method");
  });

  test("refuses an answer to a different question", () => {
    expect(readJsonRpcResponse({
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, result: {} }),
      expectedId: 7,
    })).toMatchObject({ ok: false });
  });

  test("refuses a body that is not JSON at all", () => {
    // An HTML error page from a proxy is the realistic version of this.
    expect(readJsonRpcResponse({
      contentType: "application/json",
      body: "<html>502 Bad Gateway</html>",
      expectedId: 1,
    })).toMatchObject({ ok: false });
  });

  test("refuses an empty stream", () => {
    expect(readJsonRpcResponse({ contentType: "text/event-stream", body: "", expectedId: 1 }))
      .toMatchObject({ ok: false });
  });
});

describe("reading a tool list", () => {
  const validTool = {
    name: "get_invoice",
    title: "Get an invoice",
    description: "Fetch one invoice by its number.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  };

  test("keeps a well-formed tool, schema intact", () => {
    const page = normaliseToolsPage({ tools: [validTool] });

    expect(page.tools).toHaveLength(1);
    expect(page.tools[0]).toMatchObject({
      name: "get_invoice",
      title: "Get an invoice",
      description: "Fetch one invoice by its number.",
    });
    expect(JSON.parse(page.tools[0].inputSchemaJson)).toEqual(validTool.inputSchema);
    expect(page.rejected).toBe(0);
  });

  test("carries the cursor through so the rest of the list can be fetched", () => {
    expect(normaliseToolsPage({ tools: [validTool], nextCursor: "page-2" }).nextCursor).toBe("page-2");
    expect(normaliseToolsPage({ tools: [validTool] }).nextCursor).toBeUndefined();
  });

  test("drops one bad tool rather than losing the whole page", () => {
    // A rename mid-deploy or a framework omitting a field is common. Refusing
    // forty tools over one helps nobody — but the count must be honest.
    const page = normaliseToolsPage({ tools: [validTool, { name: "no_schema" }, validTool] });

    expect(page.tools).toHaveLength(2);
    expect(page.rejected).toBe(1);
  });

  test("refuses a tool whose name a model provider would reject", () => {
    // Would fail at the moment an agent tried to use it, which is far too late.
    for (const name of ["has spaces", "has.dots", "", "x".repeat(65), "emoji🙂"]) {
      expect(normaliseToolsPage({ tools: [{ ...validTool, name }] }).tools).toHaveLength(0);
    }
  });

  test("refuses a tool with no input schema", () => {
    // Without one there is nothing to validate a model's arguments against.
    const { inputSchema: _drop, ...noSchema } = validTool;
    expect(normaliseToolsPage({ tools: [noSchema] }).tools).toHaveLength(0);
  });

  test("strips control characters from a description", () => {
    // A description that reads harmlessly in a table while carrying something
    // else into a prompt is exactly what this is for.
    const page = normaliseToolsPage({
      tools: [{ ...validTool, description: "Fetch\u0000 an\u001B invoice\u007F." }],
    });

    expect(page.tools[0].description).not.toMatch(/[\u0000-\u001F\u007F]/);
    expect(page.tools[0].description).toContain("invoice");
  });

  test("caps a description rather than letting a server flood a prompt", () => {
    const page = normaliseToolsPage({
      tools: [{ ...validTool, description: "x".repeat(MCP_MAX_DESCRIPTION_CHARS + 500) }],
    });

    expect(page.tools[0].description.length).toBeLessThanOrEqual(MCP_MAX_DESCRIPTION_CHARS + 1);
  });

  test("survives a server sending nonsense in place of a list", () => {
    expect(normaliseToolsPage({}).tools).toHaveLength(0);
    expect(normaliseToolsPage({ tools: "not an array" }).tools).toHaveLength(0);
    expect(normaliseToolsPage({ tools: [null, 42, "x"] }).rejected).toBe(3);
  });
});

describe("asking for the list", () => {
  test("omits the cursor on the first page and includes it afterwards", () => {
    expect(buildToolsListRequest(2).params).toEqual({});
    expect(buildToolsListRequest(3, "page-2").params).toEqual({ cursor: "page-2" });
  });
});
