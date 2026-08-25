import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KioskPage from "./page";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  createKioskThread: vi.fn(),
  createVoiceSession: vi.fn(),
  recordVoiceTurn: vi.fn(),
  heartbeat: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mocks.useQuery(...args),
  useMutation: (mutation: string) => {
    if (mutation === "createKioskThread") return mocks.createKioskThread;
    if (mutation === "recordKioskHeartbeat") return mocks.heartbeat;
    return mocks.recordVoiceTurn;
  },
  useAction: () => mocks.createVoiceSession,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    kiosk: {
      getKioskConfig: "getKioskConfig",
      createKioskThread: "createKioskThread",
      recordKioskVoiceTurn: "recordKioskVoiceTurn",
      recordKioskHeartbeat: "recordKioskHeartbeat",
    },
    kioskActions: {
      createKioskVoiceSession: "createKioskVoiceSession",
    },
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ widgetId: "widget-1" }),
}));

vi.mock("next/image", () => ({
  default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", { ...props, alt: alt ?? "" });
  },
}));

vi.mock("@/src/ui/components/chat/SpeakingCharacter", () => ({
  SpeakingCharacter: () => <div aria-label="idle" />,
}));

describe("KioskPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mocks.useQuery.mockReturnValue({
      companyName: "Example Company",
      themePrimaryColor: "#ff5a1f",
      themeLogoUrl: null,
    });
    mocks.createKioskThread.mockResolvedValue({
      threadId: "thread-1",
      accessToken: "access-token",
    });
    mocks.createVoiceSession.mockResolvedValue({
      ok: false,
      reason: "Back shortly.",
    });
    mocks.heartbeat.mockResolvedValue(undefined);
  });

  it("starts the unchanged voice-session flow from the wake tap", async () => {
    render(<KioskPage />);

    fireEvent.click(screen.getByText("Tap to talk"));

    expect(await screen.findByText("Back shortly.")).toBeInTheDocument();
    expect(mocks.createKioskThread).toHaveBeenCalledWith({ widgetId: "widget-1" });
    expect(mocks.createVoiceSession).toHaveBeenCalledWith({
      widgetId: "widget-1",
      threadId: "thread-1",
      widgetAccessToken: "access-token",
    });
  });
});
