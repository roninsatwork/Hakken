import { expect, test, describe } from "vitest";
import { validateSafeUrl } from "./security";

describe("Security Utilities - validateSafeUrl", () => {
  test("Allows safe external URLs", () => {
    expect(() => validateSafeUrl("https://google.com", "Test")).not.toThrow();
    expect(() => validateSafeUrl("http://api.external.com/data", "Test")).not.toThrow();
    expect(() => validateSafeUrl("https://my-app.test.app/hook", "Test")).not.toThrow();
  });

  test("Blocks localhost and loopback", () => {
    expect(() => validateSafeUrl("http://localhost:3000", "Test")).toThrow("SSRF Prevention");
    expect(() => validateSafeUrl("http://127.0.0.1:8080", "Test")).toThrow("SSRF Prevention");
    expect(() => validateSafeUrl("https://localhost/api", "Test")).toThrow("SSRF Prevention");
  });

  test("Blocks internal network subnets (10.* and 192.168.*)", () => {
    expect(() => validateSafeUrl("http://10.0.0.1", "Test")).toThrow("SSRF Prevention");
    expect(() => validateSafeUrl("https://192.168.1.254/admin", "Test")).toThrow("SSRF Prevention");
  });

  test("Blocks Cloud Metadata endpoints (169.254.*)", () => {
    expect(() => validateSafeUrl("http://169.254.169.254/computeMetadata/v1/", "Test")).toThrow("SSRF Prevention");
    expect(() => validateSafeUrl("https://169.254.1.1", "Test")).toThrow("SSRF Prevention");
  });

  test("Blocks non-HTTP protocols", () => {
    expect(() => validateSafeUrl("ftp://files.example.com", "Test")).toThrow("SSRF Prevention");
    expect(() => validateSafeUrl("file:///etc/passwd", "Test")).toThrow("SSRF Prevention");
    expect(() => validateSafeUrl("gopher://10.0.0.1", "Test")).toThrow("SSRF Prevention");
  });

  test("Blocks malformed URLs", () => {
    expect(() => validateSafeUrl("not-a-url", "Test")).toThrow("SSRF Prevention: Malformed URL");
    expect(() => validateSafeUrl("", "Test")).toThrow("SSRF Prevention: Malformed URL");
  });

  // Asserting the sentence, not the prefix. Every rejection above shares the
  // "SSRF Prevention" prefix with the malformed-URL fallback the catch block
  // substitutes, so a prefix assertion stays green while the diagnosis is
  // being thrown away — which is exactly what happened when these throws
  // became structured errors and the catch kept matching on a plain message.
  test("Keeps the reason a URL was rejected, not just that it was", () => {
    expect(() => validateSafeUrl("http://10.0.0.1", "Test")).toThrow("Private IPv4 address denied");
    expect(() => validateSafeUrl("http://169.254.169.254", "Test")).toThrow("Private IPv4 address denied");
    expect(() => validateSafeUrl("ftp://files.example.com", "Test")).toThrow("Invalid protocol");
    expect(() => validateSafeUrl("not-a-url", "Test")).toThrow("Malformed URL");
  });

  // Both forms are the loopback address written to slip past a dotted-quad
  // check. They never reach this module's own numeric and hexadecimal rules:
  // the URL parser normalises them to 127.0.0.1 first, so the private-IPv4
  // rule is what answers. Asserted here so that stays deliberate — if a parser
  // change ever stops normalising, these fail rather than quietly passing
  // through.
  test("Blocks numeric and hexadecimal spellings of loopback", () => {
    expect(() => validateSafeUrl("http://2130706433", "Test")).toThrow("Private IPv4 address denied");
    expect(() => validateSafeUrl("http://0x7f000001", "Test")).toThrow("Private IPv4 address denied");
  });
});
