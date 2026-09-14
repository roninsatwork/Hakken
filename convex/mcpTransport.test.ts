import { describe, expect, test } from "vitest";
import { resolveServerAuthorization } from "./mcpTransport";

const server = { _id: "server-a", companyId: "company-a", url: "https://tools.example.com/mcp", authMode: "SECRET_REF" as const, secretRef: "vault/acme/mcp" };
const binding = { serverId: server._id, companyId: server.companyId, url: server.url, secretRef: server.secretRef };
const env = { MCP_CREDENTIAL_BINDINGS: JSON.stringify([binding]), CONNECTOR_SECRET_VAULT_ACME_MCP: "test-credential" };

describe("operator-approved MCP credential bindings", () => {
  test("only the bound company, server, URL and reference may use the credential", () => {
    expect(resolveServerAuthorization(server, env)).toEqual({ ok: true, authorization: "Bearer test-credential" });
    for (const change of [
      { companyId: "company-b" }, { _id: "server-b" },
      { url: "https://attacker.example/mcp" }, { url: `${server.url}/other` },
      { url: `${server.url}?forward=elsewhere` }, { secretRef: "vault_acme_mcp" },
    ]) expect(resolveServerAuthorization({ ...server, ...change }, env).ok).toBe(false);
  });
  test.each([undefined, "", "{invalid", "{}", "[null]", "[]"])("fails closed with malformed or missing grants: %s", grants => {
    expect(resolveServerAuthorization(server, { ...env, MCP_CREDENTIAL_BINDINGS: grants }).ok).toBe(false);
  });
  test("an unapproved reference is never resolved", () => {
    const unapproved = { MCP_CREDENTIAL_BINDINGS: "[]", get CONNECTOR_SECRET_VAULT_ACME_MCP(): string { throw new Error("Must not read this key"); } };
    expect(resolveServerAuthorization(server, unapproved).ok).toBe(false);
  });
  test("anonymous servers need no credential grant", () => {
    expect(resolveServerAuthorization({ ...server, authMode: "NONE" }, {})).toEqual({ ok: true });
  });
});
