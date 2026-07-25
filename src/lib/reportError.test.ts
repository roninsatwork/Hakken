import { afterEach, describe, expect, test, vi } from "vitest";
import { buildErrorReport, reportError, setErrorReporter } from "./reportError";

afterEach(() => {
  setErrorReporter(undefined);
  vi.restoreAllMocks();
});

describe("error reporting seam", () => {
  test("captures message, stack and scope from an Error", () => {
    const report = buildErrorReport(new Error("boom"), { scope: "admin-segment" });

    expect(report).toMatchObject({ scope: "admin-segment", message: "boom", severity: "error" });
    expect(report.stack).toContain("boom");
  });

  test("carries the Next.js digest so a user-visible reference maps to a log", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    expect(buildErrorReport(error, { scope: "x" }).digest).toBe("abc123");
  });

  test("survives non-Error values", () => {
    expect(buildErrorReport("plain string", { scope: "x" }).message).toBe("plain string");
    expect(buildErrorReport({ code: 500 }, { scope: "x" }).message).toBe('{"code":500}');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(buildErrorReport(circular, { scope: "x" }).message).toBe("Unserializable error value");
  });

  test("emits one machine-parseable line so logs are usable before a vendor exists", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportError(new Error("boom"), { scope: "admin-segment", context: { route: "/admin" } });

    expect(consoleError).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleError.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({
      level: "error",
      scope: "admin-segment",
      message: "boom",
      context: { route: "/admin" },
    });
  });

  test("forwards to a registered external reporter", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const vendor = vi.fn();
    setErrorReporter(vendor);

    reportError(new Error("boom"), { scope: "admin-segment" });

    expect(vendor).toHaveBeenCalledOnce();
    expect(vendor.mock.calls[0][0]).toMatchObject({ scope: "admin-segment", message: "boom" });
    // Still logged locally: the vendor is additive, not a replacement.
    expect(consoleError).toHaveBeenCalledOnce();
  });

  test("a broken reporter never masks the error being reported", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setErrorReporter(() => {
      throw new Error("vendor sdk exploded");
    });

    expect(() => reportError(new Error("boom"), { scope: "x" })).not.toThrow();
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError.mock.calls[0][0]).toContain("boom");
  });

  test("unregistering stops forwarding", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const vendor = vi.fn();
    const unregister = setErrorReporter(vendor);

    unregister();
    reportError(new Error("boom"), { scope: "x" });

    expect(vendor).not.toHaveBeenCalled();
  });

  test("warnings go to console.warn", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportError(new Error("soft"), { scope: "x", severity: "warning" });

    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
