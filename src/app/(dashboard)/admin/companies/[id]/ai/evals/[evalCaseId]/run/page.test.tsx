import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import RunCompanyEvalPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company123", evalCaseId: "eval_case_1" }),
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

const evalCase = {
  _id: "eval_case_1",
  companyId: "company123",
  name: "Research skill routing",
  category: "SKILL_ROUTING",
  severity: "BLOCKER",
  targetSurface: "COMPANY_CHAT",
  status: "ACTIVE",
  prompt: "Prepare a sourced research update.",
  expectedBehavior: "Uses the research briefing skill.",
  expectedModelUseCase: "chat",
  createdBy: "user_1",
  createdAt: Date.UTC(2026, 5, 18),
  updatedAt: Date.UTC(2026, 5, 18),
};

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
];

describe("RunCompanyEvalPage", () => {
  const runCase = vi.fn();
  const loadMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue(evalCase);
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: activeSkills,
      status: "Exhausted",
      loadMore,
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "companyEvals:runCase") {
        return runCase as unknown as ReturnType<typeof useMutation>;
      }
      return vi.fn() as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("records eval runs with skill evidence selected from active central skills available to the company", async () => {
    runCase.mockResolvedValue({ status: "PASSED", score: 1 });

    renderWithProviders(<RunCompanyEvalPage />);

    fireEvent.change(screen.getByPlaceholderText("Answer produced by the company AI."), {
      target: { value: "The research update cites the selected source." },
    });
    fireEvent.change(screen.getByPlaceholderText('{"sourceIds":[],"memoryIds":[]}'), {
      target: { value: JSON.stringify({ sourceIds: ["source_1"] }) },
    });
    fireEvent.click(screen.getByLabelText(/Research Briefing/));

    fireEvent.click(screen.getByRole("button", { name: "Record run" }));

    await waitFor(() => {
      expect(runCase).toHaveBeenCalledWith({
        evalCaseId: "eval_case_1",
        answer: "The research update cites the selected source.",
        evidenceJson: JSON.stringify({ sourceIds: ["source_1"], skillIds: ["skill_research"] }),
        resolvedModelId: undefined,
        resolvedUseCase: "chat",
        judgeNotes: undefined,
      });
    });
    expect(push).toHaveBeenCalledWith("/admin/companies/company123/ai/evals");
  });
});
