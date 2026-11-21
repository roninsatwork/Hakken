import { describe, expect, test } from "vitest";
import {
  allowsLocalApps,
  appForReturnAddress,
  appForReturnAddresses,
  authorizationServerDocument,
  documentClientApp,
  isCodeChallenge,
  isOurResource,
  protectedResourceDocument,
  publicOrigin,
  readClientDocument,
  returnAddressWith,
  sameReturnAddress,
  unauthorizedHeader,
  verifierMatches,
} from "./chatApps";

/**
 * Ask Hakken in ChatGPT and Claude: the sign-in rules that need no database
 * (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, "Keeping
 * it secure"). Only ChatGPT and Claude get in, at their own return addresses,
 * matched whole; a test app on a developer's machine only on a local deployment.
 */

const LOCAL = "http://hakken.localhost:3000";
const ONLINE = "https://app.hakken.example";

describe("who may connect", () => {
  test("ChatGPT and Claude, at their own return addresses only", () => {
    expect(appForReturnAddress("https://chatgpt.com/connector_platform_oauth_redirect", ONLINE)).toBe("chatgpt");
    expect(appForReturnAddress("https://claude.ai/api/mcp/auth_callback", ONLINE)).toBe("claude");
  });

  test("a look-alike address is refused, however close", () => {
    for (const address of [
      "https://chatgpt.com/connector_platform_oauth_redirect/extra",
      "https://chatgpt.com/connector_platform_oauth_redirect?next=https://evil.example",
      "http://chatgpt.com/connector_platform_oauth_redirect",
      "https://chatgpt.com.evil.example/connector_platform_oauth_redirect",
      "https://claude.ai/api/mcp/auth_callback2",
      "https://evil.example/api/mcp/auth_callback",
    ]) {
      expect(appForReturnAddress(address, ONLINE), address).toBeNull();
    }
  });

  test("a test app on the developer's own machine, only where the deployment itself is local", () => {
    expect(allowsLocalApps(LOCAL)).toBe(true);
    expect(allowsLocalApps(ONLINE)).toBe(false);
    expect(appForReturnAddress("http://localhost:33418/callback", LOCAL)).toBe("local");
    expect(appForReturnAddress("http://127.0.0.1:6276/oauth/callback", LOCAL)).toBe("local");
    expect(appForReturnAddress("http://localhost:33418/callback", ONLINE)).toBeNull();
    expect(appForReturnAddress("https://localhost/callback", LOCAL)).toBeNull();
  });

  test("one client is one app: addresses pointing at two apps, or none, are refused", () => {
    expect(appForReturnAddresses(["https://claude.ai/api/mcp/auth_callback"], ONLINE)).toBe("claude");
    expect(appForReturnAddresses(["https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector_platform_oauth_redirect"], ONLINE)).toBeNull();
    expect(appForReturnAddresses(["https://claude.ai/api/mcp/auth_callback", "https://evil.example/cb"], ONLINE)).toBeNull();
    expect(appForReturnAddresses([], ONLINE)).toBeNull();
  });

  test("a loopback address may come back on any port, but nothing else may change", () => {
    expect(sameReturnAddress("http://localhost/callback", "http://localhost:3118/callback")).toBe(true);
    expect(sameReturnAddress("http://127.0.0.1/callback", "http://127.0.0.1:6276/callback")).toBe(true);
    expect(sameReturnAddress("http://localhost/callback", "http://localhost:3118/other")).toBe(false);
    expect(sameReturnAddress("http://localhost/callback", "http://127.0.0.1:3118/callback")).toBe(false);
    expect(sameReturnAddress("https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(sameReturnAddress("https://claude.ai/api/mcp/auth_callback", "https://claude.ai:8443/api/mcp/auth_callback")).toBe(false);
  });
});

describe("an app's own published client document", () => {
  test("is read only from the apps' own hosts, over https, at a path", () => {
    expect(documentClientApp("https://chatgpt.com/oauth/client.json")).toBe("chatgpt");
    expect(documentClientApp("https://claude.ai/oauth/mcp-oauth-client-metadata")).toBe("claude");
    for (const id of ["http://chatgpt.com/oauth/client.json", "https://chatgpt.com/", "https://evil.example/oauth/client.json", "https://sub.claude.ai/x", "https://claude.ai:444/x", "hk_client_abc", "https://user:pw@claude.ai/x"]) {
      expect(documentClientApp(id), id).toBeNull();
    }
  });

  test("must name itself at its own address", () => {
    const id = "https://claude.ai/oauth/mcp-oauth-client-metadata";
    expect(readClientDocument(id, { client_id: id, client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] })).toEqual({ name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect(readClientDocument(id, { client_id: "https://evil.example/x", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] })).toBeNull();
    expect(readClientDocument(id, { client_id: id, redirect_uris: [] })).toBeNull();
    expect(readClientDocument(id, "not a document")).toBeNull();
  });
});

describe("PKCE and the resource", () => {
  test("only S256, with a challenge of the right shape", () => {
    expect(isCodeChallenge("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "S256")).toBe(true);
    expect(isCodeChallenge("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "plain")).toBe(false);
    expect(isCodeChallenge("short", "S256")).toBe(false);
  });

  // The pair worked out with Node's own crypto: sha256(verifier), as base64url.
  const VERIFIER = "dBjftJeZ4CVP-mA92IaYEnDHSGcCmP4kuIXr53B2oUo";
  const CHALLENGE = "TbK7F0vvIILGMN5U52pyHeP_ybqapGmnSTqqfdC9lFU";

  test("the verifier's SHA-256, as base64url, is the challenge", async () => {
    expect(await verifierMatches(VERIFIER, CHALLENGE)).toBe(true);
    expect(await verifierMatches(`${VERIFIER.slice(0, -1)}p`, CHALLENGE)).toBe(false);
    expect(await verifierMatches("too short", CHALLENGE)).toBe(false);
  });

  test("a pass is for Hakken's own door, never another server (RFC 8707)", () => {
    expect(isOurResource(undefined, ONLINE)).toBe(true);
    expect(isOurResource(`${ONLINE}/mcp`, ONLINE)).toBe(true);
    expect(isOurResource(`${ONLINE}/mcp/`, ONLINE)).toBe(true);
    expect(isOurResource("https://evil.example/mcp", ONLINE)).toBe(false);
    expect(isOurResource(`${ONLINE}/other`, ONLINE)).toBe(false);
  });
});

describe("the public documents", () => {
  test("say where to sign in, with PKCE, Hakken's own name in every answer and public clients only", () => {
    expect(protectedResourceDocument(ONLINE, "Hakken")).toMatchObject({ resource: `${ONLINE}/mcp`, authorization_servers: [ONLINE], resource_name: "Hakken" });
    const server = authorizationServerDocument(ONLINE);
    expect(server).toMatchObject({
      issuer: ONLINE,
      authorization_endpoint: `${ONLINE}/oauth/authorize`,
      token_endpoint: `${ONLINE}/oauth/token`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  test("the 401 names the document that says where to sign in", () => {
    expect(unauthorizedHeader(ONLINE)).toBe(`Bearer resource_metadata="${ONLINE}/.well-known/oauth-protected-resource", scope="figures:read"`);
    expect(unauthorizedHeader(ONLINE, "invalid_token")).toMatch(/^Bearer error="invalid_token", resource_metadata=/);
  });

  test("the address needs SITE_URL, a bare origin", () => {
    expect(publicOrigin("https://app.hakken.example/")).toBe(ONLINE);
    expect(() => publicOrigin(undefined)).toThrow(/SITE_URL/);
    expect(() => publicOrigin("https://app.hakken.example/path")).toThrow(/SITE_URL/);
  });

  test("the person goes back with the code, the app's own state and Hakken's name", () => {
    const back = new URL(returnAddressWith("https://claude.ai/api/mcp/auth_callback", { code: "c1", state: "s1", iss: ONLINE, error: undefined }));
    expect(Object.fromEntries(back.searchParams)).toEqual({ code: "c1", state: "s1", iss: ONLINE });
  });
});
