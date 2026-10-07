import { fireEvent, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { HakkenTaskRow } from "@/src/app/(dashboard)/_features/hakken-tasks/HakkenTasksScreen";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import CompanyDashboardLayout from "../layout";
import CompanyHakkenTasksPage from "./page";

/**
 * Admin → Companies → a company → Hakken tasks holds to the look Anthony
 * approved on the "Hakken tasks — the wider assistant" canvas, 2026-10-07
 * (docs/plans/active/hakken-tasks-plan.md, item 1.5; board CompanyJobs):
 * everyone's in the company, with who asked.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1" }),
  usePathname: () => "/admin/companies/company_1/hakken-tasks",
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const site = "companyWebsites_1" as Id<"companyWebsites">;
const channels = { bell: true, email: true, telegram: false };
const ROWS: HakkenTaskRow[] = [
  {
    taskId: "hakkenTasks_1" as Id<"hakkenTasks">, kind: "ALERT", state: "ON", title: "Tell me if /web-design-london/ gets fewer than 10 visitors a day",
    measure: "visitors", target: { companyWebsiteId: site, website: "ronins.test", page: "https://ronins.test/web-design-london/" },
    condition: { op: "below", value: 10, days: 1 }, timeOfDay: "09:00", timeZone: "Europe/London", channels, nextCheckAt: Date.now() + 1, createdAt: 1,
    askedBy: "Anthony Basker",
  },
  {
    taskId: "hakkenTasks_2" as Id<"hakkenTasks">, kind: "ALERT", state: "PAUSED", title: "Tell me when ronins.test gets 1,000 visitors from Google in a day",
    measure: "visitors", target: { companyWebsiteId: site, website: "ronins.test" }, condition: { op: "above", value: 1000, days: 1 },
    timeOfDay: "09:00", timeZone: "Europe/London", channels, createdAt: 2, askedBy: null,
  },
];

const remove = vi.fn(async () => null);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "companies:getCompanyById": { _id: "company_1", name: "Ronins Agency", description: "Web design and SEO agency, Surrey and London." },
    "users:getMe": { role: "SUPER_ADMIN" },
    "hakkenTasks:listForCompany": ROWS,
  }));
  vi.mocked(useMutation).mockImplementation(((reference: unknown) => (convexPath(reference).includes("deleteForCompany") ? remove : vi.fn())) as never);
});

function renderTab() {
  return render(
    <CompanyDashboardLayout>
      <CompanyHakkenTasksPage />
    </CompanyDashboardLayout>,
  );
}

describe("a company's Hakken tasks, in Admin", () => {
  it("everyone's, as drawn", async () => {
    const { container } = renderTab();
    await screen.findByText(ROWS[0].title);
    await expectApprovedLook(container, "hakken-tasks", "CompanyJobs", "Admin → Companies → a company → Hakken tasks");
  });

  it("says who asked, words someone who has left, and links nowhere in the owner's own screens", async () => {
    renderTab();
    await screen.findByText(ROWS[0].title);
    expect(screen.getByText("Everything Hakken is keeping an eye on for Ronins Agency, whoever asked for it.")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Anthony Basker")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Someone who has left")).toBeInTheDocument();
    expect(screen.getByText(ROWS[0].title).closest("a")).toBeNull();
  });

  it("asks before deleting someone's task, naming them", async () => {
    renderTab();
    const rows = (await screen.findAllByRole("row")).slice(1);
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Hakken will stop keeping an eye on /web-design-london/, and Anthony Basker won’t get any more alerts about it.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ taskId: ROWS[0].taskId }));
  });
});
