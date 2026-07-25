import React from "react";
import { fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import NewCompanyEvalPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company123" }),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const activeSkills = [
  {
    _id: "skill_research",
    companyId: "company123",
    name: "Research Briefing",
    description: "Build sourced company briefings.",
    category: "RESEARCH",
    status: "ACTIVE",
    riskLevel: "MEDIUM",
    instruction: "Separate facts and assumptions.",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
  {
    _id: "skill_approval",
    companyId: "company123",
    name: "Approval Handoff",
    description: "Pause risky operations.",
    category: "APPROVAL",
    status: "ACTIVE",
    riskLevel: "HIGH",
    instruction: "Ask for approval before side effects.",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
];

describe("NewCompanyEvalPage", () => {
  const createCase = vi.fn();
  const loadMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: activeSkills,
      status: "Exhausted",
      loadMore,
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "companyEvals:createCase") {
        return createCase as unknown as ReturnType<typeof useMutation>;
      }
      return vi.fn() as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("creates eval cases with required skills selected from active central skills available to the company", async () => {
    createCase.mockResolvedValue({ evalCaseId: "eval_1" });

    render(<NewCompanyEvalPage />);

    fireEvent.change(screen.getByPlaceholderText("Widget does not invent pricing"), { target: { value: "Research skill routing" } });
    fireEvent.change(screen.getByDisplayValue("No hallucination"), { target: { value: "SKILL_ROUTING" } });
    fireEvent.change(screen.getByPlaceholderText("Question or task the company AI must handle."), { target: { value: "Prepare a sourced research update." } });
    fireEvent.change(screen.getByPlaceholderText("Describe what a passing answer must do."), { target: { value: "Uses the research briefing skill." } });

    expect(screen.getByText("Research Briefing")).toBeInTheDocument();
    expect(screen.getByText("Approval Handoff")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Research Briefing/));

    fireEvent.click(screen.getByRole("button", { name: "Create eval" }));

    await waitFor(() => {
      expect(createCase).toHaveBeenCalledWith({
        companyId: "company123",
        name: "Research skill routing",
        category: "SKILL_ROUTING",
        severity: "BLOCKER",
        targetSurface: "COMPANY_CHAT",
        prompt: "Prepare a sourced research update.",
        expectedBehavior: "Uses the research briefing skill.",
        forbiddenClaimsJson: undefined,
        requiredSourcesJson: undefined,
        requiredMemoriesJson: undefined,
        requiredSkillsJson: JSON.stringify(["skill_research"]),
        expectedModelUseCase: "chat",
        judgeRubric: undefined,
      });
    });
    expect(push).toHaveBeenCalledWith("/admin/companies/company123/ai/evals");
  });
});
