import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/en.json";
import LoginPage from "./page";

const signInMock = vi.hoisted(() => vi.fn());
const recordMagicLinkRequestAttemptMock = vi.hoisted(() => vi.fn());
const searchParamsGetMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

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
    oneTimeCodes: {
      requestCode: "requestCode",
      recordVerified: "recordVerified",
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
    searchParamsGetMock.mockReset();
    searchParamsGetMock.mockReturnValue(null);
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

  it("returns Google sign-in to the requested Deep Capture route", () => {
    searchParamsGetMock.mockReturnValue(
      "/demos/movement-capture?commissioning=1&deepCapture=1",
    );
    renderLoginPage();

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo: "/demos/movement-capture?commissioning=1&deepCapture=1",
    });
  });

  it("returns Google sign-in to the query-free locked Deep Capture route", () => {
    searchParamsGetMock.mockReturnValue("/demos/movement-capture/deep");
    renderLoginPage();

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo: "/demos/movement-capture/deep",
    });
  });

  it("rejects an external post-login redirect", () => {
    searchParamsGetMock.mockReturnValue("https://example.com/steal");
    renderLoginPage();

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/app" });
  });
});

/**
 * The code option, beside the link rather than instead of it. Sign-in is the
 * one screen where a half-built feature locks people out, so both ways in are
 * covered here.
 */
describe("LoginPage one-time code", () => {
  beforeEach(() => {
    signInMock.mockReset();
    recordMagicLinkRequestAttemptMock.mockReset();
    searchParamsGetMock.mockReset();
    searchParamsGetMock.mockReturnValue(null);
  });

  const typeEmail = () => {
    fireEvent.change(screen.getByPlaceholderText("Enter your email address"), {
      target: { value: "anthony@ronins.co.uk" },
    });
  };

  const askForCode = async () => {
    typeEmail();
    fireEvent.click(screen.getByText("Email me a code instead"));
    await waitFor(() => screen.getByPlaceholderText("Six-digit code"));
  };

  it("offers a code without taking either other way in away", () => {
    renderLoginPage();

    expect(screen.getByText("Send Magic Link")).toBeInTheDocument();
    expect(screen.getByText("Email me a code instead")).toBeInTheDocument();
    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
  });

  it("asks for a code, then asks the person to type it", async () => {
    recordMagicLinkRequestAttemptMock.mockResolvedValueOnce(true);
    signInMock.mockResolvedValueOnce(undefined);
    renderLoginPage();

    await askForCode();

    expect(signInMock).toHaveBeenCalledWith("one-time-code", {
      email: "anthony@ronins.co.uk",
      redirectTo: "/app",
    });
  });

  it("sends nothing when the address has asked too often, and says nothing either", async () => {
    // Telling the person would confirm which addresses exist, so the screen
    // behaves identically and only the mail stops.
    recordMagicLinkRequestAttemptMock.mockResolvedValueOnce(false);
    renderLoginPage();

    await askForCode();

    expect(signInMock).not.toHaveBeenCalled();
  });

  it("signs in with the typed code, ignoring spaces someone typed", async () => {
    recordMagicLinkRequestAttemptMock.mockResolvedValue(true);
    signInMock.mockResolvedValue(undefined);
    renderLoginPage();
    await askForCode();
    signInMock.mockClear();

    fireEvent.change(screen.getByPlaceholderText("Six-digit code"), { target: { value: "123 456" } });
    fireEvent.click(screen.getByText("Sign in"));

    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith("one-time-code", {
        email: "anthony@ronins.co.uk",
        code: "123456",
        redirectTo: "/app",
      })
    );
  });

  it("says what to do when a code is refused", async () => {
    recordMagicLinkRequestAttemptMock.mockResolvedValue(true);
    signInMock.mockResolvedValueOnce(undefined);
    renderLoginPage();
    await askForCode();

    signInMock.mockRejectedValueOnce(new Error("refused"));
    fireEvent.change(screen.getByPlaceholderText("Six-digit code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByText("Sign in"));

    await waitFor(() => expect(screen.getByText(/not right/)).toBeInTheDocument());
  });
});

