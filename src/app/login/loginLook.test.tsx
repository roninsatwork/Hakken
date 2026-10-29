import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectApprovedLook } from "@/src/test/lookOutline";
import messages from "../../../messages/en.json";
import LoginPage from "./page";

/**
 * Sign in holds to the look Anthony approved on the "Hakken home page" canvas
 * on 2026-10-29 (docs/plans/active/before-sign-in-plan.md; design-drift-plan
 * D4): boards Login, LoginCode, LoginCodeWrong and LoginSent of
 * docs/plans/assets/before-sign-in/.
 */

const signInMock = vi.hoisted(() => vi.fn());
const mutationMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useSearchParams: () => ({ get: () => null }) }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signIn: signInMock }) }));
vi.mock("convex/react", () => ({ useMutation: () => mutationMock }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/convex/_generated/api", () => ({
  api: { authEvents: { recordMagicLinkRequestAttempt: "a" }, oneTimeCodes: { requestCode: "b" } },
}));

const renderPage = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginPage />
    </NextIntlClientProvider>,
  );

const typeEmail = () => fireEvent.change(screen.getByLabelText("Your email address"), { target: { value: "jo@example.com" } });

describe("Sign in", () => {
  beforeEach(() => {
    signInMock.mockReset();
    mutationMock.mockReset();
    mutationMock.mockResolvedValue(true);
    signInMock.mockResolvedValue(undefined);
  });

  it("the email form: a link, a code, or Google, as drawn", async () => {
    const { container } = renderPage();
    await expectApprovedLook(container, "before-sign-in", "Login", "Sign in");
  });

  it("the six-digit code, one box a digit, as drawn", async () => {
    const { container } = renderPage();
    typeEmail();
    fireEvent.click(screen.getByText("Email me a code instead"));
    await screen.findByRole("group", { name: "Six-digit code" });
    await expectApprovedLook(container, "before-sign-in", "LoginCode", "Sign in · type the code");
  });

  it("a refused code says so under the boxes, as drawn", async () => {
    const { container } = renderPage();
    typeEmail();
    fireEvent.click(screen.getByText("Email me a code instead"));
    await screen.findByRole("group", { name: "Six-digit code" });
    signInMock.mockRejectedValueOnce(new Error("refused"));
    fireEvent.paste(screen.getByLabelText("Digit 1"), { clipboardData: { getData: () => "482913" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText(/doesn't match/)).toBeInTheDocument());
    await expectApprovedLook(container, "before-sign-in", "LoginCodeWrong", "Sign in · wrong code");
  });

  it("the link sent, as drawn", async () => {
    const { container } = renderPage();
    typeEmail();
    fireEvent.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
    await screen.findByText("Check your inbox");
    await expectApprovedLook(container, "before-sign-in", "LoginSent", "Sign in · link sent");
  });
});
