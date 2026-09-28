import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries } from "@/src/test/siteViewFixtures";
import { PromptFanOut } from "./PromptFanOut";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }));

const row = (queryText: string, extra: Record<string, unknown> = {}) => ({
  query: queryText.toLowerCase(), queryText, own: false, ticked: false, timesSeen: 3, ...extra,
});

const screenData = (extra: Record<string, unknown> = {}) => ({
  question: {
    _id: "question_1", prompt: "who are the best web designers in Surrey, England", companyWebsiteId: "hold_1", host: "ronins.co.uk",
    engines: ["chatgpt", "perplexity", "claude"], isActive: true,
  },
  rows: [
    row("web design agency Guildford", { own: true, ticked: true, timesSeen: null }),
    row("best web designers Surrey England", { timesSeen: 8 }),
    row("top web design companies Surrey England", { ticked: true, timesSeen: 1 }),
  ],
  ticked: { count: 2, limit: 200 },
  checkUsd: 0.003,
  generateUsd: 0.029,
  generating: null,
  collecting: true,
  cut: false,
  ...extra,
});

const answer = (data = screenData()) => answerQueries({
  "companyAiLists:companyAiListCounts": { questions: 1, searches: 3, fanOut: 3, websites: [] },
  "promptFanOut:getPromptFanOut": data,
});

/**
 * One prompt's fan-out queries (docs/plans/active/prompt-fan-out-queries-plan.md),
 * opt-in (fan-out-opt-in-plan.md): an admin list — a tick box to check one on
 * Google every run, add, the pencil to edit, the trash can to delete with an
 * undo, and Generate — every icon with its tooltip, and no Google positions.
 */
describe("a prompt's fan-out queries", () => {
  // One answer for every mutation: each reads only its own part.
  const mutate = vi.fn(async () => ({ ticked: true, wasTicked: false }) as unknown);

  beforeEach(() => {
    mutate.mockReset();
    mutate.mockResolvedValue({ ticked: true, wasTicked: false });
    vi.mocked(useMutation).mockImplementation(() => mutate as never);
    vi.mocked(useQuery).mockImplementation(answer());
  });

  it("is the prompt's list: a tick box per query, how often the AIs searched it, and pencil and trash icons with their tooltips", async () => {
    renderWithProviders(<PromptFanOut questionId={"question_1" as never} />);

    expect(await screen.findByText("admin.promptFanOut.title")).toBeInTheDocument();
    expect(screen.getByText("best web designers Surrey England")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin.promptFanOut.back/ })).toHaveAttribute("href", "/admin/companies/company_1/websites/ai-searches");
    const ticks = screen.getAllByRole("checkbox", { name: "admin.promptFanOut.tickLabel" });
    expect(ticks.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false, true]);
    expect(screen.getAllByText("admin.promptFanOut.everyRun")).toHaveLength(2);
    expect(screen.getAllByText("admin.promptFanOut.onceOnly")).toHaveLength(1);
    expect(screen.getByText("admin.promptFanOut.yourOwn")).toBeInTheDocument();
    expect(screen.getAllByText("admin.promptFanOut.seen")).toHaveLength(2);
    const edits = screen.getAllByRole("button", { name: "admin.promptFanOut.editRow" });
    expect(edits).toHaveLength(3);
    expect(edits[0]).toHaveAttribute("title", "admin.promptFanOut.editRow");
    expect(screen.getAllByRole("button", { name: "admin.promptFanOut.deleteRow" })[0]).toHaveAttribute("title", "admin.promptFanOut.deleteRow");
    // Nothing that came back: no Google position, no switch.
    expect(screen.queryByText(/position/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("ticks one to check it on Google every run, and unticks another", async () => {
    renderWithProviders(<PromptFanOut questionId={"question_1" as never} />);

    const ticks = await screen.findAllByRole("checkbox", { name: "admin.promptFanOut.tickLabel" });
    fireEvent.click(ticks[1]);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({
      companyId: "company_1", questionId: "question_1", queryText: "best web designers Surrey England", ticked: true,
    }));
    fireEvent.click(ticks[2]);
    await waitFor(() => expect(mutate).toHaveBeenLastCalledWith({
      companyId: "company_1", questionId: "question_1", queryText: "top web design companies Surrey England", ticked: false,
    }));
  });

  it("at the website's limit, greys the empty boxes and says why; past it, says what to do", async () => {
    vi.mocked(useQuery).mockImplementation(answer(screenData({ ticked: { count: 200, limit: 200 } })));
    const { unmount } = renderWithProviders(<PromptFanOut questionId={"question_1" as never} />);

    const ticks = await screen.findAllByRole("checkbox", { name: "admin.promptFanOut.tickLabel" });
    expect(ticks.map((box) => (box as HTMLInputElement).disabled)).toEqual([false, true, false]);
    expect(ticks[1].closest("[title]")).toHaveAttribute("title", "admin.promptFanOut.full");
    expect(screen.queryByText("admin.promptFanOut.over")).not.toBeInTheDocument();
    unmount();

    vi.mocked(useQuery).mockImplementation(answer(screenData({ ticked: { count: 250, limit: 200 } })));
    renderWithProviders(<PromptFanOut questionId={"question_1" as never} />);
    expect(await screen.findByText("admin.promptFanOut.over")).toBeInTheDocument();
  });

  it("deletes one with the trash can, and undoes it — ticked again if it was", async () => {
    mutate.mockResolvedValue({ ticked: true, wasTicked: true });
    renderWithProviders(<PromptFanOut questionId={"question_1" as never} />);

    fireEvent.click((await screen.findAllByRole("button", { name: "admin.promptFanOut.deleteRow" }))[2]);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({
      companyId: "company_1", questionId: "question_1", queryText: "top web design companies Surrey England",
    }));
    fireEvent.click(await screen.findByRole("button", { name: "admin.promptFanOut.undo" }));
    await waitFor(() => expect(mutate).toHaveBeenLastCalledWith({
      companyId: "company_1", questionId: "question_1", queryText: "top web design companies Surrey England", ticked: true,
    }));
  });

  it("edits one's words with the pencil", async () => {
    renderWithProviders(<PromptFanOut questionId={"question_1" as never} />);

    fireEvent.click((await screen.findAllByRole("button", { name: "admin.promptFanOut.editRow" }))[1]);
    fireEvent.change(screen.getByLabelText("admin.promptFanOut.editLabel"), { target: { value: "best web designers Surrey 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "admin.promptFanOut.save" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({
      companyId: "company_1", questionId: "question_1", from: "best web designers Surrey England", queryText: "best web designers Surrey 2026",
    }));
  });

  it("adds one of the company's own, and says so when the website is full and it could not be ticked", async () => {
    mutate.mockResolvedValue({ ticked: false, wasTicked: false });
    renderWithProviders(<PromptFanOut questionId={"question_1" as never} />);

    fireEvent.change(await screen.findByLabelText("admin.promptFanOut.addLabel"), { target: { value: "web designers Woking" } });
    fireEvent.click(screen.getByRole("button", { name: /admin.promptFanOut.add$/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ companyId: "company_1", questionId: "question_1", queryText: "web designers Woking" }));
    expect(await screen.findByText("admin.promptFanOut.notTicked")).toBeInTheDocument();
  });

  it("generates now, unless the company's collection is switched off", async () => {
    const { unmount } = renderWithProviders(<PromptFanOut questionId={"question_1" as never} />);
    mutate.mockResolvedValue({ asked: 3, reused: 0, sending: true } as never);
    const generate = await screen.findByRole("button", { name: /admin.promptFanOut.generate$/ });
    expect(generate).toHaveAttribute("title", "admin.promptFanOut.generateTip");
    fireEvent.click(generate);
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ companyId: "company_1", questionId: "question_1" }));
    unmount();

    vi.mocked(useQuery).mockImplementation(answer(screenData({ collecting: false })));
    renderWithProviders(<PromptFanOut questionId={"question_1" as never} />);
    expect(await screen.findByRole("button", { name: /admin.promptFanOut.generate$/ })).toBeDisabled();
    expect(screen.getByText("admin.promptFanOut.generateOff")).toBeInTheDocument();
  });
});
