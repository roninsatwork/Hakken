import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { fireEvent, waitFor } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HakkenSees } from "./HakkenSees";
import { HakkenSeesEye } from "./HakkenSeesEye";
import { PageHeader } from "./PageHeader";
import { resetSees } from "./hakkenSeesStore";
import { seenAdvice } from "@/convex/utils/hakkenSees";

vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" "),
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
  it("counts the steps as new until opened; the bubble hangs from the eye and Escape or a click outside closes it", () => {
    render(<Screen />);
    expect(screen.getByText("ui.hakkenSees.new 2")).toBeInTheDocument();
    expect(bubble()).toBeNull();
    fireEvent.click(eye());
    expect(screen.queryByText("ui.hakkenSees.new 2")).toBeNull();
    expect(bubble()).not.toBeNull();
    // Inside the eye's own holder, so it sits under the eye, not in the page.
    expect(eye().closest("[data-part='sees-eye']")).toContainElement(bubble());
    expect(eye()).toHaveAttribute("aria-controls", bubble()!.id);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(eye()).toHaveAttribute("aria-expanded", "false");
    expect(bubble()).toBeNull();
    fireEvent.click(eye());
    expect(bubble()).not.toBeNull();
    fireEvent.mouseDown(document.body);
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

  it("says what it is while the mouse rests on the eye", () => {
    render(<Screen />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(eye());
    expect(screen.getByRole("tooltip")).toHaveTextContent("ui.hakkenSees.tooltipNew Hakken 2");
    expect(eye()).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    fireEvent.mouseLeave(eye());
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(eye());
    fireEvent.focus(eye());
    expect(screen.getByRole("tooltip")).toHaveTextContent("ui.hakkenSees.tooltipRead Hakken");
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

    it("keeps the rule's words when there is no team to ask, or the Editor sent the words back", async () => {
      vi.mocked(useMutation).mockReturnValue(vi.fn(async () => ({ key: "k", status: "FAILED" as const })) as never);
      render(<Asking />);
      fireEvent.click(eye());
      await waitFor(() => expect(screen.getByText(says.join(" "))).toBeInTheDocument());
      expect(screen.queryByText("ui.hakkenSees.researching Hakken")).toBeNull();
    });
  });

  it("names its advice by codes and quoted names, never by numbers", () => {
    const box = { says: [{ code: "update", text: "September spam update", a: 5.2 }], steps: [{ code: "hold", link: "seeUpdate", to: { segment: "google-updates" }, a: 22 }] };
    expect(seenAdvice(box)).toBe(seenAdvice({ ...box, says: [{ ...box.says[0], a: 6.1 }] }));
    expect(seenAdvice(box)).not.toBe(seenAdvice({ ...box, says: [{ ...box.says[0], text: "October core update" }] }));
  });
});
