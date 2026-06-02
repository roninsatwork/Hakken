import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";
import LoginPage from "./page";

const signInMock = vi.hoisted(() => vi.fn());
const recordMagicLinkRequestAttemptMock = vi.hoisted(() => vi.fn());

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: signInMock,
  }),
}));

vi.mock("convex/react", () => ({
  useMutation: () => recordMagicLinkRequestAttemptMock,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    authEvents: {
      recordMagicLinkRequestAttempt: "recordMagicLinkRequestAttempt",
    },
  },
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: (props: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <div className={props.className}>{props.children}</div>,
    form: (props: React.FormHTMLAttributes<HTMLFormElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <form className={props.className} onSubmit={props.onSubmit}>{props.children}</form>,
  },
}));

vi.mock("../../ui/components/layout/FluidBackground", () => ({
  FluidBackground: () => <div data-testid="fluid-background" />,
}));

function renderLoginPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginPage />
    </NextIntlClientProvider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
    recordMagicLinkRequestAttemptMock.mockReset();
  });

  it("requests email magic links with the app redirect and renders neutral success copy", async () => {
    signInMock.mockResolvedValueOnce(undefined);
    recordMagicLinkRequestAttemptMock.mockResolvedValueOnce({ logged: true });
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText("Enter your email address"), {
      target: { value: "member@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    await waitFor(() => {
      expect(recordMagicLinkRequestAttemptMock).toHaveBeenCalledWith({
        email: "member@example.com",
        provider: "resend",
      });
      expect(signInMock).toHaveBeenCalledWith("resend", {
        email: "member@example.com",
        redirectTo: "/app",
      });
    });

    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(screen.getByText("If this email is invited, you will receive a sign-in link shortly.")).toBeInTheDocument();
    expect(screen.queryByText(/member@example.com/)).not.toBeInTheDocument();
  });

  it("renders the same neutral success copy when the backend rejects the email request", async () => {
    signInMock.mockRejectedValueOnce(new Error("Access Denied: invite-only"));
    recordMagicLinkRequestAttemptMock.mockResolvedValueOnce({ logged: true });
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText("Enter your email address"), {
      target: { value: "unknown@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(screen.getByText("If this email is invited, you will receive a sign-in link shortly.")).toBeInTheDocument();
    expect(screen.queryByText(/unknown@example.com/)).not.toBeInTheDocument();
  });

  it("requests Google sign-in with the app redirect", () => {
    renderLoginPage();

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/app" });
  });
});
