import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { AccessLevelProvider } from "@/src/ui/components/screens/AccessLevel";
import { WikiCheckupScreen } from "./WikiCheckupScreen";

/**
 * One wiki's Check-up (wiki-sonae-catch-up-plan-2026-11-21.md, S8): what the
 * last check-up did, "Check this wiki now" as one press with no choices, the
 * bar while it runs, a plain failure when it stops, and no button for
 * someone who can only read. It always checks the wiki it was given.
 */

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => undefined),
  useMutation: vi.fn(() => vi.fn()),
}));

const companyId = "company_1" as Id<"companies">;

const run = (overrides: Record<string, unknown>) => ({
  runId: "run_1",
  status: "RUNNING",
  trigger: "MANUAL",
  step: 3,
  stepCount: 7,
  stepKey: "GAPS",
  doneUnits: 40,
  totalUnits: 100,
  percent: 40,
  found: { linksFixed: 12, factsSettled: 2, pagesWritten: 1, claimsCorrected: 3, pagesRefiled: 0, tagsChanged: 4 },
  summary: null,
  error: null,
  startedAt: Date.UTC(2026, 10, 9, 22),
  finishedAt: null,
  ...overrides,
});

const asked: string[] = [];

// The day named and the time to the minute, in the reader's own order ("9 November at 23:00" or "November 9 at
// 11:00 PM"), never numbers with seconds.
const checkedAt = /^Checked on (\d{1,2} November|November \d{1,2}) at \d{1,2}:\d{2}( [AP]M)?$/;
const failedAt = /^Failed on (\d{1,2} November|November \d{1,2}) at \d{1,2}:\d{2}( [AP]M)?$/;

function showRun(value: unknown) {
  vi.mocked(useQuery).mockImplementation(((fn: unknown, args: unknown) => {
    const name = getFunctionName(fn as never);
    if (args !== "skip") asked.push(name);
    return name === "wikiCheckup:getLatestCheckupForCompany" || name === "wikiCheckup:getLatestCheckupForGlobal"
      ? value
      : undefined;
  }) as never);
}

function startsWith(name: string) {
  const start = vi.fn().mockResolvedValue({ runId: "run_1", alreadyRunning: false });
  vi.mocked(useMutation).mockImplementation(((fn: unknown) =>
    getFunctionName(fn as never) === name ? start : vi.fn()) as never);
  return start;
}

describe("WikiCheckupScreen", () => {
  beforeEach(() => {
    asked.length = 0;
    vi.mocked(useQuery).mockReset();
    vi.mocked(useMutation).mockReset();
    vi.mocked(useMutation).mockImplementation(() => vi.fn() as never);
  });

  it("says when the wiki has never been checked, and one press checks this company's wiki", async () => {
    const start = startsWith("wikiCheckup:startWikiCheckupForCompany");
    showRun(null);
    render(<WikiCheckupScreen companyId={companyId} />);

    expect(screen.getByRole("heading", { name: "Check-up" })).toBeInTheDocument();
    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What the last check-up did" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Check this wiki now" }));
    await waitFor(() => expect(start).toHaveBeenCalledWith({ companyId }));
    expect(asked).toContain("wikiCheckup:getLatestCheckupForCompany");
    expect(asked).not.toContain("wikiCheckup:getLatestCheckupForGlobal");
  });

  it("checks the Platform Wiki when it's given no company", async () => {
    const start = startsWith("wikiCheckup:startWikiCheckupForGlobal");
    showRun(null);
    render(<WikiCheckupScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Check this wiki now" }));
    await waitFor(() => expect(start).toHaveBeenCalledWith({}));
    expect(asked).toContain("wikiCheckup:getLatestCheckupForGlobal");
    expect(asked).not.toContain("wikiCheckup:getLatestCheckupForCompany");
  });

  it("shows the bar while it runs, with the step, how far through and what it has fixed so far", () => {
    showRun(run({}));
    render(<WikiCheckupScreen companyId={companyId} />);

    const bar = screen.getByRole("progressbar", { name: "Writing missing pages" });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "7");
    expect(screen.getByText("Step 3 of 7")).toBeInTheDocument();
    // One name for one state: the status under the title and the greyed button both say it.
    expect(screen.getAllByText("Checking now")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "What it has fixed so far" })).toBeInTheDocument();
    expect(screen.getByText("Links fixed").parentElement).toHaveTextContent("12");
    expect(screen.getByText("Old facts updated").parentElement).toHaveTextContent("3");
    // A second press while it runs isn't offered.
    expect(screen.getByRole("button", { name: "Checking now" })).toBeDisabled();
  });

  it("says what the last check-up did once it's done, in the summary's own words", () => {
    showRun(run({ status: "SUCCESS", summary: "14 links fixed or added, 3 disagreements settled.", finishedAt: Date.UTC(2026, 10, 9, 23) }));
    render(<WikiCheckupScreen companyId={companyId} />);

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("heading", { name: "What the last check-up did" })).toBeInTheDocument();
    expect(screen.getByText("14 links fixed or added, 3 disagreements settled.")).toBeInTheDocument();
    expect(screen.getByText(checkedAt)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check this wiki now" })).toBeEnabled();
  });

  it("says plainly when the check-up stopped, and why", () => {
    showRun(run({ status: "FAILED", error: "It stopped responding.", finishedAt: Date.UTC(2026, 10, 9, 23) }));
    render(<WikiCheckupScreen companyId={companyId} />);

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("The check-up didn't finish. It stopped responding.")).toBeInTheDocument();
    expect(screen.getByText(failedAt)).toBeInTheDocument();
  });

  it("has one orange action, and none for someone who can only read", () => {
    showRun(null);
    const { container, unmount } = render(<WikiCheckupScreen companyId={companyId} />);
    expect(container.querySelectorAll('[data-part="primary-action"]')).toHaveLength(1);
    unmount();

    render(
      <AccessLevelProvider role="READ_ONLY">
        <WikiCheckupScreen companyId={companyId} />
      </AccessLevelProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("wears the record header with its way back when opened from a list", () => {
    showRun(null);
    render(<WikiCheckupScreen companyId={companyId} title="Harbour Foods" back={{ label: "Back to Wiki check-ups", href: "/admin/health/wikis" }} />);

    expect(screen.getByRole("heading", { name: "Harbour Foods" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Wiki check-ups" })).toHaveAttribute("href", "/admin/health/wikis");
  });

  // Each step the backend runs has its words, held by the type check (`NAMED_STEPS` in WikiCheckupPanel.tsx).
  // A step this screen has no words for yet still shows its bar, never a raw code.
  it("says Working for a step it has no words for, never the step's code", () => {
    showRun(run({ stepKey: "SOMETHING_NEW" }));
    render(<WikiCheckupScreen companyId={companyId} />);

    expect(screen.getByRole("progressbar", { name: "Working" })).toBeInTheDocument();
    expect(screen.queryByText(/SOMETHING_NEW/)).toBeNull();
  });
});
