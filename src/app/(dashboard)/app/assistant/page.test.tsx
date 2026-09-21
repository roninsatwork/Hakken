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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
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
