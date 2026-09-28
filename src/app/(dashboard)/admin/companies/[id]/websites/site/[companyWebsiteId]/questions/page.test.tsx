import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, ownedHeader } from "@/src/test/siteViewFixtures";
import CompanySiteQuestionsPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

/**
 * The company's own AI questions for one website: the company's list,
 * narrowed to it (docs/plans/active/websites-section-menu-plan.md) — read
 * and added through its hold, never the website's, so no other company's
 * list is touched or shown (private-tracking-lists-plan.md, V4).
 */
describe("the AI questions list for one website", () => {
  const add = vi.fn(async () => "question_2");

  const answer = (prompts = 1, promptsLimit = 10) => answerQueries({
      "websiteClientView:getSiteHeader": ownedHeader,
      "websiteCanonical:listEngines": ["chatgpt", "claude"],
      "companyAiLists:companyAiListCounts": {
        questions: 1, searches: 0, fanOut: 2,
        websites: [{ companyWebsiteId: "companyWebsite_1", host: "ourshop.com", everydayKeywords: 1000, prompts, promptsPaused: 0, promptsLimit }],
      },
      "companyAiLists:listCompanyQuestions": {
        data: [{
          _id: "question_1", prompt: "who is the best branding agency in Leeds", companyWebsiteId: "companyWebsite_1",
          host: "ourshop.com", engines: ["chatgpt"], isActive: true, createdAt: 1, fanOutSearches: 2,
        }],
        totalCount: 1,
        totalPages: 1,
        engineCalls: 1,
        cut: false,
      },
    });

  beforeEach(() => {
    add.mockClear();
    vi.mocked(useMutation).mockImplementation(() => add as never);
    vi.mocked(useQuery).mockImplementation(answer());
  });

  it("lists this company's questions for the website, with no website column, each opening its fan-out queries there", async () => {
    renderWithProviders(<CompanySiteQuestionsPage />);

    const question = await screen.findByText("who is the best branding agency in Leeds");
    const asked = vi.mocked(useQuery).mock.calls.find(([, args]) => (args as { page?: number })?.page === 1);
    expect(asked?.[1]).toMatchObject({ companyWebsiteId: "companyWebsite_1" });
    expect(screen.queryByText("admin.companyAiLists.questions.columns.website")).not.toBeInTheDocument();
    // Clicking the question opens its own screen of fan-out queries, at this website's scope.
    expect(question.closest("a")).toHaveAttribute(
      "href",
      "/admin/companies/company_1/websites/site/companyWebsite_1/questions/question_1",
    );
  });

  it("asks a new question of the assistants left ticked in one dropdown", async () => {
    renderWithProviders(<CompanySiteQuestionsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "admin.companyAiLists.questions.askedOfLabel" }));
    fireEvent.click(screen.getByLabelText("aiEngines.claude"));
    fireEvent.change(screen.getByLabelText("admin.companyAiLists.questions.addLabel"), {
      target: { value: "who builds the best websites in Leeds" },
    });
    fireEvent.click(screen.getByRole("button", { name: /admin.companyAiLists.questions.add/ }));

    await waitFor(() => expect(add).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1",
      prompt: "who builds the best websites in Leeds",
      engines: ["chatgpt"],
    }));
  });

  it("adds a question to this company's own list for the website", async () => {
    renderWithProviders(<CompanySiteQuestionsPage />);

    fireEvent.change(await screen.findByLabelText("admin.companyAiLists.questions.addLabel"), {
      target: { value: "who builds the best websites in Leeds" },
    });
    fireEvent.click(screen.getByRole("button", { name: /admin.companyAiLists.questions.add/ }));

    await waitFor(() => expect(add).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1",
      prompt: "who builds the best websites in Leeds",
      engines: ["chatgpt", "claude"],
    }));
  });

  it("shows how many prompts the website asks against its limit, with the way to change it", async () => {
    renderWithProviders(<CompanySiteQuestionsPage />);

    expect(await screen.findByText("admin.companyAiLists.questions.allowance.title")).toBeInTheDocument();
    expect(screen.getByText("admin.companyAiLists.questions.allowance.left")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "admin.companyAiLists.questions.allowance.meter" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("link", { name: /admin.companyAiLists.questions.allowance.change/ }))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/site/companyWebsite_1/limits");
  });

  it("at the limit takes no more prompts, and says why", async () => {
    vi.mocked(useQuery).mockImplementation(answer(10, 10));
    renderWithProviders(<CompanySiteQuestionsPage />);

    expect(await screen.findByText("admin.companyAiLists.questions.allowance.full")).toBeInTheDocument();
    expect(screen.getByLabelText("admin.companyAiLists.questions.addLabel")).toBeDisabled();
    const addButton = screen.getByRole("button", { name: /admin.companyAiLists.questions.add$/ });
    expect(addButton).toBeDisabled();
    expect(addButton.closest("[title]")).toHaveAttribute("title", "admin.companyAiLists.questions.allowance.fullTip");
  });

  it("changes a question's words with the pencil, and says what that means", async () => {
    renderWithProviders(<CompanySiteQuestionsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "admin.companyAiLists.questions.edit" }));
    fireEvent.change(screen.getByLabelText("admin.companyAiLists.questions.editLabel"), {
      target: { value: "who is the best branding agency in Leeds, UK" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin.companyAiLists.questions.save" }));

    await waitFor(() => expect(add).toHaveBeenCalledWith({
      questionId: "question_1", prompt: "who is the best branding agency in Leeds, UK", engines: ["chatgpt"],
    }));
    expect(await screen.findByText("admin.companyAiLists.questions.edited")).toBeInTheDocument();
  });

  it("changes which assistants a question is asked of, in the same edit", async () => {
    renderWithProviders(<CompanySiteQuestionsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "admin.companyAiLists.questions.edit" }));
    // The row's own dropdown, beside the add box's.
    const pickers = screen.getAllByRole("button", { name: "admin.companyAiLists.questions.askedOfLabel" });
    expect(pickers).toHaveLength(2);
    fireEvent.click(pickers[1]);
    fireEvent.click(screen.getByLabelText("aiEngines.claude"));
    fireEvent.click(screen.getByRole("button", { name: "admin.companyAiLists.questions.save" }));

    await waitFor(() => expect(add).toHaveBeenCalledWith({
      questionId: "question_1", prompt: "who is the best branding agency in Leeds", engines: ["chatgpt", "claude"],
    }));
    expect(await screen.findByText("admin.companyAiLists.questions.editedEngines")).toBeInTheDocument();
  });
});
