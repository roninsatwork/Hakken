import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries } from "@/src/test/siteViewFixtures";
import CompanySiteQuestionsPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", companyWebsiteId: "companyWebsite_1" }));

/**
 * The company's own AI questions for its website
 * (docs/plans/active/private-tracking-lists-plan.md, V4): read and added
 * through its hold, never the website's, so no other company's list is
 * touched or shown.
 */
describe("the AI questions list", () => {
  const add = vi.fn(async () => "question_2");

  beforeEach(() => {
    add.mockClear();
    vi.mocked(useMutation).mockImplementation(() => add as never);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "websiteCanonical:listEngines": ["chatgpt", "claude"],
      "websiteCanonical:listWebsiteQuestions": {
        data: [{ _id: "question_1", prompt: "who is the best branding agency in Leeds", engines: ["chatgpt"], isActive: true, createdAt: 1 }],
        totalCount: 1,
        totalPages: 1,
        engineCalls: 1,
      },
    }));
  });

  it("lists this company's questions, read through its own hold", async () => {
    renderWithProviders(<CompanySiteQuestionsPage />);

    expect(await screen.findByText("who is the best branding agency in Leeds")).toBeInTheDocument();
    const asked = vi.mocked(useQuery).mock.calls.find(([, args]) => (args as { page?: number })?.page === 1);
    expect(asked?.[1]).toMatchObject({ companyWebsiteId: "companyWebsite_1" });
  });

  it("adds a question to this company's own list", async () => {
    renderWithProviders(<CompanySiteQuestionsPage />);

    fireEvent.change(await screen.findByLabelText("admin.siteView.questions.addLabel"), {
      target: { value: "who builds the best websites in Leeds" },
    });
    fireEvent.click(screen.getByRole("button", { name: /admin.siteView.questions.add/ }));

    await waitFor(() => expect(add).toHaveBeenCalledWith({
      companyWebsiteId: "companyWebsite_1",
      prompt: "who builds the best websites in Leeds",
      engines: ["chatgpt", "claude"],
    }));
  });
});
