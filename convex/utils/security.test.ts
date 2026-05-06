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
});
