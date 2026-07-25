import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, test, vi } from "vitest";
import enMessages from "@/messages/en.json";
import itMessages from "@/messages/it.json";
import DashboardError from "./error";

/**
 * Rendered against the real message files rather than stubs: a boundary that
 * throws on a missing translation key would escalate to the global boundary,
 * turning a recoverable page error into a blank document.
 */
function renderBoundary(
  error: Error & { digest?: string },
  reset = vi.fn(),
  messages: Record<string, unknown> = enMessages,
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DashboardError error={error} reset={reset} />
    </NextIntlClientProvider>,
  );
  return reset;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dashboard error boundary", () => {
  test("shows a recovery affordance instead of a blank screen", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reset = renderBoundary(new Error("segment exploded"));

    expect(screen.getByText(enMessages.common.errorBoundary.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledOnce();
  });

  test("never shows the raw error message to the user", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderBoundary(new Error("Convex error: table users companyId leaked"));

    expect(screen.queryByText(/companyId leaked/)).not.toBeInTheDocument();
  });

  test("surfaces the digest so a user can quote it back", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderBoundary(Object.assign(new Error("boom"), { digest: "abc123" }));

    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  test("reports the error once, through the shared reporting seam", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderBoundary(Object.assign(new Error("boom"), { digest: "abc123" }));

    expect(consoleError).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleError.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ scope: "dashboard-segment", message: "boom", digest: "abc123" });
  });

  test("renders in Italian too, so the boundary is not English-only", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderBoundary(new Error("boom"), vi.fn(), itMessages);

    expect(screen.getByText(itMessages.common.errorBoundary.title)).toBeInTheDocument();
  });
});
