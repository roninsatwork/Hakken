import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { fireEvent, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HakkenSees } from "./HakkenSees";
import { HakkenSeesEye } from "./HakkenSeesEye";
import { PageHeader } from "./PageHeader";
import { SeesStandIn, standInScreen } from "./SeesStandIn";
import { resetSees, useSeesPart } from "./hakkenSeesStore";
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
    expect(screen.getByText(says.join(" "))).toBeInTheDocument();
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
    expect(screen.getByText("Nothing here needs you this week.")).toBeInTheDocument();
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

    it("says it is researching while the team writes, then the team's words with their links", async () => {
      const askSees = vi.fn(async () => ({ key: "googleAnalytics.conversions|lastMonth|||", status: "RESEARCHING" as const }));
      vi.mocked(useMutation).mockReturnValue(askSees as never);
      let answer: unknown = { status: "RESEARCHING", says: [], steps: [], role: null, writtenAt: null };
      vi.mocked(useQuery).mockImplementation(((_reference: unknown, args: unknown) => (args === "skip" ? undefined : answer)) as never);
      const view = render(<Asking />);
      fireEvent.click(eye());
      await waitFor(() => expect(askSees).toHaveBeenCalledWith(ask));
      expect(screen.getByText("ui.hakkenSees.researching Hakken")).toBeInTheDocument();
      expect(screen.queryByText(says.join(" "))).toBeNull();
      answer = { status: "WRITTEN", says: ["23 conversions last month, down on the month before."], steps: [{ words: "Look at where visits leave.", link: "Funnel", href: "/app/analytics/site_1/funnel" }], role: "INSIGHTS_CONVERSION", writtenAt: 1 };
      view.rerender(<Asking />);
      expect(screen.getByText("23 conversions last month, down on the month before.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Funnel" })).toHaveAttribute("href", "/app/analytics/site_1/funnel");
      expect(screen.queryByText("ui.hakkenSees.researching Hakken")).toBeNull();
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
      await waitFor(() => expect(screen.getByText(says.join(" "))).toBeInTheDocument());
      expect(screen.queryByText("ui.hakkenSees.researching Hakken")).toBeNull();
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
      expect(screen.getByText(says.join(" "))).toBeInTheDocument();
      expect(screen.queryByText("ui.hakkenSees.researching Hakken")).toBeNull();
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
      expect(screen.getByText(says.join(" "))).toBeInTheDocument();
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
      expect(screen.getByText(says.join(" "))).toBeInTheDocument();
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
