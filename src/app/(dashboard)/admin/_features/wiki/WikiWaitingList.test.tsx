import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { AccessLevelProvider } from "@/src/ui/components/screens/AccessLevel";
import { WikiWaitingList } from "./WikiWaitingList";

/**
 * Waiting on you (wiki-sonae-catch-up-plan-2026-11-21.md, S6): imports to
 * review, each with yes or no, and open questions, each with both claims,
 * links to the pages it can find and Dismiss.
 */

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => undefined),
  useMutation: vi.fn(() => vi.fn()),
}));

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const review = { reviewId: "review_1", title: "help.example.com/billing", claims: ["Invoices go out on the 1st."], requestedAt: Date.UTC(2026, 10, 12) };
const question = {
  questionId: "question_1",
  kind: "CONTRADICTION",
  pageKeyA: "POLICY:billing",
  claimA: "Invoices are sent on the 1st of the month.",
  pageKeyB: "POLICY:plans",
  claimB: "You're billed on the day you joined.",
  detail: null,
  raisedAt: Date.UTC(2026, 10, 12),
  decisionCopyKey: null,
  certainty: null,
};

function showWaiting({ reviews, questions }: { reviews: unknown[]; questions: unknown[] }) {
  vi.mocked(useQuery).mockImplementation(((fn: unknown) => {
    const name = getFunctionName(fn as never);
    if (name === "wikiReviews:listPendingReviewsForGlobal") return reviews;
    if (name === "wikiQuestions:listOpenQuestionsForGlobal") return questions;
    if (name === "wikiPages:listPagesForMapForGlobal") {
      return [{ pageId: "page_billing", kind: "POLICY", title: "How billing works", subjectKey: "billing", links: [], usageCount: 0, updatedAt: 0, learnedAt: 0 }];
    }
    return undefined;
  }) as never);
}

describe("WikiWaitingList", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    vi.mocked(useMutation).mockImplementation(() => vi.fn() as never);
  });

  it("says nothing is waiting when nothing is", () => {
    showWaiting({ reviews: [], questions: [] });
    render(<WikiWaitingList basePath="/admin/ai/knowledge" />);
    expect(screen.getByText("aiPages.waitingScreen.empty")).toBeInTheDocument();
  });

  it("shows nothing at all until both lists have answered", () => {
    vi.mocked(useQuery).mockImplementation(() => undefined);
    render(<WikiWaitingList basePath="/admin/ai/knowledge" />);
    expect(screen.queryByText("aiPages.waitingScreen.empty")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("lets the wiki learn an import on yes, and keeps it out on no", async () => {
    const decide = vi.fn().mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation(((fn: unknown) =>
      getFunctionName(fn as never) === "wikiReviews:decideReviewForGlobal" ? decide : vi.fn()) as never);
    showWaiting({ reviews: [review], questions: [] });
    render(<WikiWaitingList basePath="/admin/ai/knowledge" />);

    expect(screen.getByRole("heading", { name: "aiPages.reviews.title" })).toBeInTheDocument();
    expect(screen.getByText("Invoices go out on the 1st.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "aiPages.reviews.approve" }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith({ reviewId: "review_1", approve: true }));
    fireEvent.click(screen.getByRole("button", { name: "aiPages.reviews.reject" }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith({ reviewId: "review_1", approve: false }));
  });

  it("shows both claims of an open question, linking the page it can find, and dismisses it", async () => {
    const dismiss = vi.fn().mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation(((fn: unknown) =>
      getFunctionName(fn as never) === "wikiQuestions:dismissOpenQuestionForGlobal" ? dismiss : vi.fn()) as never);
    showWaiting({ reviews: [], questions: [question] });
    render(<WikiWaitingList basePath="/admin/ai/knowledge" />);

    expect(screen.getByRole("link", { name: "billing" })).toHaveAttribute("href", "/admin/ai/knowledge/page_billing");
    // A page it can't find is named without a link.
    expect(screen.queryByRole("link", { name: "plans" })).not.toBeInTheDocument();
    expect(screen.getByText("plans")).toBeInTheDocument();
    expect(screen.getByText("“You're billed on the day you joined.”")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "aiPages.questions.dismiss" }));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith({ questionId: "question_1" }));
  });

  it("offers no yes, no or Dismiss to someone who can only read", () => {
    showWaiting({ reviews: [review], questions: [question] });
    render(
      <AccessLevelProvider role="READ_ONLY">
        <WikiWaitingList basePath="/admin/ai/knowledge" />
      </AccessLevelProvider>,
    );
    expect(screen.getByText("Invoices go out on the 1st.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
