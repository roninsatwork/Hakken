import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HakkenSees } from "./HakkenSees";
import { HakkenSeesEye } from "./HakkenSeesEye";
import { SeesPanel } from "./SeesPanel";
import { PageHeader } from "./PageHeader";
import { SeesStandIn, standInScreen } from "./SeesStandIn";
import { noteSeesThread, resetSees, useSeesPart, useSeesSectionLinks } from "./hakkenSeesStore";
import { seesKey } from "@/convex/utils/seesAsk";
import { seenAdvice } from "@/convex/utils/hakkenSees";

vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const words = (key: string, values?: Record<string, unknown>) =>
        [`${namespace}.${key}`, ...Object.values(values ?? {}).filter((value) => typeof value !== "function")].join(" ");
      // The findings' words carry their figures in rich tags: the same key and values, as plain text.
      return Object.assign(words, { rich: words });
    },
  };
});
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
const at = vi.hoisted(() => ({ path: "/app/sites/s1/radar" }));
vi.mock("next/navigation", () => ({ usePathname: () => at.path }));
// The eye asks the Insights team when a page hands over its figures (sees-conversion-specialist-plan-2026-10-30.md).
vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

beforeEach(() => {
  window.localStorage.clear();
  resetSees();
  at.path = "/app/sites/s1/radar";
  vi.mocked(useQuery).mockReset();
  vi.mocked(useQuery).mockReturnValue(undefined);
  vi.mocked(useMutation).mockReset();
  vi.mocked(useMutation).mockReturnValue(vi.fn() as never);
});

const says = ["Google's spam update moved your positions three times as much as usual.", "Your clicks fell 9%."];
/** The words as the panel shows them: a sentence to a line, its figures in their own font. */
const sentences = () => [...document.querySelectorAll("[data-part='sees-sentence']")].map((line) => line.textContent);
/** The list of what a press is doing, while it writes. */
const working = () => document.querySelector("[data-part='sees-working']");
const steps = [
  { words: "Hold big changes until 22 October.", link: "See the update", href: "/app/x" },
  { words: "Get listed on clutch.co.", link: "Visit clutch.co", href: "https://clutch.co", external: true },
];
// The eye is the one button named What Hakken sees; the open bubble is a dialog of the same name.
const eye = () => screen.getByRole("button", { name: "ui.hakkenSees.title Hakken" });
const bubble = () => screen.queryByRole("dialog", { name: "ui.hakkenSees.title Hakken" });

/** A screen as the app assembles it: the top bar's eye, a header, then the page with its box. */
function Screen(props: { says?: string[]; steps?: typeof steps; advice?: string }) {
  return (
    <>
      <HakkenSeesEye />
      <PageHeader icon={null} title="Brand radar" />
      <HakkenSees says={props.says ?? says} steps={props.steps ?? steps} advice={props.advice ?? "update | hold, clutch"} />
    </>
  );
}

/**
 * What Hakken sees (discovery-detail-and-hakken-sees-plan.md §2) opens from
 * the eye in the header (sees-header-and-rolling-dates-plan.md, part one):
 * closed until clicked, then the sentences, "Do first" and the numbered
 * steps, each with a quiet link to where it is done.
 */
describe("HakkenSees and its eye", () => {
  it("is closed until the eye opens it, which says what it sees, then the first things to do, each linked", () => {
    render(<Screen />);
    expect(screen.queryByText(says[0], { exact: false })).toBeNull();
    expect(eye()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(eye());
    expect(eye()).toHaveAttribute("aria-expanded", "true");
    expect(sentences()).toEqual(says);
    expect(screen.getByText("ui.hakkenSees.doFirst")).toBeInTheDocument();
    expect(screen.getByText("1. Hold big changes until 22 October.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the update" })).toHaveAttribute("href", "/app/x");
    const away = screen.getByRole("link", { name: "Visit clutch.co" });
    expect(away).toHaveAttribute("target", "_blank");
    expect(away).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("with nothing to do, shows the sentences alone", () => {
    render(<Screen says={["Nothing here needs you this week."]} steps={[]} advice="calm |" />);
    fireEvent.click(eye());
    expect(sentences()).toEqual(["Nothing here needs you this week."]);
    expect(screen.queryByText("ui.hakkenSees.doFirst")).toBeNull();
  });

  // The speech bubble (the Conversions canvas, board "Sees", 2026-10-30): under the eye, closed by Escape, a click outside, or the eye.
  it("counts the steps as new until opened; the eye slides the panel over the page, and Escape or a click on the page behind closes it", () => {
    render(<Screen />);
    expect(screen.getByText("ui.hakkenSees.new 2")).toBeInTheDocument();
    expect(bubble()).toBeNull();
    fireEvent.click(eye());
    expect(screen.queryByText("ui.hakkenSees.new 2")).toBeNull();
    expect(bubble()).not.toBeNull();
    // Drawn over the page, out of any bar's layer (SidePanel, 2026-10-31), and named for the eye that opened it.
    expect(eye().closest("[data-part='sees-eye']")).not.toContainElement(bubble());
    expect(bubble()).toHaveAttribute("data-part", "side-panel");
    expect(eye()).toHaveAttribute("aria-controls", bubble()!.id);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(eye()).toHaveAttribute("aria-expanded", "false");
    expect(bubble()).toBeNull();
    fireEvent.click(eye());
    expect(bubble()).not.toBeNull();
    fireEvent.mouseDown(document.querySelector("[data-part='side-panel-scrim']")!);
    expect(bubble()).toBeNull();
    // Its own close button closes it too.
    fireEvent.click(eye());
    fireEvent.click(screen.getByRole("button", { name: "ui.sidePanel.close" }));
    expect(bubble()).toBeNull();
    expect(screen.queryByText("ui.hakkenSees.doFirst")).toBeNull();
  });

  it("remembers the advice read on that screen, and counts again when it changes or on another screen (HS3)", () => {
    const first = render(<Screen />);
    fireEvent.click(eye());
    first.unmount();
    resetSees();
    const again = render(<Screen says={["The same advice on today's figures."]} />);
    expect(screen.queryByText(/ui\.hakkenSees\.new/)).toBeNull();
    again.rerender(<Screen says={["Google is calm for your keywords."]} steps={[steps[0]]} advice="calm | hold" />);
    expect(screen.getByText("ui.hakkenSees.new 1")).toBeInTheDocument();
    again.unmount();
    resetSees();
    at.path = "/app/sites/s2/radar";
    render(<Screen />);
    expect(screen.getByText("ui.hakkenSees.new 2")).toBeInTheDocument();
  });

  // The eye left the page titles for the top bar on 2026-10-30: headers draw none, the top bar one.
  it("draws no eye on a screen without a box, and one eye however many headers the screen stacks", () => {
    render(<><HakkenSeesEye /><PageHeader icon={null} title="Settings" /></>);
    expect(screen.queryByRole("button", { name: "ui.hakkenSees.title Hakken" })).toBeNull();
    resetSees();
    render(
      <>
        <HakkenSeesEye />
        <PageHeader icon={null} title="kordatackle.com" />
        <PageHeader icon={null} title="Overview" />
        <HakkenSees says={says} steps={steps} />
      </>,
    );
    expect(screen.getAllByRole("button", { name: "ui.hakkenSees.title Hakken" })).toHaveLength(1);
  });

  // The eye asks the Insights team (sees-conversion-specialist-plan-2026-10-30.md S2, S11, S12): a page that hands over its
  // figures gets "Hakken is researching…" while the team writes, then the team's words; a team that cannot answer leaves the rule's.
  describe("a page that hands its figures to the Insights team", () => {
    const ask = {
      siteId: "site_1" as never, screen: "googleAnalytics.conversions", about: "Conversions", path: "/app/analytics/site_1/conversions",
      period: "lastMonth", country: "", device: "",
      facts: [{ key: "conv.total.now", value: 23, unit: "count" as const, label: "conversions last month" }],
      links: [{ label: "Funnel", href: "/app/analytics/site_1/funnel" }],
    };
    const Asking = () => (
      <>
        <HakkenSeesEye />
        <HakkenSees says={says} steps={steps} advice="rule" ask={ask} />
      </>
    );

    it("says what the press is doing while the team writes, then the team's words with their links", async () => {
      const askSees = vi.fn(async () => ({ key: "googleAnalytics.conversions|lastMonth|||", status: "RESEARCHING" as const }));
      vi.mocked(useMutation).mockReturnValue(askSees as never);
      let answer: unknown = { status: "RESEARCHING", says: [], steps: [], role: null, writtenAt: null };
      vi.mocked(useQuery).mockImplementation(((_reference: unknown, args: unknown) => (args === "skip" ? undefined : answer)) as never);
      const view = render(<Asking />);
      fireEvent.click(eye());
      await waitFor(() => expect(askSees).toHaveBeenCalledWith(ask));
      expect(working()).toHaveTextContent("ui.hakkenSees.working.reading");
      expect(sentences()).toEqual([]);
      answer = { status: "WRITTEN", says: ["23 conversions last month, down on the month before."], steps: [{ words: "Look at where visits leave.", link: "Funnel", href: "/app/analytics/site_1/funnel" }], role: "INSIGHTS_CONVERSION", writtenAt: 1 };
      view.rerender(<Asking />);
      expect(sentences()).toEqual(["23 conversions last month, down on the month before."]);
      expect(screen.getByRole("link", { name: "Funnel" })).toHaveAttribute("href", "/app/analytics/site_1/funnel");
      expect(working()).toBeNull();
    });

    it("shows what code found at once, and a question asked in the panel starts an Ask Hakken conversation for the page (sees-side-panel plan, phase 3)", async () => {
      const calls: Array<[string, unknown]> = [];
      // One mock answers every mutation the eye uses: the team's ask, a new conversation, a sent message.
      vi.mocked(useMutation).mockImplementation(((reference: unknown) => vi.fn(async (args: unknown) => {
        const name = getFunctionName(reference as never);
        calls.push([name, args]);
        if (name.includes("createThread")) return "thread_1";
        if (name.includes("sendMessage")) return true;
        return { key: "googleAnalytics.conversions|lastMonth|||", status: "RESEARCHING" };
      })) as never);
      const finding = { id: "above:channel:purchase:Paid Search", kind: "groupAbove", score: 1, params: { by: "channel", group: "Paid Search", event: "purchase", rate: 9.2, siteRate: 3.4 }, facts: [] };
      vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
        if (args === "skip") return undefined;
        if (getFunctionName(reference as never).includes("seesFindings")) return [finding];
        if (getFunctionName(reference as never).includes("getMessages")) return [];
        return { status: "RESEARCHING", says: [], steps: [], role: null, writtenAt: null };
      }) as never);
      render(<Asking />);
      fireEvent.click(eye());
      // Code's finding, in the reader's words, before any model has written.
      expect(screen.getByText(/ui\.hakkenSees\.findings\.group/)).toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox", { name: "ui.hakkenSees.askPlaceholder" }), { target: { value: "Why does Paid Search buy more?" } });
      fireEvent.click(screen.getByRole("button", { name: "ui.hakkenSees.send" }));
      await waitFor(() => expect(calls.some(([name]) => name.includes("sendMessage"))).toBe(true));
      const created = calls.find(([name]) => name.includes("createThread"))![1] as { forWebsiteId: string; startedOn: { path: string; findings: string[] } };
      expect(created.forWebsiteId).toBe("site_1");
      expect(created.startedOn.path).toBe("/app/analytics/site_1/conversions");
      expect(created.startedOn.findings[0]).toContain("Paid Search");
      expect(calls.find(([name]) => name.includes("sendMessage"))![1]).toEqual({ threadId: "thread_1", content: "Why does Paid Search buy more?" });
    });

    it("keeps the rule's words when there is no team to ask, or the Editor sent the words back", async () => {
      vi.mocked(useMutation).mockReturnValue(vi.fn(async () => ({ key: "k", status: "FAILED" as const })) as never);
      render(<Asking />);
      fireEvent.click(eye());
      await waitFor(() => expect(sentences()).toEqual(says));
      expect(working()).toBeNull();
    });
  });

  describe("a page that hands over its own figures (sees-every-page-plan-2026-10-31.md, phase 1)", () => {
    const page = {
      screen: "searchConsole.keywords", siteId: "site_1" as never, period: "lastMonth", country: "", device: "",
      data: { rows: [{ key: "door handles", clicks: 840, ctr: 0.07 }] },
      links: [{ label: "Pages", href: "/app/search-console/site_1/pages" }],
    };
    const Paged = ({ words = says, data = page.data }: { words?: string[]; data?: unknown }) => (
      <>
        <HakkenSeesEye />
        <HakkenSees says={words} steps={[{ words: "Look at your pages.", link: "Keywords", href: "/app/search-console/site_1/keywords" }]} advice="rule" page={{ ...page, data }} />
      </>
    );

    it("is pressed as the page's figures: keyed on the server, its links the rule's steps and the page's", async () => {
      at.path = "/app/search-console/site_1/keywords";
      const askSees = vi.fn(async () => ({ key: "k", status: "RESEARCHING" as const }));
      vi.mocked(useMutation).mockReturnValue(askSees as never);
      render(<Paged />);
      fireEvent.click(eye());
      await waitFor(() => expect(askSees).toHaveBeenCalled());
      expect(askSees.mock.calls[0]).toEqual([expect.objectContaining({
        siteId: "site_1", screen: "searchConsole.keywords", path: "/app/search-console/site_1/keywords", period: "lastMonth", facts: [],
        links: [{ label: "Keywords", href: "/app/search-console/site_1/keywords" }, { label: "Pages", href: "/app/search-console/site_1/pages" }],
        // The click rate as the page shows it, a percentage.
        data: { rows: [{ key: "door handles", clicks: 840, ctrPercent: 7 }] },
      })]);
    });

    it("is pressed with the section's other pages as places to point, after the page's own (shared work 6)", async () => {
      at.path = "/app/search-console/site_1/keywords";
      const askSees = vi.fn(async () => ({ key: "k", status: "RESEARCHING" as const }));
      vi.mocked(useMutation).mockReturnValue(askSees as never);
      // The section's menu publishes its pages; the eye adds those it does not already have.
      const Menu = () => {
        useSeesSectionLinks([{ label: "Pages", href: "/app/search-console/site_1/pages" }, { label: "Countries", href: "/app/search-console/site_1/countries" }]);
        return null;
      };
      render(<><Menu /><Paged /></>);
      fireEvent.click(eye());
      await waitFor(() => expect(askSees).toHaveBeenCalled());
      expect(askSees.mock.calls[0]).toEqual([expect.objectContaining({
        links: [{ label: "Keywords", href: "/app/search-console/site_1/keywords" }, { label: "Pages", href: "/app/search-console/site_1/pages" }, { label: "Countries", href: "/app/search-console/site_1/countries" }],
      })]);
    });

    it("on a page's own screen, is pressed for that page and the period shown: its record in the address, the opening period when the address has none", async () => {
      // Every page's own screen shared one answer, keyed by none of its dates (page-screen-redo-plan-2026-11-03.md).
      at.path = "/app/analytics/site_1/all-pages/page";
      window.history.replaceState(null, "", "/app/analytics/site_1/all-pages/page?key=~fu&chartShow=less");
      const askSees = vi.fn(async () => ({ key: "k", status: "RESEARCHING" as const }));
      vi.mocked(useMutation).mockReturnValue(askSees as never);
      render(
        <>
          <HakkenSeesEye />
          <HakkenSees says={says} steps={[]} advice="rule" page={{ screen: "googleAnalytics.page", siteId: "site_1" as never, data: { boxes: { views: 2107, viewsBefore: 2181, boughtRate: 1.4 } } }} />
        </>,
      );
      fireEvent.click(eye());
      await waitFor(() => expect(askSees).toHaveBeenCalled());
      expect(askSees.mock.calls[0]).toEqual([expect.objectContaining({
        screen: "googleAnalytics.page", path: "/app/analytics/site_1/all-pages/page?key=~fu", period: "lastMonth",
        // A Google Analytics rate past 1 is a percentage past 100, never left as it was.
        data: { boxes: { views: 2107, viewsBefore: 2181, boughtRatePercent: 140 } },
      })]);
      window.history.replaceState(null, "", "/");
    });

    it("shows what code finds in the page's own figures the moment it opens, before anything is written", async () => {
      vi.mocked(useMutation).mockReturnValue(vi.fn(async () => ({ key: "k", status: "RESEARCHING" as const })) as never);
      render(
        <>
          <HakkenSeesEye />
          <HakkenSees says={says} steps={[]} advice="rule" page={{ ...page, data: { rows: [{ key: "door handles", clicks: 520 }, { key: "hinges", clicks: 160 }, { key: "knobs", clicks: 120 }, { key: "stops", clicks: 60 }] } }} />
        </>,
      );
      fireEvent.click(eye());
      expect(screen.getByText(/ui\.hakkenSees\.findings\.holdsMost door handles/)).toBeInTheDocument();
    });

    it("stays open while the page's figures change under it", async () => {
      vi.mocked(useMutation).mockReturnValue(vi.fn(async () => ({ key: "k", status: "FAILED" as const })) as never);
      const view = render(<Paged />);
      fireEvent.click(eye());
      expect(bubble()).not.toBeNull();
      view.rerender(<Paged data={{ rows: [{ key: "door handles", clicks: 900 }] }} />);
      expect(bubble()).not.toBeNull();
    });

    it("at zero credits says so, with the way to Billing, and keeps the rule's words", async () => {
      vi.mocked(useMutation).mockReturnValue(vi.fn(async () => ({ key: "k", status: "NO_CREDITS" as const })) as never);
      render(<Paged />);
      fireEvent.click(eye());
      await waitFor(() => expect(screen.getByText(/ui\.hakkenSees\.noCredits/)).toBeInTheDocument());
      expect(sentences()).toEqual(says);
      expect(working()).toBeNull();
    });

    it("a page with nothing to say by its rule still has an eye, and points to the chat", async () => {
      vi.mocked(useMutation).mockReturnValue(vi.fn(async () => ({ key: "k", status: "FAILED" as const })) as never);
      render(<Paged words={[]} />);
      fireEvent.click(eye());
      await waitFor(() => expect(screen.getByText("ui.hakkenSees.askBelow")).toBeInTheDocument());
    });

    it("hands over the figures a panel reads for itself, under the panel's name, and forgets them as it goes", async () => {
      at.path = "/app/search-console/site_1/keywords";
      const askSees = vi.fn(async () => ({ key: "k", status: "RESEARCHING" as const }));
      vi.mocked(useMutation).mockReturnValue(askSees as never);
      const table = { rows: [{ key: "Organic Search", visits: 520 }, { key: "Direct", visits: 160 }, { key: "Email", visits: 120 }, { key: "Social", visits: 60 }] };
      const Table = () => { useSeesPart("channelsTable", table); return null; };
      const view = render(<><Paged /><Table /></>);
      fireEvent.click(eye());
      await waitFor(() => expect(askSees).toHaveBeenCalled());
      expect(askSees.mock.calls[0]).toEqual([expect.objectContaining({
        data: { rows: [{ key: "door handles", clicks: 840, ctrPercent: 7 }], channelsTable: table },
      })]);
      // Its findings speak of the panel's rows too.
      expect(screen.getByText(/ui\.hakkenSees\.findings\.holdsMost Organic Search/)).toBeInTheDocument();
      view.rerender(<Paged />);
      expect(screen.queryByText(/Organic Search/)).toBeNull();
    });

    it("dates with nothing for the team to write about keep the rule's words, at once and for nothing", async () => {
      const askSees = vi.fn(async () => ({ key: "k", status: "RESEARCHING" as const }));
      vi.mocked(useMutation).mockReturnValue(askSees as never);
      render(
        <>
          <HakkenSeesEye />
          <HakkenSees says={says} steps={[]} advice="box" page={{ ...page, writes: false }} />
        </>,
      );
      fireEvent.click(eye());
      expect(sentences()).toEqual(says);
      expect(askSees).not.toHaveBeenCalled();
    });

    it("a page whose words are the team's weekly ones writes nothing when pressed", async () => {
      const askSees = vi.fn(async () => ({ key: "k", status: "RESEARCHING" as const }));
      vi.mocked(useMutation).mockReturnValue(askSees as never);
      render(
        <>
          <HakkenSeesEye />
          <HakkenSees says={says} steps={[]} advice="box" page={{ ...page, screen: "insights.strategy" }} />
        </>,
      );
      fireEvent.click(eye());
      expect(sentences()).toEqual(says);
      expect(askSees).not.toHaveBeenCalled();
    });
  });

  describe("a page that put up no eye itself (sees-every-page-plan-2026-10-31.md: no vanishing eyes)", () => {
    it("still has its section's eye, which points to the chat and writes nothing when pressed", async () => {
      at.path = "/app/search-console/site_1/almost-there";
      const askSees = vi.fn(async () => ({ key: "k", status: "RESEARCHING" as const }));
      vi.mocked(useMutation).mockReturnValue(askSees as never);
      render(<><HakkenSeesEye /><SeesStandIn section="searchConsole" siteId={"site_1" as never} /></>);
      fireEvent.click(eye());
      await waitFor(() => expect(screen.getByText("ui.hakkenSees.askBelow")).toBeInTheDocument());
      expect(askSees).not.toHaveBeenCalled();
    });

    it("gives way to the page's own eye, staying open as it does", () => {
      at.path = "/app/search-console/site_1/almost-there";
      const view = render(<><HakkenSeesEye /><SeesStandIn section="searchConsole" /></>);
      fireEvent.click(eye());
      view.rerender(<><HakkenSeesEye /><SeesStandIn section="searchConsole" /><HakkenSees says={says} steps={[]} advice="rule" /></>);
      expect(bubble()).not.toBeNull();
      expect(sentences()).toEqual(says);
    });

    it("is never on a connection page, nor on a website not connected", () => {
      at.path = "/app/analytics/site_1/connection";
      const view = render(<><HakkenSeesEye /><SeesStandIn section="googleAnalytics" /></>);
      expect(screen.queryByRole("button", { name: "ui.hakkenSees.title Hakken" })).toBeNull();
      at.path = "/app/analytics/site_1/channels";
      view.rerender(<><HakkenSeesEye /><SeesStandIn section="googleAnalytics" off /></>);
      expect(screen.queryByRole("button", { name: "ui.hakkenSees.title Hakken" })).toBeNull();
    });

    it("names the page by its address, for what the chat is told", () => {
      expect(standInScreen("searchConsole", "/app/search-console/site_1/almost-there", "site_1")).toBe("searchConsole.almostThere");
      expect(standInScreen("googleAnalytics", "/app/analytics/site_1", "site_1")).toBe("googleAnalytics.overview");
      expect(standInScreen("insights", "/app/insights/page-reviews/page")).toBe("insights.pageReviewsPage");
    });
  });

  it("names its advice by codes and quoted names, never by numbers", () => {
    const box = { says: [{ code: "update", text: "September spam update", a: 5.2 }], steps: [{ code: "hold", link: "seeUpdate", to: { segment: "google-updates" }, a: 22 }] };
    expect(seenAdvice(box)).toBe(seenAdvice({ ...box, says: [{ ...box.says[0], a: 6.1 }] }));
    expect(seenAdvice(box)).not.toBe(seenAdvice({ ...box, says: [{ ...box.says[0], text: "October core update" }] }));
  });
});

describe("the panel's note on written words (decision 3: Live, ask-hakken-every-chart-page-plan-2026-11-03.md)", () => {
  it("says when the words were written where a time is given, and only who wrote them elsewhere", () => {
    const writtenAt = Date.UTC(2026, 10, 3, 18, 42);
    const { rerender } = render(<SeesPanel open onClose={() => {}} says={["14 people now."]} steps={[]} researching={false} written writtenAt={writtenAt} />);
    const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(writtenAt);
    expect(screen.getByText(`ui.hakkenSees.meansNoteAt Hakken ${time}`)).toBeInTheDocument();
    rerender(<SeesPanel open onClose={() => {}} says={["14 people now."]} steps={[]} researching={false} written />);
    expect(screen.getByText("ui.hakkenSees.meansNote Hakken")).toBeInTheDocument();
  });
});

describe("what a press is doing, and its words coming in (Anthony, 2026-11-04)", () => {
  const steps = [{ words: "Look at where visits leave.", link: "Funnel", href: "/app/analytics/site_1/funnel" }];
  const words = ["One two three.", "Four 5% six."];
  /** The words that have come in so far. */
  const cameIn = () => [...document.querySelectorAll("[data-part='sees-sentence'] > span")].filter((word) => !word.classList.contains("opacity-0")).map((word) => word.textContent?.trim());
  const panel = (props: { open?: boolean; researching?: boolean; written?: boolean } = {}) => <SeesPanel open onClose={() => {}} says={words} steps={steps} researching={false} written {...props} />;
  const motionAllowed = (allowed: boolean) => vi.stubGlobal("matchMedia", (query: string) => ({ matches: !allowed, media: query }));

  afterEach(() => vi.useRealTimers());

  it("lists what is done, ticked, then what it is doing now, turning, with its counts", () => {
    render(<SeesPanel open onClose={() => {}} says={[]} steps={[]} researching stages={[{ stage: "reading", count: 40 }, { stage: "finding", count: 6 }, { stage: "writing" }]} />);
    const lines = [...document.querySelectorAll("[data-part^='sees-working-']")];
    expect(lines.map((line) => line.getAttribute("data-part"))).toEqual(["sees-working-done", "sees-working-done", "sees-working-now"]);
    expect(lines[0]).toHaveTextContent("ui.hakkenSees.worked.readingCount 40");
    expect(lines[1]).toHaveTextContent("ui.hakkenSees.worked.finding 6");
    expect(lines[2]).toHaveTextContent("ui.hakkenSees.working.writing");
    expect(lines[2].querySelector("svg")).toHaveClass("animate-spin");
    expect(lines[0].querySelector("svg")).not.toHaveClass("animate-spin");
  });

  it("puts each sentence on its own line, the first leading, with its figures in the numbers' font", () => {
    render(<SeesPanel open onClose={() => {}} says={["108,862 visits came, up 8.2% on GA4's 2nd month, or £40.", "Plain words."]} steps={[]} researching={false} written={false} />);
    expect(sentences()).toEqual(["108,862 visits came, up 8.2% on GA4's 2nd month, or £40.", "Plain words."]);
    expect([...document.querySelectorAll("[data-part='sees-sentence'] .font-mono")].map((figure) => figure.textContent)).toEqual(["108,862", "8.2%", "£40"]);
    const lines = document.querySelectorAll("[data-part='sees-sentence']");
    expect(lines[0]).toHaveClass("text-foreground");
    expect(lines[1]).toHaveClass("text-secondary");
  });

  it("brings the team's words in a word at a time, a beat between sentences, then the steps; once only for each answer", () => {
    vi.useFakeTimers();
    motionAllowed(true);
    const view = render(panel());
    // Every sentence is there from the start, holding its place and read by a screen reader; only the first word shows.
    expect(sentences()).toEqual(words);
    expect(cameIn()).toEqual(["One"]);
    expect(document.querySelector("[data-part='sees-steps']")).toHaveClass("invisible");
    act(() => vi.advanceTimersByTime(60));
    expect(cameIn()).toEqual(["One", "two"]);
    // The first line is the one being read, then the second.
    expect(document.querySelectorAll("[data-part='sees-sentence']")[0]).toHaveClass("text-foreground");
    act(() => vi.advanceTimersByTime(60 * 4));
    expect(cameIn()).toEqual(["One", "two", "three."]);
    act(() => vi.advanceTimersByTime(60));
    expect(cameIn()).toEqual(["One", "two", "three.", "Four"]);
    expect(document.querySelectorAll("[data-part='sees-sentence']")[1]).toHaveClass("text-foreground");
    act(() => vi.advanceTimersByTime(60 * 3));
    expect(cameIn()).toHaveLength(6);
    expect(document.querySelector("[data-part='sees-steps']")).not.toHaveClass("invisible");
    // Closed and opened again, the same words are there whole.
    view.rerender(panel({ open: false }));
    view.rerender(panel());
    expect(cameIn()).toHaveLength(6);
  });

  it("shows them whole at once on a computer set to reduce motion, and a rule's words always", () => {
    motionAllowed(false);
    const view = render(panel());
    expect(cameIn()).toHaveLength(6);
    expect(document.querySelector("[data-part='sees-steps']")).not.toHaveClass("invisible");
    view.unmount();
    motionAllowed(true);
    render(panel({ written: false }));
    expect(cameIn()).toHaveLength(6);
  });

  describe("a super admin's refresh", () => {
    const ask = {
      siteId: "site_1" as never, screen: "googleAnalytics.conversions", about: "Conversions", path: "/app/analytics/site_1/conversions",
      period: "lastMonth", country: "", device: "",
      facts: [{ key: "conv.total.now", value: 23, unit: "count" as const, label: "conversions last month" }],
      links: [],
    };
    const eyeAndPage = () => (
      <>
        <HakkenSeesEye />
        <HakkenSees says={says} steps={[]} advice="rule" ask={ask} />
      </>
    );
    const written = { status: "WRITTEN", says: ["23 conversions last month."], steps: [], role: "INSIGHTS_CONVERSION", writtenAt: 1 };
    const refreshButton = () => screen.queryByRole("button", { name: "ui.hakkenSees.refresh" });

    function asViewer(role: string, answer: unknown = written) {
      const calls: string[] = [];
      vi.mocked(useMutation).mockImplementation(((reference: unknown) => vi.fn(async () => {
        calls.push(getFunctionName(reference as never));
        return { key: "k", status: "RESEARCHING" };
      })) as never);
      vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
        if (args === "skip") return undefined;
        const name = getFunctionName(reference as never);
        if (name.includes("getMessages")) return [];
        return name === "users:getMe" ? { role } : answer;
      }) as never);
      return calls;
    }

    it("writes the words again now, from a button only a super admin has", async () => {
      const calls = asViewer("SUPER_ADMIN");
      render(eyeAndPage());
      fireEvent.click(eye());
      await waitFor(() => expect(calls).toContain("seesAsk:askSees"));
      fireEvent.click(refreshButton()!);
      await waitFor(() => expect(calls).toContain("seesAsk:refreshSees"));
    });

    it("starts a new chat as it writes again: the panel's is empty, its words too, and the old one stays in Ask Hakken's list", async () => {
      const calls = asViewer("SUPER_ADMIN");
      render(eyeAndPage());
      fireEvent.click(eye());
      await waitFor(() => expect(calls).toContain("seesAsk:askSees"));
      act(() => noteSeesThread(seesKey(ask), "thread_1"));
      expect(screen.getByRole("link", { name: /ui\.hakkenSees\.open/ })).toHaveAttribute("href", "/app/assistant/thread_1");
      const box = screen.getByRole("textbox", { name: "ui.hakkenSees.askPlaceholder" });
      fireEvent.change(box, { target: { value: "Half a question" } });
      fireEvent.click(refreshButton()!);
      await waitFor(() => expect(calls).toContain("seesAsk:refreshSees"));
      expect(screen.queryByRole("link", { name: /ui\.hakkenSees\.open/ })).toBeNull();
      expect(box).toHaveValue("");
      // Nothing is deleted: a refresh asks for no conversation to go.
      expect(calls.filter((name) => name.includes("chat:"))).toEqual([]);
    });

    it("isn't there for anyone else, and can't be pressed again while the words are being written", async () => {
      asViewer("ADMIN");
      const view = render(eyeAndPage());
      fireEvent.click(eye());
      await waitFor(() => expect(sentences()).toEqual(["23 conversions last month."]));
      expect(refreshButton()).toBeNull();
      view.unmount();
      resetSees();
      asViewer("SUPER_ADMIN", { status: "RESEARCHING", says: [], steps: [], role: null, writtenAt: null });
      render(eyeAndPage());
      fireEvent.click(eye());
      await waitFor(() => expect(refreshButton()).toBeDisabled());
    });
  });
});
