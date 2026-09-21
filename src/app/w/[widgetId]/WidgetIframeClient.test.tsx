import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetIframeClient } from "./WidgetIframeClient";

const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: () => vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    widgets: {
      getWidgetById: "getWidgetById",
      createWidgetThread: "createWidgetThread",
      generateWidgetUploadUrl: "generateWidgetUploadUrl",
      finalizeWidgetUpload: "finalizeWidgetUpload",
    },
    chat: {
      getMessages: "getMessages",
      sendMessage: "sendMessage",
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

describe("WidgetIframeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("hakken_widget_widget-1_thread", "thread-1");
    localStorage.setItem("hakken_widget_widget-1_token", "access-token");
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
      "Audio",
      class {
        volume = 0;
        play = vi.fn().mockResolvedValue(undefined);
      }
    );

    useQueryMock.mockImplementation((query: string, args: unknown) => {
      if (query === "getWidgetById") {
        return {
          _id: "widget-1",
          name: "Support",
          agentId: "agent-1",
          allowedDomains: [],
          requireName: false,
          requireEmail: false,
          enableGreeting: false,
          enableSounds: false,
          showPopupPreview: false,
          conversationStarters: [],
          themePrimaryColor: "#000000",
        };
      }
      if (query === "getMessages" && args !== "skip") {
        return [
          {
            _id: "message-1",
            _creationTime: 1,
            threadId: "thread-1",
            role: "user",
            content: "Here is the damage",
            createdAt: 1,
            imageAttachments: [{ url: "https://example.com/photo.jpg" }],
          },
        ];
      }
      return undefined;
    });
  });

  it("defers saved offscreen photo thumbnails until the browser needs them", async () => {
    render(<WidgetIframeClient embedPass={null} />);

    const photo = await screen.findByAltText("Attached photo");
    expect(photo).toHaveAttribute("loading", "lazy");
    expect(photo).toHaveAttribute("decoding", "async");
  });
});
