import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiAddScreen } from "./WikiAddScreen";
import { WikiAskScreen } from "./WikiAskScreen";
import { WikiCheckupPage } from "./WikiCheckupPage";
import { WikiNewGoalScreen } from "./WikiNewGoalScreen";
import { WikiWaitingScreen } from "./WikiWaitingScreen";

/**
 * The pages the wiki's long page became (wiki-sonae-catch-up-plan-2026-11-21.md,
 * S6): Add to the wiki, Ask the wiki, Waiting on you and Check-up, for the
 * platform's wiki and each company's, and New goal, which was a pop-up.
 */

const push = vi.fn();
let search = new URLSearchParams();

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({ platformName: "Acme Copilot" }),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => undefined),
  useMutation: vi.fn(() => vi.fn()),
  useAction: vi.fn(() => vi.fn()),
}));

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    values ? `${namespace}.${key} ${JSON.stringify(values)}` : `${namespace}.${key}`,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/ai/knowledge/add",
  useSearchParams: () => search,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The check-up itself is another part's (S8), with its own tests; here it only has to be on the page.
vi.mock("./WikiCheckupScreen", () => ({
  WikiCheckupScreen: ({ companyId }: { companyId?: string }) => <div data-testid="checkup">{companyId ?? "platform"}</div>,
}));

function answer(map: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(((fn: unknown) => map[getFunctionName(fn as never)]) as never);
}

const companyId = "company_1" as Id<"companies">;
const companyBase = "/admin/companies/company_1/ai/pages";

describe("the wiki's own pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = new URLSearchParams();
    vi.mocked(useQuery).mockImplementation(() => undefined);
    vi.mocked(useMutation).mockImplementation(() => vi.fn() as never);
    vi.mocked(useAction).mockImplementation(() => vi.fn() as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Add to the wiki", () => {
    it("has the four ways in as tabs with their own address, the review tick box and Read it", async () => {
      const mapWebsite = vi.fn().mockResolvedValue(["https://help.example.com/a"]);
      const queue = vi.fn().mockResolvedValue(null);
      vi.mocked(useAction).mockImplementation(() => mapWebsite as never);
      vi.mocked(useMutation).mockImplementation(((fn: unknown) =>
        getFunctionName(fn as never) === "knowledge:queueWebsiteUrls" ? queue : vi.fn()) as never);
      render(<WikiAddScreen />);

      expect(screen.getByRole("heading", { name: "aiPages.addScreen.title" })).toBeInTheDocument();
      expect(screen.getByText("aiPages.globalHint")).toBeInTheDocument();
      for (const kind of ["website", "file", "text", "vault"]) {
        expect(screen.getByRole("link", { name: `aiPages.import.tabs.${kind}` })).toBeInTheDocument();
      }
      expect(screen.getByRole("link", { name: "aiPages.import.tabs.text" })).toHaveAttribute("href", "/admin/ai/knowledge/add?kind=text");
      expect(screen.getByRole("link", { name: "aiPages.import.tabs.website" })).toHaveAttribute("aria-current", "page");

      fireEvent.change(screen.getByLabelText("aiPages.addScreen.websiteLabel"), { target: { value: "https://help.example.com" } });
      fireEvent.click(screen.getByLabelText("aiPages.import.reviewFirst"));
      fireEvent.click(screen.getByRole("button", { name: "aiPages.import.readIt" }));
      await waitFor(() => expect(queue).toHaveBeenCalledWith({ urls: ["https://help.example.com/a"], wikiReview: true }));
    });

    it("reads a vault's markdown through the same road as text, and says what it skipped", async () => {
      search = new URLSearchParams("kind=vault");
      const saveManualText = vi.fn().mockResolvedValue("document_1");
      vi.mocked(useMutation).mockImplementation(((fn: unknown) =>
        getFunctionName(fn as never) === "knowledge:saveManualText" ? saveManualText : vi.fn()) as never);
      render(<WikiAddScreen />);

      expect(screen.queryByRole("button", { name: "aiPages.import.readIt" })).not.toBeInTheDocument();
      const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      await act(async () => {
        fireEvent.change(fileInput, {
          target: { files: [new File(["# Returns\nThirty days."], "Returns.md", { type: "text/markdown" }), new File(["x"], "logo.png")] },
        });
      });
      await waitFor(() => expect(saveManualText).toHaveBeenCalledWith(expect.objectContaining({ title: "Returns", wikiReview: false })));
      expect(await screen.findByText(/aiPages\.import\.feedback\.vaultSkipped/)).toBeInTheDocument();
    });

    it("shows how far the reading has got while the wiki reads", () => {
      answer({
        "wikiDistill:getDistillProgressForGlobal": {
          isReading: true,
          totalDocuments: 10,
          remainingDocuments: 4,
          pagesWritten: 3,
          pagesImproved: 2,
          lastDocumentTitle: "https://www.help.example.com/billing",
        },
      });
      render(<WikiAddScreen />);

      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "6");
      expect(screen.getByText(/aiPages\.progress\.nowReading/).textContent).toContain("help.example.com/billing");
      expect(screen.getByText(/aiPages\.progress\.nowReading/).textContent).not.toContain("https://");
    });

    it("adds a file to this company's wiki alone, and says so", async () => {
      search = new URLSearchParams("kind=file");
      const generateUploadUrl = vi.fn().mockResolvedValue("https://upload.test/put");
      const saveDocument = vi.fn().mockResolvedValue("document_1");
      vi.mocked(useMutation).mockImplementation(((fn: unknown) => {
        const name = getFunctionName(fn as never);
        if (name === "knowledge:generateUploadUrl") return generateUploadUrl;
        if (name === "knowledge:saveDocument") return saveDocument;
        return vi.fn();
      }) as never);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ storageId: "storage_1" }) }));
      render(<WikiAddScreen companyId={companyId} />);

      expect(screen.getByText("aiPages.scopeCompany")).toBeInTheDocument();
      expect(screen.queryByText("aiPages.globalHint")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "aiPages.addScreen.fileLabel" })).toBeInTheDocument();
      const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [new File(["# Returns"], "returns.md", { type: "text/markdown" })] } });
      });
      await waitFor(() => expect(generateUploadUrl).toHaveBeenCalledOnce());
      expect(saveDocument).toHaveBeenCalledWith(
        expect.objectContaining({ companyId, storageId: "storage_1", title: "returns.md", format: "text/markdown", wikiReview: false }),
      );
    });
  });

  describe("Ask the wiki", () => {
    it("shows the answer and the pages it stood on", async () => {
      const ask = vi.fn().mockResolvedValue({
        answer: "A sign-in link lasts 15 minutes.",
        pages: [{ title: "Signing in", pageId: "page_1", isPlatform: false }],
      });
      vi.mocked(useAction).mockImplementation(((fn: unknown) =>
        getFunctionName(fn as never) === "wikiAsk:askBrainForGlobal" ? ask : vi.fn()) as never);
      render(<WikiAskScreen basePath="/admin/ai/knowledge" />);

      expect(screen.getByRole("heading", { name: "aiPages.askScreen.title" })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("aiPages.askScreen.label"), { target: { value: "How long does a link last?" } });
      fireEvent.click(screen.getByRole("button", { name: "aiPages.ask.askButton" }));
      expect(await screen.findByText("A sign-in link lasts 15 minutes.")).toBeInTheDocument();
      expect(ask).toHaveBeenCalledWith({ question: "How long does a link last?" });
      expect(screen.getByRole("link", { name: "Signing in" })).toHaveAttribute("href", "/admin/ai/knowledge/page_1");
    });

    it("asks this company's wiki, and opens a platform page on the platform's wiki", async () => {
      const ask = vi.fn().mockResolvedValue({
        answer: "We deliver on Tuesdays.",
        pages: [
          { title: "Delivery times", pageId: "page_9", isPlatform: false },
          { title: "Bank holidays", pageId: "page_p", isPlatform: true },
        ],
      });
      vi.mocked(useAction).mockImplementation(((fn: unknown) =>
        getFunctionName(fn as never) === "wikiAsk:askBrainForCompany" ? ask : vi.fn()) as never);
      render(<WikiAskScreen companyId={companyId} basePath={companyBase} />);

      fireEvent.change(screen.getByLabelText("aiPages.askScreen.label"), { target: { value: "When do you deliver?" } });
      fireEvent.click(screen.getByRole("button", { name: "aiPages.ask.askButton" }));
      expect(await screen.findByText("We deliver on Tuesdays.")).toBeInTheDocument();
      expect(ask).toHaveBeenCalledWith({ companyId, question: "When do you deliver?" });
      expect(screen.getByRole("link", { name: "Delivery times" })).toHaveAttribute("href", `${companyBase}/page_9`);
      expect(screen.getByRole("link", { name: /Bank holidays/ })).toHaveAttribute("href", "/admin/ai/knowledge/page_p");
    });

    it("says when the wiki had no pages for it", async () => {
      vi.mocked(useAction).mockImplementation(() => vi.fn().mockResolvedValue({ answer: "I don't know.", pages: [] }) as never);
      render(<WikiAskScreen basePath="/admin/ai/knowledge" />);

      fireEvent.change(screen.getByLabelText("aiPages.askScreen.label"), { target: { value: "Anything?" } });
      fireEvent.click(screen.getByRole("button", { name: "aiPages.ask.askButton" }));
      expect(await screen.findByText("aiPages.ask.noPages")).toBeInTheDocument();
    });
  });

  describe("Waiting on you", () => {
    it("shows what this company's wiki is waiting on you for", () => {
      answer({
        "wikiReviews:listPendingReviewsForCompany": [
          { reviewId: "review_1", title: "Price list", claims: ["Delivery is free"], requestedAt: Date.UTC(2026, 10, 1) },
        ],
        "wikiQuestions:listOpenQuestionsForCompany": [],
      });
      render(<WikiWaitingScreen companyId={companyId} basePath={companyBase} />);

      expect(screen.getByRole("heading", { name: "aiPages.waitingScreen.title" })).toBeInTheDocument();
      expect(screen.getByText("Delivery is free")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "aiPages.reviews.approve" })).toBeInTheDocument();
    });
  });

  describe("Check-up", () => {
    it("puts this week under the check-up, with what's waiting opening Waiting on you", () => {
      answer({
        "wikiReport:getWeeklyReportForGlobal": {
          pagesNew: 10,
          pagesImproved: 8,
          answered: 0,
          unanswered: 0,
          openUnanswered: 1,
          staffRuns: 4,
          waitingReviews: 1,
          waitingQuestions: 2,
          factsSettled: 0,
          suggestions: [],
          quiet: false,
        },
      });
      render(<WikiCheckupPage waitingHref="/admin/ai/knowledge/waiting" />);

      expect(screen.getByTestId("checkup")).toHaveTextContent("platform");
      const week = screen.getByRole("region", { name: "aiPages.week.title" });
      expect(week).toHaveTextContent("18");
      expect(week).not.toHaveTextContent("aiPages.week.answered");
      expect(screen.getByRole("link", { name: /aiPages\.week\.waiting/ })).toHaveAttribute("href", "/admin/ai/knowledge/waiting");
      expect(screen.getByRole("link", { name: /aiPages\.week\.waiting/ })).toHaveTextContent("3");
    });

    it("counts a company's answers too", () => {
      answer({
        "wikiReport:getWeeklyReportForCompany": {
          pagesNew: 1,
          pagesImproved: 0,
          answered: 12,
          unanswered: 2,
          openUnanswered: 2,
          staffRuns: 1,
          waitingReviews: 0,
          waitingQuestions: 0,
          factsSettled: 0,
          suggestions: [],
          quiet: false,
        },
      });
      render(<WikiCheckupPage companyId={companyId} waitingHref={`${companyBase}/waiting`} />);

      expect(screen.getByTestId("checkup")).toHaveTextContent("company_1");
      expect(screen.getByText("aiPages.week.answered")).toBeInTheDocument();
      expect(screen.getByText("aiPages.week.unanswered")).toBeInTheDocument();
    });
  });

  describe("New goal", () => {
    it("is a page, not a pop-up, and goes back to the wiki once the goal is added", async () => {
      const create = vi.fn().mockResolvedValue("page_goal");
      vi.mocked(useMutation).mockImplementation(((fn: unknown) =>
        getFunctionName(fn as never) === "wikiPages:createGoalPageForGlobal" ? create : vi.fn()) as never);
      render(<WikiNewGoalScreen basePath="/admin/ai/knowledge" />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "aiPages.goal.back" })).toHaveAttribute("href", "/admin/ai/knowledge");
      expect(screen.getByRole("button", { name: "aiPages.goal.action" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText("aiPages.goal.nameLabel"), { target: { value: "Fewer support emails" } });
      fireEvent.change(screen.getByLabelText("aiPages.goal.aimLabel"), { target: { value: "Half as many by June." } });
      fireEvent.click(screen.getByRole("button", { name: "aiPages.goal.action" }));
      await waitFor(() => expect(create).toHaveBeenCalledWith({ title: "Fewer support emails", content: "Half as many by June." }));
      await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/ai/knowledge"));
    });

    it("adds a company's goal to that company's wiki, and stays put if it can't", async () => {
      const create = vi.fn().mockRejectedValue(new Error("A goal with that name already exists."));
      vi.mocked(useMutation).mockImplementation(((fn: unknown) =>
        getFunctionName(fn as never) === "wikiPages:createGoalPageForCompany" ? create : vi.fn()) as never);
      render(<WikiNewGoalScreen companyId={companyId} basePath={companyBase} />);

      fireEvent.change(screen.getByLabelText("aiPages.goal.nameLabel"), { target: { value: "More reviews" } });
      fireEvent.change(screen.getByLabelText("aiPages.goal.aimLabel"), { target: { value: "Ten a month." } });
      fireEvent.click(screen.getByRole("button", { name: "aiPages.goal.action" }));
      await waitFor(() => expect(create).toHaveBeenCalledWith({ companyId, title: "More reviews", content: "Ten a month." }));
      expect(await screen.findByText(/already exists|aiPages\.goal\.failed/)).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });
  });
});
