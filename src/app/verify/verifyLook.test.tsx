import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectApprovedLook } from "@/src/test/lookOutline";
import VerifyPage from "./page";

/**
 * The page a sign-in email lands on holds to the look Anthony approved on the
 * "Hakken home page" canvas on 2026-10-29 (docs/plans/active/before-sign-in-
 * plan.md; design-drift-plan D4): boards VerifyConfirm, VerifyUsed and
 * VerifyIncomplete of docs/plans/assets/before-sign-in/.
 */

const signInMock = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ code: "test-code" as string | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: (name: string) => (name === "c" ? params.code : null) }),
}));
vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signIn: signInMock }) }));

describe("From the sign-in email", () => {
  beforeEach(() => {
    signInMock.mockReset();
    params.code = "test-code";
  });

  it("nearly there: one press to finish, as drawn", async () => {
    const { container } = render(<VerifyPage />);
    await expectApprovedLook(container, "before-sign-in", "VerifyConfirm", "From the email · confirm it is you");
  });

  it("the link already used, as drawn", async () => {
    signInMock.mockRejectedValue(new Error("spent"));
    const { container } = render(<VerifyPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("heading", { name: "This sign-in link has been used" });
    await expectApprovedLook(container, "before-sign-in", "VerifyUsed", "From the email · link already used");
  });

  it("the link incomplete, as drawn", async () => {
    params.code = null;
    const { container } = render(<VerifyPage />);
    expect(screen.getByRole("heading", { name: "This link didn't come through properly" })).toBeInTheDocument();
    await expectApprovedLook(container, "before-sign-in", "VerifyIncomplete", "From the email · link incomplete");
  });
});
