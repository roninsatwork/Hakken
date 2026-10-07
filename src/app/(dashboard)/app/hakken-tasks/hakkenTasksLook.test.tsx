import { fireEvent, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { HakkenTaskRow } from "@/src/app/(dashboard)/_features/hakken-tasks/HakkenTasksScreen";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import HakkenTasksPage from "./page";

/**
 * Hakken tasks holds to the look Anthony approved on the "Hakken tasks — the
 * wider assistant" canvas, 2026-10-07 (docs/plans/active/hakken-tasks-plan.md,
 * item 1.5; design-drift-plan D4): board MyTasks, and DeleteTask's yes-or-no.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const DAY = 24 * 60 * 60 * 1000;
const NEXT = Date.now() + DAY;
const channels = { bell: true, email: true, telegram: false };
const site = "companyWebsites_1" as Id<"companyWebsites">;

const TASKS: HakkenTaskRow[] = [
  {
    taskId: "hakkenTasks_1" as Id<"hakkenTasks">, kind: "ALERT", state: "ON", title: "Tell me if /web-design-london/ gets fewer than 10 visitors a day",
    measure: "visitors", target: { companyWebsiteId: site, website: "ronins.test", page: "https://ronins.test/web-design-london/" },
    condition: { op: "below", value: 10, days: 1 }, timeOfDay: "09:00", timeZone: "Europe/London", channels, nextCheckAt: NEXT, createdAt: 1,
  },
  {
    taskId: "hakkenTasks_2" as Id<"hakkenTasks">, kind: "ALERT", state: "ON", title: "Tell me if /web-design-surrey/ shows up in Google half as often for 3 days running",
    measure: "impressions", target: { companyWebsiteId: site, website: "ronins.test", page: "https://ronins.test/web-design-surrey/" },
    condition: { op: "dropBy", value: 50, days: 3 }, timeOfDay: "09:00", timeZone: "Europe/London", channels,
    lastJudgedDay: "2026-10-05", lastAlertedDay: "2026-10-05", nextCheckAt: NEXT + 1, createdAt: 2,
  },
  {
    taskId: "hakkenTasks_3" as Id<"hakkenTasks">, kind: "ALERT", state: "PAUSED", title: "Tell me when ronins.test gets 1,000 visitors from Google in a day",
    measure: "visitors", target: { companyWebsiteId: site, website: "ronins.test" }, condition: { op: "above", value: 1000, days: 1 },
    timeOfDay: "08:30", timeZone: "Europe/London", channels: { bell: true, email: false, telegram: false }, createdAt: 3,
  },
];

const pause = vi.fn(async () => null);
const resume = vi.fn(async () => null);
const remove = vi.fn(async () => null);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useQuery).mockImplementation(answerQueries({ "hakkenTasks:listMine": TASKS }));
  vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    return name.includes("pause") ? pause : name.includes("resume") ? resume : name.includes("delete") ? remove : vi.fn();
  }) as never);
});

describe("Hakken tasks' approved look", () => {
  it("a person's own tasks, as drawn", async () => {
    const { container } = render(<HakkenTasksPage />);
    await screen.findByText(TASKS[0].title);
    await expectApprovedLook(container, "hakken-tasks", "MyTasks", "Hakken tasks");
  });

  it("says how each one tells you, when it next looks and where it stands, soonest first", async () => {
    render(<HakkenTasksPage />);
    await screen.findByText(TASKS[0].title);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(TASKS.map((task) => task.title));
    expect(within(rows[0]).getByText("Hakken and email, 9am")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^Alert sent /)).toBeInTheDocument();
    expect(within(rows[2]).getByText("Hakken, 8:30am")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Paused")).toBeInTheDocument();
    expect(within(rows[2]).getByText("–")).toBeInTheDocument();
    expect(screen.getByText(TASKS[0].title).closest("a")).toHaveAttribute("href", `/app/search-console/${site}/pages`);
    expect(screen.getByText("3 tasks")).toBeInTheDocument();
  });

  it("pauses one that is on and resumes one that is paused", async () => {
    render(<HakkenTasksPage />);
    const rows = (await screen.findAllByRole("row")).slice(1);
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(pause).toHaveBeenCalledWith({ taskId: TASKS[0].taskId }));
    // One change at a time: the buttons wait while one is saving.
    await waitFor(() => expect(within(rows[2]).getByRole("button", { name: "Resume" })).toBeEnabled());
    fireEvent.click(within(rows[2]).getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(resume).toHaveBeenCalledWith({ taskId: TASKS[2].taskId }));
  });

  it("asks before deleting, offering a pause instead, and keeps it on Keep it", async () => {
    render(<HakkenTasksPage />);
    const rows = (await screen.findAllByRole("row")).slice(1);
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete this task?")).toBeInTheDocument();
    expect(screen.getByText("Hakken will stop keeping an eye on /web-design-london/, and you won’t get any more alerts about it.")).toBeInTheDocument();
    expect(screen.getByText("Just want a break from it? Pause it instead. You can also ask Hakken to start it again any time.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(within(rows[0]).getByRole("button", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete task" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ taskId: TASKS[0].taskId }));
  });

  it("narrows to the paused ones, and says so when nothing matches", async () => {
    render(<HakkenTasksPage />);
    await screen.findByText(TASKS[0].title);
    fireEvent.change(screen.getByLabelText("Showing"), { target: { value: "PAUSED" } });
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText("Find a task…"), { target: { value: "nothing like this" } });
    expect(await screen.findByText("No tasks match that. Try another word or filter.")).toBeInTheDocument();
  });

  it("with none yet, says how to add one", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "hakkenTasks:listMine": [] }));
    render(<HakkenTasksPage />);
    expect(await screen.findByText("Nothing here yet. Ask Hakken to keep an eye on something for you, and it will show up here.")).toBeInTheDocument();
  });
});
