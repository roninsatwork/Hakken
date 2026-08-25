import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import VerifyPage from "./page";

const replaceMock = vi.hoisted(() => vi.fn());
const signInMock = vi.hoisted(() => vi.fn());
const searchParamsGetMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: signInMock }),
}));

describe("VerifyPage", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    signInMock.mockReset();
    searchParamsGetMock.mockReset();
    searchParamsGetMock.mockImplementation((name: string) => {
      if (name === "c") return "test-code";
      if (name === "redirectTo") return "/app/tasks";
      return null;
    });
  });

  it("does not spend the sign-in code until the person presses the button", async () => {
    signInMock.mockResolvedValue({ signingIn: true });
    render(<VerifyPage />);

    expect(signInMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith(undefined, { code: "test-code" });
      expect(replaceMock).toHaveBeenCalledWith("/app/tasks");
    });
  });

  it("shows the existing incomplete-link state without a code", () => {
    searchParamsGetMock.mockReturnValue(null);
    render(<VerifyPage />);

    expect(screen.getByRole("heading", { name: "This link is incomplete" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("keeps the existing spent-link state when redemption fails", async () => {
    signInMock.mockRejectedValue(new Error("spent"));
    render(<VerifyPage />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "That link has already been used" }),
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
