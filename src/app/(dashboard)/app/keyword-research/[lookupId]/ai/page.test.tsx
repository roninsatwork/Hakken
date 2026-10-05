import { act, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { AI_ENGINE_KEYS, ANSWERS, IDEAS, OVERVIEW, SETUP, answerResearch } from "@/src/test/keywordResearchFixtures";
import LookupLayout from "../layout";
import LookupAnswersPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t, has: () => false });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/keyword-research/lookup_1/ai",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ lookupId: "lookup_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

async function open(answers: Partial<typeof ANSWERS> = {}, overview: Partial<typeof OVERVIEW> = {}) {
  const mutation = answerResearch({
    "keywordResearch:lookupOverview": { ...OVERVIEW, ...overview },
    "keywordResearch:researchSetup": SETUP,
    "keywordResearchIdeas:lookupIdeas": IDEAS,
    "keywordResearchAnswers:lookupAnswers": { ...ANSWERS, ...answers },
  });
  await act(async () => {
    render(<LookupLayout><LookupAnswersPage /></LookupLayout>);
  });
  return mutation;
}

const card = (title: string) => screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

/**
 * What the AI says (board 4 of keyword-research-plan.md): the question asked
 * of four assistants, who each names and whether the website is one, and
 * what Google's AI Overview searched.
 */
describe("a lookup's What the AI says", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    vi.mocked(useAction).mockReset();
  });

  it("draws the question, the figures across the four, each assistant's answer and the cards beneath", async () => {
    await open();

    const menu = screen.getByRole("navigation", { name: "keywordResearch.lookup.menu" });
    expect(within(menu).getByRole("link", { name: /keywordResearch\.lookup\.ai/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/keywordResearch\.ai\.asked .* 20 30/)).toBeInTheDocument();
    expect(within(card("keywordResearch.ai.question")).getByText("keywordResearch.ai.quoted Which web design agency should I use in the UK?")).toBeInTheDocument();

    const nameYou = screen.getByText("keywordResearch.ai.nameYou").closest("[data-part='figure']") as HTMLElement;
    expect(within(nameYou).getByText("keywordResearch.ai.ofAnswered 1 4")).toBeInTheDocument();
    expect(within(nameYou).getByText("keywordResearch.ai.place aiEngines.perplexity 4 7")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.ai.rivalMost plugandplaydesign.co.uk")).toBeInTheDocument();
    expect(screen.getByText("keywordResearch.ai.citedNoneYours")).toBeInTheDocument();

    const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([...AI_ENGINE_KEYS].sort().map((engine) => `aiEngines.${engine}`));
    expect(rows[3]).toHaveTextContent("keywordResearch.ai.namesYou");
    expect(rows[3]).toHaveTextContent("acme-agency.test");
    expect(rows[3]).toHaveTextContent("plugandplaydesign.co.uk, pixelfield.co.uk");
    expect(rows[3]).toHaveTextContent("9");
    expect(rows[1]).toHaveTextContent("keywordResearch.ai.doesNotNameYou");
    expect(screen.getByText("ui.tableBar.assistants 4")).toBeInTheDocument();

    const named = card("keywordResearch.ai.namedMost");
    expect(within(named).getByText("keywordResearch.ai.ofAnswered 4 4")).toBeInTheDocument();
    const searched = card("keywordResearch.ai.overviewSearched");
    expect(within(searched).getByText("keywordResearch.ai.missingTopic")).toBeInTheDocument();
    expect(within(searched).getByText("keywordResearch.ai.overviewHintMissing 1")).toBeInTheDocument();
  });

  it("opens each assistant's row to its answer word for word, in the one table", async () => {
    await open();

    const table = screen.getAllByRole("table")[0];
    const perplexity = within(table).getByRole("button", { name: "keywordResearch.ai.answerTitle aiEngines.perplexity" });
    expect(perplexity).toHaveAttribute("aria-expanded", "false");
    expect(within(table).getAllByRole("button", { name: /keywordResearch\.ai\.answerTitle/ })).toHaveLength(4);
    expect(screen.queryByText(/Some agencies to consider/)).not.toBeInTheDocument();

    fireEvent.click(perplexity);

    expect(perplexity).toHaveAttribute("aria-expanded", "true");
    const answer = document.getElementById(perplexity.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(table).toContainElement(answer);
    expect(answer).toHaveTextContent("Some agencies to consider: kota.co.uk, madebyshape.co.uk, plugandplaydesign.co.uk, acme-agency.test");
  });

  it("draws an answer's links without their tracking, its [n] as links to what it cites, and those pages beside it, numbered", async () => {
    const perplexity = {
      ...ANSWERS.engines[1],
      answer: "A shortlist: **[Apadmi](https://www.apadmi.com/?utm_source=openai)** for enterprise.[2]",
      cited: [{ url: "https://clutch.co/uk/app-developers/london", host: "clutch.co" }, { url: "https://www.designrush.com/agency/mobile-app?utm_source=openai", host: "designrush.com" }],
    };
    const claude = { ...ANSWERS.engines[0], answer: "I can't browse; try Clutch.", cited: [] };
    await open({ engines: [claude, perplexity, ...ANSWERS.engines.slice(2)] });

    fireEvent.click(screen.getByRole("button", { name: "keywordResearch.ai.answerTitle aiEngines.perplexity" }));
    const opened = screen.getByRole("button", { name: "keywordResearch.ai.answerTitle aiEngines.perplexity" });
    const answer = document.getElementById(opened.getAttribute("aria-controls") ?? "") as HTMLElement;

    expect(within(answer).getByRole("link", { name: "Apadmi" })).toHaveAttribute("href", "https://www.apadmi.com/");
    expect(within(answer).getByRole("link", { name: "2" })).toHaveAttribute("href", "https://www.designrush.com/agency/mobile-app");
    const sources = within(answer).getByText("keywordResearch.ai.sources").parentElement as HTMLElement;
    expect(within(sources).getAllByRole("link").map((link) => link.textContent)).toEqual(["clutch.co/uk/app-developers/london", "designrush.com/agency/mobile-app"]);
    expect(within(sources).getByText("2")).toBeInTheDocument();

    const claudeRow = screen.getByRole("button", { name: `keywordResearch.ai.answerTitle aiEngines.${claude.engine}` });
    fireEvent.click(claudeRow);
    const claudeAnswer = document.getElementById(claudeRow.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(within(claudeAnswer).getByText("keywordResearch.ai.sourcesNone")).toBeInTheDocument();
  });

  it("gives an assistant that wrote nothing no answer to open", async () => {
    await open({ engines: [...ANSWERS.engines.slice(0, 3), { ...ANSWERS.engines[3], answered: false, answer: "" }] });

    expect(within(screen.getAllByRole("table")[0]).getAllByRole("button", { name: /keywordResearch\.ai\.answerTitle/ })).toHaveLength(3);
  });

  it("asks the first time it opens, and again on Ask again", async () => {
    const mutation = await open();

    expect(mutation("openAnswers")).toHaveBeenCalledWith({ lookupId: "lookup_1" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "keywordResearch.ai.askAgain" }));
    });
    expect(mutation("openAnswers")).toHaveBeenLastCalledWith({ lookupId: "lookup_1", again: true });
  });

  it("waits while the assistants are asked, and fills in by itself", async () => {
    await open({ state: "WAITING", figures: null, engines: [], question: null, askedAt: null });

    expect(screen.getByText("keywordResearch.ai.waiting")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says why asking failed, with Ask again", async () => {
    const mutation = await open({ state: "FAILED", problem: "NO_ANSWER" });

    const notice = screen.getByText("keywordResearch.problems.NO_ANSWER").closest("[data-part='notice']") as HTMLElement;
    await act(async () => {
      fireEvent.click(within(notice).getByRole("button", { name: "keywordResearch.ai.askAgain" }));
    });
    expect(mutation("openAnswers")).toHaveBeenLastCalledWith({ lookupId: "lookup_1", again: true });
  });

  it("never passes sample answers off as real", async () => {
    await open({ sample: true });
    expect(screen.getByText("keywordResearch.sample")).toBeInTheDocument();
  });

  it("asks nothing for a read-only account, which still reads the answers", async () => {
    const mutation = await open({ canAsk: false }, { canLookUp: false });

    expect(mutation("openAnswers")).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "keywordResearch.ai.askAgain" })).not.toBeInTheDocument();
    expect(within(screen.getAllByRole("table")[0]).getAllByRole("row")).toHaveLength(5);
  });
});
