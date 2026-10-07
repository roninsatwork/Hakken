import React from "react";
import { fireEvent, render as renderBare, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { ToastProvider } from "@/src/context/ToastContext";
import AssistantWelcomePage from "./page";

// Starting a thread reports failures through the house action runner, which
// reads the toast context the root layout always supplies.
const render = (ui: React.ReactElement) => renderBare(ui, { wrapper: ToastProvider });

type HookMock = {
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
};

const pushMock = vi.hoisted(() => vi.fn());
const voiceState = vi.hoisted(() => ({ permissionError: false }));
const navState = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(navState.search),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key.startsWith("welcome.greetings.")) return "Good morning";
    if (key === "welcome.footer") return `Powered by ${values?.platformName}`;
    if (key === "welcome.subtitle") return "Ask anything";
    return key;
  },
}));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Hakken" }),
}));

vi.mock("@/src/hooks/useVoiceToText", () => ({
  useVoiceToText: () => ({
    isRecording: false,
    isTranscribing: false,
    permissionError: voiceState.permissionError,
    setPermissionError: vi.fn(),
    toggleRecording: vi.fn(),
  }),
}));

vi.mock("./_components/AssistantHero", () => ({
  AssistantHero: ({ firstName, greeting }: { firstName: string; greeting: string }) => (
    <header>
      {greeting} {firstName}
    </header>
  ),
}));

vi.mock("./_components/AssistantComposer", () => ({
  AssistantComposer: ({
    activeModels,
    content,
    footerText,
    onToggleRecording,
    onStart,
    setContent,
  }: {
    activeModels: unknown[];
    content: string;
    footerText: string;
    onToggleRecording: () => void;
    onStart: (event: React.FormEvent) => void;
    setContent: (value: string) => void;
  }) => (
    <form onSubmit={onStart}>
      <div>models:{activeModels.length}</div>
      <div>{footerText}</div>
      <textarea aria-label="Message" value={content} onChange={(event) => setContent(event.target.value)} />
      <button type="button" onClick={onToggleRecording}>Record</button>
      <button type="submit">Send</button>
    </form>
  ),
}));

const models = [
  { _id: "model_1", modelId: "model-fast", displayName: "Fast", isEnabled: true, isDefault: true },
  { _id: "model_2", modelId: "model-disabled", displayName: "Disabled", isEnabled: false, isDefault: false },
];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("AssistantWelcomePage", () => {
  const createThread = vi.fn();
  const sendMessage = vi.fn();
  const generateUploadUrl = vi.fn();
  const saveChatDocument = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    voiceState.permissionError = false;
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown) => {
      const path = getConvexPath(queryFn);
      if (path.includes("getMe")) return { _id: "user_1", name: "Ada Lovelace" };
      if (path.includes("getActiveModels")) return models.filter((model) => model.isEnabled);
      return null;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("createThread")) return createThread as unknown as ReturnType<typeof useMutation>;
      if (path.includes("sendMessage")) return sendMessage as unknown as ReturnType<typeof useMutation>;
      if (path.includes("generateChatUploadUrl")) return generateUploadUrl as unknown as ReturnType<typeof useMutation>;
      return saveChatDocument as unknown as ReturnType<typeof useMutation>;
    });
    createThread.mockResolvedValue("thread_1");
    sendMessage.mockResolvedValue(undefined);
  });

  it("renders user context, enabled models, and starts a thread with the expected message payload", async () => {
    render(<AssistantWelcomePage />);

    expect(screen.getByText(/Good morning Ada/)).toBeInTheDocument();
    expect(screen.getByText("models:1")).toBeInTheDocument();
    expect(screen.getByText("Powered by Hakken")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Find my leads" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(createThread).toHaveBeenCalledWith({});
      expect(sendMessage).toHaveBeenCalledWith({
        threadId: "thread_1",
        content: "Find my leads",
        modelId: "model-fast",
        thinkingLevel: "NONE",
        fileIds: undefined,
      });
      expect(pushMock).toHaveBeenCalledWith("/app/assistant/thread_1");
    });
  });

  // "Ask Hakken about this" on a News story (knowledge-news-and-digest-plan.md, R10).
  it("arrives with a story's question typed, and sends nothing until asked to", () => {
    navState.search = `ask=${encodeURIComponent("What does the September spam update mean for my websites?")}`;
    render(<AssistantWelcomePage />);

    expect(screen.getByLabelText("Message")).toHaveValue("What does the September spam update mean for my websites?");
    expect(createThread).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    navState.search = "";
  });

  it("loads error modals only when needed and keeps them mounted after first use", async () => {
    const { rerender } = render(<AssistantWelcomePage />);

    expect(screen.queryByText("errors.mic.title")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(screen.queryByText("errors.mic.title")).not.toBeInTheDocument();

    voiceState.permissionError = true;
    rerender(<AssistantWelcomePage />);
    expect(await screen.findByText("errors.mic.title")).toBeInTheDocument();

    voiceState.permissionError = false;
    rerender(<AssistantWelcomePage />);

    await waitFor(() => {
      expect(screen.queryByText("errors.mic.title")).not.toBeInTheDocument();
    });
  });
});

describe("Answering for, viewing as a company (keep-less-history-plan.md, 6.1)", () => {
  const createThread = vi.fn();
  const sendMessage = vi.fn();
  const HOLDS = [
    { siteId: "hold_own", host: "morehandles.co.uk", relationship: "OWNED", ofHost: null, ofSiteId: null, iconUrl: null },
    { siteId: "hold_rival", host: "corston.com", relationship: "TRACKED", ofHost: "morehandles.co.uk", ofSiteId: "hold_own", iconUrl: null },
  ];
  const asked = { pickerHolds: 0 };
  const SUPER_ADMIN_AS_PHG = { _id: "user_1", name: "Anthony Basker", role: "SUPER_ADMIN", impersonatingCompanyId: "company_phg" };

  function signedInAs(me: Record<string, unknown>) {
    (useQuery as unknown as HookMock).mockImplementation((queryFn: unknown, args?: unknown) => {
      if (args === "skip") return undefined;
      const path = getConvexPath(queryFn);
      if (path.includes("getMe")) return me;
      if (path.includes("getActiveModels")) return models.filter((model) => model.isEnabled);
      if (path.includes("listPickerHolds")) {
        asked.pickerHolds += 1;
        return HOLDS;
      }
      return null;
    });
  }

  async function send() {
    const { unmount } = render(<AssistantWelcomePage />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "How did we do?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(createThread).toHaveBeenCalledTimes(1));
    const args = createThread.mock.calls[0][0];
    unmount();
    createThread.mockClear();
    return args;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    asked.pickerHolds = 0;
    navState.search = "";
    window.localStorage.clear();
    vi.mocked(useMutation).mockImplementation((mutationFn: unknown) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("createThread")) return createThread as unknown as ReturnType<typeof useMutation>;
      return sendMessage as unknown as ReturnType<typeof useMutation>;
    });
    createThread.mockResolvedValue("thread_1");
    sendMessage.mockResolvedValue(undefined);
  });

  it("answers for the company's own website at first, as drawn", async () => {
    signedInAs(SUPER_ADMIN_AS_PHG);
    expect(await send()).toEqual({ forWebsiteId: "hold_own" });
  });

  it("answers for the website chosen, and for the whole company when every website is", async () => {
    signedInAs(SUPER_ADMIN_AS_PHG);
    navState.search = "site=hold_rival";
    expect(await send()).toEqual({ forWebsiteId: "hold_rival" });
    navState.search = "site=all";
    expect(await send()).toEqual({});
    navState.search = "";
  });

  it("a website in the address that is not the company's falls back to its own", async () => {
    signedInAs(SUPER_ADMIN_AS_PHG);
    navState.search = "site=somebody_elses_hold";
    expect(await send()).toEqual({ forWebsiteId: "hold_own" });
    navState.search = "";
  });

  it("a company's own people choose among its websites too (Decision 7)", async () => {
    signedInAs({ _id: "user_2", name: "Jo", role: "ADMIN", companyId: "company_phg" });
    expect(await send()).toEqual({ forWebsiteId: "hold_own" });
    expect(asked.pickerHolds).toBeGreaterThan(0);
  });

  it("remembers the website last chosen, per company, and uses it the next time (Decision 8)", async () => {
    signedInAs({ _id: "user_2", name: "Jo", role: "ADMIN", companyId: "company_phg" });
    navState.search = "site=hold_rival";
    expect(await send()).toEqual({ forWebsiteId: "hold_rival" });
    expect(window.localStorage.getItem("hakken.askHakken.website.company_phg")).toBe("hold_rival");

    // Back with nothing in the address: the one last chosen.
    navState.search = "";
    expect(await send()).toEqual({ forWebsiteId: "hold_rival" });

    // A remembered website the company no longer holds is passed over for its own.
    window.localStorage.setItem("hakken.askHakken.website.company_phg", "gone_hold");
    expect(await send()).toEqual({ forWebsiteId: "hold_own" });
  });

  it("a super admin viewing as no one keeps the list of clients, and no website", async () => {
    signedInAs({ _id: "user_1", name: "Anthony Basker", role: "SUPER_ADMIN" });
    expect(await send()).toEqual({});
    expect(asked.pickerHolds).toBe(0);
  });
});
