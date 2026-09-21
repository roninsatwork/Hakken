import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssistantComposer } from "./AssistantComposer";
import { AssistantHero } from "./AssistantHero";
import { AssistantModelSelector } from "./AssistantModelSelector";
import { AssistantModals } from "./AssistantModals";
import { AssistantThinkingSelector } from "./AssistantThinkingSelector";
import { AssistantUploadStatus } from "./AssistantUploadStatus";
import { PendingFileTray } from "./PendingFileTray";
import type { AssistantModel, Translate } from "./types";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(({ children, ...props }, ref) =>
          React.createElement(tag, { ...props, ref }, children)
        );
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    }
  ),
}));

vi.mock("@/src/ui/components/feedback/HakkenModal", () => ({
  default: ({
    children,
    isOpen,
    onClose,
    title,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
    title: string;
  }) =>
    isOpen ? (
      <section aria-label={title}>
        <button type="button" onClick={onClose}>
          close {title}
        </button>
        {children}
      </section>
    ) : null,
}));

const t: Translate = (key, values) => {
  if (key === "welcome.inputPlaceholder") return "Ask anything, or paste something to work on";
  if (key === "controls.reasoning.levels.LOW" || key === "controls.reasoning.levels.low") return "Low reasoning";
  if (key === "controls.reasoning.levels.MEDIUM" || key === "controls.reasoning.levels.medium") return "Medium reasoning";
  if (key === "controls.reasoning.descriptions.LOW" || key === "controls.reasoning.descriptions.low") return "Quick answers";
  if (key === "controls.reasoning.descriptions.MEDIUM" || key === "controls.reasoning.descriptions.medium") return "Balanced answers";
  if (key === "controls.engine.label") return "Model";
  if (key === "controls.engine.title") return "Choose engine";
  if (key === "controls.attach") return "Attach";
  if (key === "controls.speak") return "Speak";
  if (key === "controls.send") return "Send";
  if (key === "controls.mic.start") return "Start recording";
  if (key === "controls.mic.stop") return "Stop recording";
  if (key === "errors.mic.description") return `Allow ${values?.platformName}`;
  if (key === "errors.upload.clear") return "Clear Alert";
  return key;
};

const tCommon: Translate = (key) => (key === "actions.dismiss" ? "Dismiss" : key);

const models = [
  {
    _id: "model1",
    _creationTime: 1,
    modelId: "model-fast",
    displayName: "Fast Model",
    friendlyName: "Fast",
    description: "Low latency",
    isEnabled: true,
    isDefault: true,
  },
  {
    _id: "model2",
    _creationTime: 2,
    modelId: "model-smart",
    displayName: "Smart Model",
    description: "",
    isEnabled: true,
    isDefault: false,
  },
] as AssistantModel[];

describe("assistant shared components", () => {
  it("renders the assistant hero with optional first name", () => {
    const onPick = vi.fn();
    const { rerender } = render(<AssistantHero firstName="Ada" greeting="Good morning" onPickStarter={onPick} t={t} />);

    expect(screen.getByRole("heading", { name: /Good morning, Ada/ })).toBeInTheDocument();

    rerender(<AssistantHero firstName="" greeting="Welcome" onPickStarter={onPick} t={t} />);

    expect(screen.getByRole("heading", { name: /Welcome/ })).toBeInTheDocument();
  });

  it("loads a starting point into the composer rather than sending it", () => {
    // Clicking a starter must never fire a request on its own — it fills the
    // input and waits for a deliberate press.
    const onPick = vi.fn();
    render(<AssistantHero firstName="Ada" greeting="Good morning" onPickStarter={onPick} t={t} />);

    const starters = screen.getAllByRole("button");
    expect(starters).toHaveLength(4);

    fireEvent.click(starters[0]);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("welcome.starters.summarise.title");
  });

  it("shows upload status only when a status is present", () => {
    const { rerender } = render(<AssistantUploadStatus status={null} />);

    expect(screen.queryByText("PROCESSING")).not.toBeInTheDocument();

    rerender(<AssistantUploadStatus status="PROCESSING" />);

    expect(screen.getByText("PROCESSING")).toBeInTheDocument();
  });

  it("renders pending files and removes the selected file index", () => {
    const onRemoveFile = vi.fn();
    const files = [new File(["a"], "brief.pdf"), new File(["b"], "notes.txt")];

    render(<PendingFileTray files={files} onRemoveFile={onRemoveFile} />);

    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button")[1]);

    expect(onRemoveFile).toHaveBeenCalledWith(1);
  });

  it("lets users open and select an assistant model", () => {
    const onOpenChange = vi.fn();
    const onSelectModel = vi.fn();

    render(
      <AssistantModelSelector
        activeModels={models}
        effectiveSelectedModelId="model-fast"
        isAutonomousMode={false}
        isOpen
        isRecording={false}
        onOpenChange={onOpenChange}
        onSelectModel={onSelectModel}
        selectedModelData={models[0]}
        selectorRef={createRef<HTMLDivElement>()}
        t={t}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Fast/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Smart Model/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelectModel).toHaveBeenCalledWith("model-smart");
    // One line per model: the menu names models and invents nothing about
    // them — the old fallback subtitle was decoration.
    expect(screen.queryByText("Default model")).not.toBeInTheDocument();
  });

  it("disables model selection when there are no active models", () => {
    render(
      <AssistantModelSelector
        activeModels={[]}
        effectiveSelectedModelId={null}
        isAutonomousMode={false}
        isOpen={false}
        isRecording={false}
        onOpenChange={vi.fn()}
        onSelectModel={vi.fn()}
        selectedModelData={undefined}
        selectorRef={createRef<HTMLDivElement>()}
        t={t}
      />
    );

    expect(screen.getByRole("button", { name: /Model/i })).toBeDisabled();
  });

  it("lets users open and select a thinking level", () => {
    const onOpenChange = vi.fn();
    const onSelectThinking = vi.fn();

    render(
      <AssistantThinkingSelector
        isAutonomousMode={false}
        isOpen
        isRecording={false}
        onOpenChange={onOpenChange}
        onSelectThinking={onSelectThinking}
        selectedThinkingId="LOW"
        selectorRef={createRef<HTMLDivElement>()}
        t={t}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Low reasoning" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Medium reasoning/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelectThinking).toHaveBeenCalledWith("MEDIUM");
    expect(screen.getByText("Quick answers")).toBeInTheDocument();
  });

  it("renders permission and upload error modals with their close actions", () => {
    const onClearUploadError = vi.fn();
    const onPermissionErrorClose = vi.fn();

    render(
      <AssistantModals
        onClearUploadError={onClearUploadError}
        onPermissionErrorClose={onPermissionErrorClose}
        permissionError
        platformName="Hakken"
        t={t}
        tCommon={tCommon}
        uploadError="PDF only"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear Alert" }));

    expect(screen.getByText("Allow Hakken")).toBeInTheDocument();
    expect(screen.getByText("PDF only")).toBeInTheDocument();
    expect(onPermissionErrorClose).toHaveBeenCalled();
    expect(onClearUploadError).toHaveBeenCalled();
  });

  it("wires composer text, upload, file removal, recording, dropdown, and submit events", () => {
    const fileInputRef = createRef<HTMLInputElement>();
    const textareaRef = createRef<HTMLTextAreaElement>();
    const handleFileSelect = vi.fn();
    const onStart = vi.fn((event: React.FormEvent) => event.preventDefault());
    const props = {
      activeModels: models,
      content: "",
      displayedUploadStatus: "Uploading",
      effectiveSelectedModelId: "model-fast",
      fileInputRef,
      footerText: "AI can make mistakes",
      handleFileSelect,
      isAutonomousMode: false,
      isDragging: true,
      isRecording: false,
      isSubmitting: false,
      isTranscribing: false,
      modelDropdownOpen: false,
      modelRef: createRef<HTMLDivElement>(),
      onDragLeave: vi.fn(),
      onDragOver: vi.fn(),
      onDrop: vi.fn(),
      onModelDropdownChange: vi.fn(),
      onRemovePendingFile: vi.fn(),
      onSelectModel: vi.fn(),
      onSelectThinking: vi.fn(),
      onStart,
      onThinkingDropdownChange: vi.fn(),
      onToggleRecording: vi.fn(),
      pendingFiles: [new File(["brief"], "brief.pdf")],
      platformName: "Hakken",
      selectedModelData: models[0],
      selectedThinkingId: "LOW" as const,
      setContent: vi.fn(),
      textareaRef,
      thinkingDropdownOpen: false,
      thinkingRef: createRef<HTMLDivElement>(),
      t,
    };

    const { container, rerender } = render(<AssistantComposer {...props} />);

    fireEvent.change(screen.getByPlaceholderText("Ask anything, or paste something to work on"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["x"], "x.txt")] },
    });
    fireEvent.click(screen.getAllByRole("button").find((button) => button.querySelector(".lucide-x")) as HTMLButtonElement);
    fireEvent.click(screen.getByTitle("Start recording"));
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(props.setContent).toHaveBeenCalledWith("Hello");
    expect(handleFileSelect).toHaveBeenCalled();
    expect(props.onRemovePendingFile).toHaveBeenCalledWith(0);
    expect(props.onToggleRecording).toHaveBeenCalled();
    expect(onStart).toHaveBeenCalled();

    rerender(<AssistantComposer {...props} content="Ship it" isSubmitting />);

    expect(screen.getByText("AI can make mistakes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fast/i })).toBeInTheDocument();
  });
});
