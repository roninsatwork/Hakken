import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";

import { HakkenSees } from "./HakkenSees";

vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" "),
  };
});
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

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
});
