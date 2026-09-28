import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { LimitsScreen, type LimitsScreenProps } from "./LimitsScreen";

vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

/**
 * One Limits page at every level (docs/plans/active/platform-limits-plan.md),
 * rendered with the real English words: the platform's numbers with nothing
 * above them, a company's with "Use platform default", a website's with "Use
 * company setting" — who one level down has a number of its own, and the
 * platform's own limits, set there and only shown to a company.
 */
const CHOICES = { keywordsPerSite: [100, 1_000, 2_500, 10_000], backlinksPerSite: [100, 500, 1_000], consoleDays: [7, 14, 28], googleSearchesRead: [0, 25, 100] };
const PLATFORM = { keywordsPerSite: 1_000, backlinksPerSite: 1_000, consoleDays: 28, googleSearchesRead: 0 };
/** Two of the platform's own limits, which only System Settings sets. */
const SHARED_CHOICES = { fanOutPerAnswer: [25, 50, 100], rowsPerDownload: [10_000, 25_000, 50_000] };
const SHARED = { fanOutPerAnswer: 50, rowsPerDownload: 50_000 };

function renderLimits(props: Partial<LimitsScreenProps>) {
  const onSave = vi.fn(async () => null);
  renderWithProviders(
    <LimitsScreen
      level="platform"
      keys={Object.keys(CHOICES)}
      own={PLATFORM}
      choices={CHOICES}
      onSave={onSave}
      {...props}
    />,
  );
  return onSave;
}

const choiceTexts = (select: HTMLElement) => [...(select as HTMLSelectElement).options].map((option) => option.textContent);

describe("the Limits page", () => {
  it("on the platform, offers only numbers, names the companies with their own, and sets what every company shares", async () => {
    const onSave = renderLimits({
      keys: [...Object.keys(CHOICES), ...Object.keys(SHARED_CHOICES)],
      own: { ...PLATFORM, ...SHARED },
      choices: { ...CHOICES, ...SHARED_CHOICES },
      others: { backlinksPerSite: [{ id: "company_ronins", name: "Ronins Agency", value: 500 }] },
      otherHref: (id) => `/admin/companies/${id}/websites/limits`,
    });

    expect(screen.getByText("Google data for each website")).toBeInTheDocument();
    expect(screen.getByText("AI prompts")).toBeInTheDocument();
    const keywords = screen.getByRole("combobox", { name: "Keywords kept per website" });
    expect(keywords).toHaveValue("1000");
    expect(choiceTexts(keywords)).toEqual(["100 keywords", "1,000 keywords", "2,500 keywords", "10,000 keywords"]);
    expect(choiceTexts(screen.getByRole("combobox", { name: "Days in a Search Console position" }))).toEqual(["7 days", "14 days", "28 days"]);
    expect(choiceTexts(screen.getByRole("combobox", { name: "Google AI Overviews bought per prompt" }))[0]).toBe("Off");

    expect(screen.getByRole("link", { name: "Ronins Agency" })).toHaveAttribute("href", "/admin/companies/company_ronins/websites/limits");
    expect(screen.getByText("has its own number: 500 backlinks")).toBeInTheDocument();
    // What was fixed in code is a choice here, like every other limit.
    expect(screen.getByText("Same for every company")).toBeInTheDocument();
    const fanOut = screen.getByRole("combobox", { name: "Fan-out queries kept from one AI answer" });
    expect(fanOut).toHaveValue("50");
    expect(choiceTexts(fanOut)).toEqual(["25 searches", "50 searches", "100 searches"]);
    expect(choiceTexts(screen.getByRole("combobox", { name: "Rows in one download" }))).toEqual(["10,000 rows", "25,000 rows", "50,000 rows"]);

    // A card saves only its own limits, and only those changed.
    const card = keywords.closest("section")!;
    const save = within(card).getByRole("button", { name: /Save/ });
    expect(save).toBeDisabled();
    fireEvent.change(keywords, { target: { value: "2500" } });
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ keywordsPerSite: 2_500 }));
    expect(await within(card).findByText("Saved")).toBeInTheDocument();
  });

  it("on a company, starts each choice with the platform default and names its websites with their own", async () => {
    const onSave = renderLimits({
      level: "company",
      own: { keywordsPerSite: null, backlinksPerSite: 500, consoleDays: null, googleSearchesRead: null },
      above: PLATFORM,
      others: { keywordsPerSite: [{ id: "hold_1", name: "ronins.co.uk", value: 10_000 }] },
      otherHref: (id) => `/admin/companies/company_1/websites/site/${id}/limits`,
      shared: SHARED,
    });

    const keywords = screen.getByRole("combobox", { name: "Keywords kept per website" });
    expect(keywords).toHaveValue("");
    expect(choiceTexts(keywords)[0]).toBe("Use platform default (1,000 keywords)");
    const backlinks = screen.getByRole("combobox", { name: "Backlinks kept per website" });
    expect(backlinks).toHaveValue("500");
    expect(screen.getByRole("link", { name: "ronins.co.uk" })).toHaveAttribute("href", "/admin/companies/company_1/websites/site/hold_1/limits");
    expect(screen.getByText("has its own number: 10,000 keywords")).toBeInTheDocument();
    // The same page as the platform's, with its own limits shown and set only there.
    expect(screen.getByText("Same for every company")).toBeInTheDocument();
    expect(screen.getByText("50 searches")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Fan-out queries kept from one AI answer" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Set in System Settings" })[0]).toHaveAttribute("href", "/admin/settings/limits");

    // Back to the platform's number is null.
    fireEvent.change(backlinks, { target: { value: "" } });
    fireEvent.click(within(backlinks.closest("section")!).getByRole("button", { name: /Save/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ backlinksPerSite: null }));
  });

  it("on a website, starts each choice with the company's setting and links the company's Limits", () => {
    renderLimits({
      level: "website",
      keys: ["keywordsPerSite", "backlinksPerSite"],
      own: { keywordsPerSite: 10_000, backlinksPerSite: null },
      above: { keywordsPerSite: 1_000, backlinksPerSite: 500 },
      companyHref: "/admin/companies/company_1/websites/limits",
    });

    expect(choiceTexts(screen.getByRole("combobox", { name: "Backlinks kept per website" }))[0]).toBe("Use company setting (500 backlinks)");
    expect(screen.getByRole("combobox", { name: "Keywords kept per website" })).toHaveValue("10000");
    // Only the topics it has, and not the platform's own: those are the platform's and the company's to show.
    expect(screen.queryByText("AI prompts")).not.toBeInTheDocument();
    expect(screen.queryByText("Same for every company")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Its Limits page" })).toHaveAttribute("href", "/admin/companies/company_1/websites/limits");
    expect(screen.getByRole("link", { name: "System Settings → Limits" })).toHaveAttribute("href", "/admin/settings/limits");
  });
});
