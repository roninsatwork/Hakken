import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocalTestAuthClient } from "./LocalTestAuthClient";

const mocks = vi.hoisted(() => ({
  queryString: "",
  signIn: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: mocks.signIn }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.queryString),
}));

describe("LocalTestAuthClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryString = "";
  });

  it("keeps the loading view immediate before showing the disabled error", async () => {
    render(<LocalTestAuthClient enabled={false} />);

    expect(screen.getByTestId("local-test-auth-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("local-test-auth-error")).toHaveTextContent(
      "Local test auth is disabled."
    );
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("keeps invalid parameters out of the auth call", async () => {
    render(<LocalTestAuthClient enabled />);

    expect(await screen.findByTestId("local-test-auth-error")).toHaveTextContent(
      "Missing or invalid local test auth parameters."
    );
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("preserves the local-test auth payload and rejection state", async () => {
    mocks.queryString = "role=user&secret=test-secret&redirectTo=%2Fapp%2Fcalls";
    mocks.signIn.mockResolvedValue({ signingIn: false });

    render(<LocalTestAuthClient enabled />);

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith("local-test", {
        role: "user",
        secret: "test-secret",
        redirectTo: "/app/calls",
      });
    });
    expect(await screen.findByTestId("local-test-auth-error")).toHaveTextContent(
      "Local test sign-in was rejected."
    );
  });
});
