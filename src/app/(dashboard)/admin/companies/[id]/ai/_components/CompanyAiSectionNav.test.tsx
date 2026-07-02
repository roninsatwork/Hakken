import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyAiSectionNav } from "./CompanyAiSectionNav";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company123" }),
  usePathname: vi.fn(),
}));

describe("CompanyAiSectionNav", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("keeps the company AI selector visible as a compact control on wide desktop", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company123/ai/chat-logs");

    render(<CompanyAiSectionNav />);

    expect(screen.getByRole("button", { name: "AI section: Chat Logs" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
  });
});
