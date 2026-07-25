import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import CompanyChatLogsDashboard from "./page";

type PaginatedHookMock = {
  mockReturnValue: (value: unknown) => void;
};

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company123" }),
  usePathname: () => "/admin/companies/company123/ai/chat-logs",
}));

// The page reads the configured platform name so exported transcripts are
// labelled with the deployment's brand rather than a hardcoded product name.
vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} {...props} />
  ),
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

describe("CompanyChatLogsDashboard viewport guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    (usePaginatedQuery as unknown as PaginatedHookMock).mockReturnValue({
      results: [
        {
          _id: "thread_1",
          _creationTime: 1,
          createdAt: Date.UTC(2026, 5, 14, 12, 15),
          title: "Overview Of Ronins",
          user: { name: "Anthony Basker", email: "anthony@ronins.co.uk", image: "" },
        },
      ],
      status: "Exhausted",
      loadMore: vi.fn(),
    });
  });

  it("sizes the chat log shell to the actual remaining browser height", async () => {
    let shellTop = 300;
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 800 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(this: HTMLElement) {
      const top = (this as HTMLElement).dataset.testid === "company-chat-logs-shell" ? shellTop : 0;
      return {
        bottom: top,
        height: 0,
        left: 0,
        right: 0,
        toJSON: () => ({}),
        top,
        width: 0,
        x: 0,
        y: top,
      };
    });

    render(<CompanyChatLogsDashboard />);

    const shell = screen.getByTestId("company-chat-logs-shell");
    expect(screen.queryByRole("button", { name: /AI section/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(shell).toHaveStyle({ height: "476px", maxHeight: "476px" });
    });

    shellTop = 260;
    window.innerHeight = 700;
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      expect(shell).toHaveStyle({ height: "416px", maxHeight: "416px" });
    });
  });
});
