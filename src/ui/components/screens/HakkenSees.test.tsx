import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HakkenSees } from "./HakkenSees";
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

beforeEach(() => {
  window.localStorage.clear();
  at.path = "/app/sites/s1/radar";
});

/**
 * What Hakken sees (discovery-detail-and-hakken-sees-plan.md §2): a settings
 * card with the sentences, then "Do first" and numbered steps, each with a
 * quiet link to where it is done.
 */
describe("HakkenSees", () => {
  it("says what it sees, then the first things to do, each linked", () => {
    render(
      <HakkenSees
        says={["You are named in 64 answers a month.", "Brightside Digital is named in 121."]}
        steps={[
          { words: "Put plain prices at the top of /pricing/.", link: "See the question", href: "/app/sites/s/radar/question?question=q" },
          { words: "Get listed on clutch.co.", link: "Visit clutch.co", href: "https://clutch.co", external: true },
        ]}
      />,
    );
    expect(screen.getByText("ui.hakkenSees.title Hakken")).toBeInTheDocument();
    expect(screen.getByText("You are named in 64 answers a month. Brightside Digital is named in 121.")).toBeInTheDocument();
    expect(screen.getByText("ui.hakkenSees.doFirst")).toBeInTheDocument();
    expect(screen.getByText("1. Put plain prices at the top of /pricing/.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the question" })).toHaveAttribute("href", "/app/sites/s/radar/question?question=q");
    const away = screen.getByRole("link", { name: "Visit clutch.co" });
    expect(away).toHaveAttribute("target", "_blank");
    expect(away).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("with nothing to do, shows the sentences alone", () => {
    render(<HakkenSees says={["Nothing here needs you this week."]} steps={[]} />);
    expect(screen.getByText("Nothing here needs you this week.")).toBeInTheDocument();
    expect(screen.queryByText("ui.hakkenSees.doFirst")).toBeNull();
  });

  const says = ["Google's spam update moved your positions three times as much as usual.", "Your clicks fell 9%."];
  const steps = [{ words: "Hold big changes until 22 October.", link: "See the update", href: "/app/x" }];
  const title = () => screen.getByRole("button", { name: /ui\.hakkenSees\.title Hakken/ });

  it("folds to one row with its first sentence, and opens again (search-console-volatility-plan.md §8, HS1)", () => {
    render(<HakkenSees says={says} steps={steps} advice="update | hold" />);
    expect(title()).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(title());
    expect(title()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(says[0])).toBeInTheDocument();
    expect(screen.queryByText("ui.hakkenSees.doFirst")).toBeNull();
    expect(screen.queryByText("Your clicks fell 9%.", { exact: false })).toBeNull();
    fireEvent.click(title());
    expect(title()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("ui.hakkenSees.doFirst")).toBeInTheDocument();
  });

  it("stays folded on that screen while its advice is the same, and opens on a new screen (HS3)", () => {
    const first = render(<HakkenSees says={says} steps={steps} advice="update | hold" />);
    fireEvent.click(title());
    first.unmount();
    render(<HakkenSees says={["The same advice on today's figures."]} steps={steps} advice="update | hold" />);
    expect(title()).toHaveAttribute("aria-expanded", "false");
    at.path = "/app/sites/s2/radar";
    render(<HakkenSees says={says} steps={steps} advice="update | hold" />);
    expect(screen.getAllByRole("button", { name: /ui\.hakkenSees\.title Hakken/ })[1]).toHaveAttribute("aria-expanded", "true");
  });

  it("opens again by itself when its advice changes (HS3)", () => {
    const view = render(<HakkenSees says={says} steps={steps} advice="update | hold" />);
    fireEvent.click(title());
    view.rerender(<HakkenSees says={["Google is calm for your keywords."]} steps={[]} advice="calm |" />);
    expect(title()).toHaveAttribute("aria-expanded", "true");
  });

  it("names its advice by codes and quoted names, never by numbers", () => {
    const box = { says: [{ code: "update", text: "September spam update", a: 5.2 }], steps: [{ code: "hold", link: "seeUpdate", to: { segment: "google-updates" }, a: 22 }] };
    expect(seenAdvice(box)).toBe(seenAdvice({ ...box, says: [{ ...box.says[0], a: 6.1 }] }));
    expect(seenAdvice(box)).not.toBe(seenAdvice({ ...box, says: [{ ...box.says[0], text: "October core update" }] }));
  });
});
