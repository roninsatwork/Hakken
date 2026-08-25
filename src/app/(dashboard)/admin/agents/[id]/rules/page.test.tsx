import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import AgentRulesPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1234567890" }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const RULE_ID = "rule_1234567890" as Id<"aiRules">;
let mutationCallCount = 0;
const rulesData = {
  data: [{
    _id: RULE_ID,
    name: "Geography Extraction",
    trigger: "where are you based",
    instruction: "Answer with the London office address.",
    priority: "NORMAL" as const,
    isActive: true,
  }],
  totalCount: 1,
  totalPages: 1,
};

describe("AgentRulesPage", () => {
  const toggleRuleMock = vi.fn();
  const deleteRuleMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mutationCallCount = 0;
    vi.mocked(useQuery).mockReturnValue(rulesData as unknown as ReturnType<typeof useQuery>);
    vi.mocked(useMutation).mockImplementation(() => (
      mutationCallCount++ % 2 === 0 ? toggleRuleMock : deleteRuleMock
    ) as unknown as ReturnType<typeof useMutation>);
    deleteRuleMock.mockResolvedValue(null);
  });

  it("keeps the rule list visible before the delete dialog is requested", () => {
    renderWithProviders(<AgentRulesPage />);

    expect(screen.getByText("Geography Extraction")).toBeInTheDocument();
    expect(screen.queryByText("admin.agents.details.rules.deleteModal.title")).not.toBeInTheDocument();
  });

  it("opens and cancels the deferred delete dialog", async () => {
    renderWithProviders(<AgentRulesPage />);

    fireEvent.click(screen.getByRole("button", { name: "admin.agents.details.rules.table.tooltips.delete" }));
    expect(await screen.findByText("admin.agents.details.rules.deleteModal.title")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "admin.agents.details.rules.deleteModal.abort" }));
    await waitFor(() => {
      expect(screen.queryByText("admin.agents.details.rules.deleteModal.title")).not.toBeInTheDocument();
    });
  });

  it("deletes the selected rule from the deferred dialog", async () => {
    renderWithProviders(<AgentRulesPage />);

    fireEvent.click(screen.getByRole("button", { name: "admin.agents.details.rules.table.tooltips.delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "admin.agents.details.rules.deleteModal.confirm" }));

    await waitFor(() => {
      expect(deleteRuleMock).toHaveBeenCalledWith({ id: RULE_ID });
    });
  });
});
