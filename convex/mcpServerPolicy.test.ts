import { describe, expect, test } from "vitest";
import {
  assertAuthConsistent,
  MCP_SERVER_NAME_MAX_CHARS,
  normaliseServerName,
  normaliseServerUrl,
} from "./mcpServerPolicy";

/**
 * The guards that decide what a company may connect as a tool server.
 *
 * The address checks matter most. A tool server is an outbound request the
 * platform makes on a customer's behalf, so a careless or malicious address is
 * how the platform gets talked into fetching something it should not — its own
 * cloud metadata endpoint being the prize.
 */

describe("tool server names", () => {
  test("trims, so two spellings of one name cannot both exist", () => {
    expect(normaliseServerName("  Finance  ")).toBe("Finance");
  });

  test("refuses an empty or whitespace-only name", () => {
    expect(() => normaliseServerName("")).toThrow("needs a name");
    expect(() => normaliseServerName("   ")).toThrow("needs a name");
  });

  test("refuses a name too long for the screen it appears on", () => {
    expect(() => normaliseServerName("x".repeat(MCP_SERVER_NAME_MAX_CHARS + 1)))
      .toThrow("characters or fewer");
  });

  test("accepts a name exactly at the limit", () => {
    const name = "x".repeat(MCP_SERVER_NAME_MAX_CHARS);
    expect(normaliseServerName(name)).toBe(name);
  });
});

describe("tool server addresses", () => {
  test("accepts an ordinary https address", () => {
    expect(normaliseServerUrl("https://tools.example.com/mcp")).toBe("https://tools.example.com/mcp");
  });

  test("normalises, so the same server cannot be connected twice under two spellings", () => {
    expect(normaliseServerUrl("https://Tools.Example.com")).toBe("https://tools.example.com/");
  });

  test("refuses plain http, which would carry the credential in the open", () => {
    expect(() => normaliseServerUrl("http://tools.example.com")).toThrow("must use https");
  });

  test("refuses an address with credentials baked into it", () => {
    expect(() => normaliseServerUrl("https://user:pass@tools.example.com"))
      .toThrow("must not embed credentials");
  });

  test("refuses the cloud metadata endpoint", () => {
    // The classic server-side request forgery prize: reaching it can yield the
    // deployment's own cloud credentials.
    expect(() => normaliseServerUrl("https://169.254.169.254/latest/meta-data"))
      .toThrow("private network address");
    expect(() => normaliseServerUrl("https://metadata.google.internal/x"))
      .toThrow("internal host");
  });

  test("refuses loopback and private ranges", () => {
    expect(() => normaliseServerUrl("https://127.0.0.1:8080")).toThrow("private network address");
    expect(() => normaliseServerUrl("https://10.0.0.5")).toThrow("private network address");
    expect(() => normaliseServerUrl("https://192.168.1.10")).toThrow("private network address");
    expect(() => normaliseServerUrl("https://172.16.4.4")).toThrow("private network address");
    expect(() => normaliseServerUrl("https://localhost/mcp")).toThrow("internal host");
  });

  test("refuses something that is not a URL at all", () => {
    expect(() => normaliseServerUrl("not a url")).toThrow("not a valid URL");
  });

  test("speaks about a server address, not a connector base URL", () => {
    // The underlying guard is shared with the HTTP connector. Its wording is
    // about connectors, which means nothing to the person on this screen.
    expect(() => normaliseServerUrl("http://tools.example.com")).toThrow("The server address");
  });
});

describe("tool server credentials", () => {
  test("accepts an opaque reference when one is required", () => {
    expect(() => assertAuthConsistent("SECRET_REF", "vault/acme/mcp-token")).not.toThrow();
  });

  test("accepts no reference when none is required", () => {
    expect(() => assertAuthConsistent("NONE")).not.toThrow();
    expect(() => assertAuthConsistent("NONE", "   ")).not.toThrow();
  });

  test("refuses a missing reference on a server that needs one", () => {
    // Otherwise this fails later, at the moment of use, somewhere with no form
    // to correct it in.
    expect(() => assertAuthConsistent("SECRET_REF")).toThrow("needs a credential reference");
  });

  test("refuses a pasted credential in the reference field", () => {
    expect(() => assertAuthConsistent("SECRET_REF", "sk-abcdefghijklmnop"))
      .toThrow("must not contain a raw secret value");
  });

  test("refuses a reference left behind on a server that needs none", () => {
    // Dead configuration that reads as though a credential is protecting
    // something.
    expect(() => assertAuthConsistent("NONE", "vault/acme/mcp-token"))
      .toThrow("Remove the credential reference");
  });
});
