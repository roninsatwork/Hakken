import { describe, expect, test } from "vitest";
import {
  HTTP_CONNECTOR_MAX_RESPONSE_BYTES,
  describeHttpConnectorResponse,
  resolveHttpConnectorBody,
  resolveHttpConnectorTarget,
  truncateHttpConnectorBody,
  validateHttpConnectorBaseUrl,
} from "./httpConnectorPolicy";

/**
 * Outbound HTTP is the most dangerous capability on the platform, so these
 * tests are written as the attacks they prevent rather than as feature checks.
 *
 * The structural defence is that an agent supplies only a method and a path —
 * never a host. These cover what remains: a path trying to escape its base, and
 * a base URL that should never have been configured.
 */

const BASE = "https://api.acme.test/v1/";

describe("the base URL an administrator configures", () => {
  test("accepts a public https endpoint", () => {
    expect(validateHttpConnectorBaseUrl(BASE).ok).toBe(true);
  });

  test("refuses plain http", () => {
    // Requests carry the connector's credential; http hands it to the network.
    expect(validateHttpConnectorBaseUrl("http://api.acme.test/v1/").ok).toBe(false);
  });

  test("refuses the cloud metadata endpoint", () => {
    // The classic SSRF prize: it returns the deployment's own cloud credentials.
    expect(validateHttpConnectorBaseUrl("https://169.254.169.254/latest/meta-data/").ok).toBe(false);
    expect(validateHttpConnectorBaseUrl("https://metadata.google.internal/").ok).toBe(false);
  });

  test("refuses loopback and private network addresses", () => {
    for (const host of [
      "https://127.0.0.1/",
      "https://localhost/",
      "https://10.0.0.5/",
      "https://192.168.1.10/",
      "https://172.16.4.4/",
      "https://100.64.0.1/",
      "https://0.0.0.0/",
    ]) {
      expect(validateHttpConnectorBaseUrl(host), host).toMatchObject({ ok: false });
    }
  });

  test("refuses internal-only hostnames", () => {
    for (const host of [
      "https://printer.local/",
      "https://db.internal/",
      "https://thing.home.arpa/",
    ]) {
      expect(validateHttpConnectorBaseUrl(host), host).toMatchObject({ ok: false });
    }
  });

  test("refuses IPv6 loopback and unique-local addresses", () => {
    expect(validateHttpConnectorBaseUrl("https://[::1]/").ok).toBe(false);
    expect(validateHttpConnectorBaseUrl("https://[fd00::1]/").ok).toBe(false);
    expect(validateHttpConnectorBaseUrl("https://[fe80::1]/").ok).toBe(false);
  });

  test("refuses a URL carrying credentials", () => {
    expect(validateHttpConnectorBaseUrl("https://user:pass@api.acme.test/").ok).toBe(false);
  });

  test("refuses nonsense", () => {
    expect(validateHttpConnectorBaseUrl("not a url").ok).toBe(false);
  });
});

describe("the path an agent supplies", () => {
  test("appends to the configured base", () => {
    const target = resolveHttpConnectorTarget({ baseUrl: BASE, path: "customers/42", method: "get" });
    expect(target).toEqual({ ok: true, url: "https://api.acme.test/v1/customers/42", method: "GET" });
  });

  test("treats a leading slash as relative to the base, not the host root", () => {
    // Otherwise a base scoped to /v1/ would be escapable with "/admin".
    const target = resolveHttpConnectorTarget({ baseUrl: BASE, path: "/customers", method: "GET" });
    expect(target).toMatchObject({ ok: true, url: "https://api.acme.test/v1/customers" });
  });

  test("refuses a full URL pointing somewhere else", () => {
    // The injected-instruction case: "call https://evil.test/collect".
    const target = resolveHttpConnectorTarget({
      baseUrl: BASE,
      path: "https://evil.test/collect",
      method: "GET",
    });
    expect(target).toMatchObject({ ok: false });
  });

  test("refuses a protocol-relative host", () => {
    // Quieter version of the same attack: //evil.test inherits https and lands
    // on another host entirely.
    const target = resolveHttpConnectorTarget({ baseUrl: BASE, path: "//evil.test/collect", method: "GET" });
    expect(target).toMatchObject({ ok: false });
  });

  test("refuses climbing above the scope the administrator granted", () => {
    const target = resolveHttpConnectorTarget({ baseUrl: BASE, path: "../../admin/keys", method: "GET" });
    expect(target).toMatchObject({ ok: false });
  });

  test("refuses a scheme the connector does not speak", () => {
    for (const path of ["file:///etc/passwd", "gopher://x/", "data:text/plain,hi"]) {
      expect(resolveHttpConnectorTarget({ baseUrl: BASE, path, method: "GET" }), path)
        .toMatchObject({ ok: false });
    }
  });

  test("refuses backslashes, which some parsers treat as separators", () => {
    expect(resolveHttpConnectorTarget({ baseUrl: BASE, path: "\\\\evil.test\\x", method: "GET" }))
      .toMatchObject({ ok: false });
  });

  test("does not let a base without a trailing slash be extended sideways", () => {
    // Base https://api.acme.test/v1 plus "2/secrets" must not reach /v12/secrets.
    const target = resolveHttpConnectorTarget({
      baseUrl: "https://api.acme.test/v1",
      path: "2/secrets",
      method: "GET",
    });
    expect(target).toMatchObject({ ok: true, url: "https://api.acme.test/v1/2/secrets" });
  });

  test("refuses an empty path", () => {
    expect(resolveHttpConnectorTarget({ baseUrl: BASE, path: "   ", method: "GET" }))
      .toMatchObject({ ok: false });
  });

  test("allows only known-safe methods", () => {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      expect(resolveHttpConnectorTarget({ baseUrl: BASE, path: "x", method }), method)
        .toMatchObject({ ok: true });
    }
    for (const method of ["TRACE", "CONNECT", "OPTIONS", "PROPFIND"]) {
      expect(resolveHttpConnectorTarget({ baseUrl: BASE, path: "x", method }), method)
        .toMatchObject({ ok: false });
    }
  });

  test("a bad base URL stops the request even if the path is fine", () => {
    expect(resolveHttpConnectorTarget({ baseUrl: "http://10.0.0.1/", path: "x", method: "GET" }))
      .toMatchObject({ ok: false });
  });
});

describe("the request body", () => {
  test("accepts valid JSON on a write", () => {
    expect(resolveHttpConnectorBody({ method: "POST", bodyJson: '{"a":1}' }))
      .toEqual({ ok: true, body: '{"a":1}' });
  });

  test("refuses text that is not JSON", () => {
    // The contract says bodyJson; sending a model's prose as an unknown content
    // type to a customer's API produces something nobody can debug.
    expect(resolveHttpConnectorBody({ method: "POST", bodyJson: "just some text" }).ok).toBe(false);
  });

  test("refuses a body on a GET", () => {
    expect(resolveHttpConnectorBody({ method: "GET", bodyJson: '{"a":1}' }).ok).toBe(false);
  });

  test("refuses an oversized body", () => {
    expect(resolveHttpConnectorBody({ method: "POST", bodyJson: `"${"x".repeat(200_000)}"` }).ok).toBe(false);
  });

  test("allows no body at all", () => {
    expect(resolveHttpConnectorBody({ method: "GET" })).toEqual({ ok: true });
    expect(resolveHttpConnectorBody({ method: "POST" })).toEqual({ ok: true });
  });
});

describe("the response", () => {
  test("refuses to follow a redirect", () => {
    // Following one would let the endpoint forward the request — and the
    // connector's credential with it — somewhere the administrator never scoped.
    expect(describeHttpConnectorResponse({ status: 302 }).ok).toBe(false);
    expect(describeHttpConnectorResponse({ status: 307 }).ok).toBe(false);
  });

  test("accepts ordinary success and error statuses", () => {
    expect(describeHttpConnectorResponse({ status: 200 }).ok).toBe(true);
    // A 404 is information the agent should get, not a transport failure.
    expect(describeHttpConnectorResponse({ status: 404 }).ok).toBe(true);
    expect(describeHttpConnectorResponse({ status: 500 }).ok).toBe(true);
  });

  test("refuses a response too large to hand back", () => {
    expect(describeHttpConnectorResponse({
      status: 200,
      contentLength: HTTP_CONNECTOR_MAX_RESPONSE_BYTES * 2,
    }).ok).toBe(false);
  });

  test("truncates an oversized body rather than flooding the model", () => {
    const result = truncateHttpConnectorBody("x".repeat(HTTP_CONNECTOR_MAX_RESPONSE_BYTES * 2));
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBeLessThan(HTTP_CONNECTOR_MAX_RESPONSE_BYTES + 100);
  });

  test("leaves a normal body alone", () => {
    expect(truncateHttpConnectorBody("small")).toEqual({ body: "small", truncated: false });
  });
});
