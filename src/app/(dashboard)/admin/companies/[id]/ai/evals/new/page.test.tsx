import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, renderWithProviders as renderBase, screen, waitFor } from "@/src/test/renderWithProviders";
import messages from "../../../../../../../../../messages/en.json";

// The eval form resolves its copy through the catalogue, so the page renders
// inside the same intl provider the root layout supplies.
function render(ui: React.ReactElement) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

async function renderPage() {
  return render(await NewCompanyEvalPage({ params: Promise.resolve({ id: "company123" }) }));
}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import NewCompanyEvalPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  // The shared form also serves editing, so it declares the case query; in
  // create mode it is skipped, and undefined is exactly what a skip returns.
  useQuery: vi.fn(),
}));

const push = vi.fn();

vi.mock("next/navigation", () => ({
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

  // Five questions in plain English, and a phrase list instead of a JSON array. The
  // form previously had fifteen fields, three of them raw JSON, and a ten-option
  // dropdown of machine constants feeding a field nothing ever read.
  it("creates an eval from plain-English answers and a typed phrase list", async () => {
    createCase.mockResolvedValue({ evalCaseId: "eval_1" });

    await renderPage();

    fireEvent.change(screen.getByPlaceholderText("Doesn't invent pricing"), { target: { value: "Doesn't invent pricing" } });
    fireEvent.change(
      screen.getByPlaceholderText("How much does your enterprise plan cost?"),
      { target: { value: "How much is the enterprise plan?" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(/Should say pricing isn't published/),
      { target: { value: "Says pricing is not published and offers a handover." } },
    );

    // Banned phrases are typed and confirmed with Enter; nobody writes brackets.
    const phraseInput = screen.getByPlaceholderText("enterprise is free");
    fireEvent.change(phraseInput, { target: { value: "enterprise is free" } });
    fireEvent.keyDown(phraseInput, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Create eval" }));

    await waitFor(() => {
      expect(createCase).toHaveBeenCalledWith({
        companyId: "company123",
        name: "Doesn't invent pricing",
        severity: "BLOCKER",
        targetSurface: "COMPANY_CHAT",
        prompt: "How much is the enterprise plan?",
        expectedBehavior: "Says pricing is not published and offers a handover.",
        forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
        requiredSkillsJson: undefined,
        // Asked once unless the reader opts into repeat sampling under Advanced.
        sampleCount: 1,
      });
    });
    expect(push).toHaveBeenCalledWith("/admin/companies/company123/ai/evals");
  });

  it("asks for no JSON and shows no machine constants", async () => {
    await renderPage();

    const body = document.body.textContent ?? "";
    for (const jargon of ["BLOCKER", "NO_HALLUCINATION", "COMPANY_CHAT", "JSON", "rubric", "fixture"]) {
      expect(body).not.toContain(jargon);
    }
  });

  // Requiring a skill still works, but it is not one of the five questions — it
  // only became meaningful once runs began recording which skills reached the model.
  it("keeps the skill requirement behind Advanced", async () => {
    createCase.mockResolvedValue({ evalCaseId: "eval_1" });

    await renderPage();

    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByText("Research Briefing")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Research Briefing/));

    fireEvent.change(
      screen.getByPlaceholderText("How much does your enterprise plan cost?"),
      { target: { value: "Prepare a sourced research update." } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(/Should say pricing isn't published/),
      { target: { value: "Uses the research briefing skill." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create eval" }));

    await waitFor(() => {
      expect(createCase).toHaveBeenCalledWith(expect.objectContaining({
        requiredSkillsJson: JSON.stringify(["skill_research"]),
      }));
    });
  });
});
