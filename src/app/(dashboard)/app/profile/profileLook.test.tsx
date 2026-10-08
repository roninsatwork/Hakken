import { fireEvent, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import ProfileTabs from "./ProfileTabs";
import TelegramIntegrationPage from "./integrations/telegram/page";

/**
 * The profile's Communication preferences and Integrations tabs, and
 * Telegram's own page, hold to the look Anthony approved on the "Hakken tasks
 * — the wider assistant" canvas, 2026-10-07 (docs/plans/active/outbox-and-
 * preferences-plan.md, C2; design-drift-plan D4): boards
 * CommunicationPreferences, ProfileIntegrations, ProfileIntegrationsLinked
 * and ProfileTelegram. The Preferences tab holds to ProfilePreferences,
 * approved on the same canvas 2026-10-08.
 */

const where = vi.hoisted(() => ({ search: "" }));
const push = vi.hoisted(() => vi.fn());
const setTheme = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/app/profile",
  useSearchParams: () => new URLSearchParams(where.search),
  useParams: () => ({}),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme }) }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const BOT = { username: "AskHakkenBot", name: "AskHakken" };
const choices = [{ communication: "WEEKLY_NEWS_DIGEST", on: true }, { communication: "HAKKEN_TASKS", on: true }];
const setMyEmail = vi.fn(async () => null);
const setAllMyEmails = vi.fn(async () => null);
const newTelegramCode = vi.fn(async () => ({ code: "482913", expiresAt: Date.now() + 600_000 }));
const recordMyLanguage = vi.fn(async () => null);

function answer(telegram: unknown) {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "users:getMe": { _id: "users_1", role: "USER", name: "Jo Hughes" },
    "readerPreferences:getMyEmailPreferences": { language: "en", choices },
    "telegram:myTelegram": telegram,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  where.search = "";
  answer({ bot: BOT, linked: null, code: { code: "482913", expiresAt: Date.now() + 600_000 } });
  vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    return name.endsWith("setAllMyEmails") ? setAllMyEmails : name.endsWith("setMyEmail") ? setMyEmail : name.endsWith("newTelegramCode") ? newTelegramCode : name.endsWith("recordMyLanguage") ? recordMyLanguage : vi.fn(async () => null);
  }) as never);
});

describe("Preferences", () => {
  it("theme and language as a table, as drawn", async () => {
    const { container } = render(<ProfileTabs />);
    await screen.findByText("Same as my device");
    await expectApprovedLook(container.querySelector(".animate-in") ?? container, "outbox-and-preferences", "ProfilePreferences", "Preferences");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
  });

  it("picking a theme applies it at once", async () => {
    render(<ProfileTabs />);
    fireEvent.click(await screen.findByRole("radio", { name: "Light" }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("a new language is kept on the person, for their emails", async () => {
    render(<ProfileTabs />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Language" }), { target: { value: "it" } });
    await waitFor(() => expect(recordMyLanguage).toHaveBeenCalledWith({ language: "it" }));
  });
});

describe("Communication preferences", () => {
  it("the emails a person may choose, each ticked until they opt out, as drawn", async () => {
    where.search = "tab=communication";
    const { container } = render(<ProfileTabs />);
    await screen.findAllByText("Your Hakken tasks");
    await expectApprovedLook(container.querySelector(".animate-in") ?? container, "outbox-and-preferences", "CommunicationPreferences", "Communication preferences");
  });

  it("unticking one turns it off; Unsubscribe from all turns every one off", async () => {
    where.search = "tab=communication";
    render(<ProfileTabs />);
    const rows = (await screen.findAllByRole("row")).slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["Weekly News Digest", "Your Hakken tasks"]);
    fireEvent.click(within(rows[1]).getByRole("checkbox"));
    await waitFor(() => expect(setMyEmail).toHaveBeenCalledWith({ communication: "HAKKEN_TASKS", on: false }));
    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe from all" }));
    await waitFor(() => expect(setAllMyEmails).toHaveBeenCalledWith({ on: false }));
  });

  it("offers Subscribe to all once everything is off", async () => {
    where.search = "tab=communication";
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "users:getMe": { _id: "users_1", role: "USER" },
      "readerPreferences:getMyEmailPreferences": { language: "en", choices: choices.map((choice) => ({ ...choice, on: false })) },
    }));
    render(<ProfileTabs />);
    fireEvent.click(await screen.findByRole("button", { name: "Subscribe to all" }));
    await waitFor(() => expect(setAllMyEmails).toHaveBeenCalledWith({ on: true }));
  });
});

describe("Integrations", () => {
  it("every app a person can link, one row each, as drawn", async () => {
    where.search = "tab=integrations";
    const { container } = render(<ProfileTabs />);
    await screen.findByText("Not linked");
    await expectApprovedLook(container.querySelector(".animate-in") ?? container, "outbox-and-preferences", "ProfileIntegrations", "Integrations");
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(push).toHaveBeenCalledWith("/app/profile/integrations/telegram");
  });

  it("once linked, says who to, with Manage", async () => {
    where.search = "tab=integrations";
    answer({ bot: BOT, linked: { telegramName: "@jo", linkedAt: Date.now() }, code: null });
    const { container } = render(<ProfileTabs />);
    expect(await screen.findByText("Linked to @jo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage" })).toBeInTheDocument();
    await expectApprovedLook(container.querySelector(".animate-in") ?? container, "outbox-and-preferences", "ProfileIntegrationsLinked", "Integrations, linked");
  });

  it("lists no app that is not set up for the platform yet", async () => {
    where.search = "tab=integrations";
    answer({ bot: null, linked: null, code: null });
    render(<ProfileTabs />);
    expect(await screen.findByText("No apps to link yet.")).toBeInTheDocument();
  });
});

describe("Telegram's page", () => {
  it("links in one tap, or with its code, as drawn", async () => {
    const { container } = render(<TelegramIntegrationPage />);
    expect(await screen.findByText("482 913")).toBeInTheDocument();
    await expectApprovedLook(container, "outbox-and-preferences", "ProfileTelegram", "Telegram");
    const opened = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByRole("button", { name: "Open Telegram" }));
    expect(opened).toHaveBeenCalledWith("https://t.me/AskHakkenBot?start=482913", "_blank", "noopener");
  });

  it("makes a code when it opens for someone without one", async () => {
    answer({ bot: BOT, linked: null, code: null });
    render(<TelegramIntegrationPage />);
    await waitFor(() => expect(newTelegramCode).toHaveBeenCalledTimes(1));
  });

  it("once linked, says since when, and unlinks only on a yes", async () => {
    const unlink = vi.fn(async () => null);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => (convexPath(reference).endsWith("unlinkTelegram") ? unlink : vi.fn(async () => null))) as never);
    answer({ bot: BOT, linked: { telegramName: "@jo", linkedAt: Date.UTC(2026, 9, 7) }, code: null });
    render(<TelegramIntegrationPage />);
    expect(await screen.findByText(/^Linked to @jo since /)).toBeInTheDocument();
    const unlinkButton = screen.getByRole("button", { name: "Unlink" });
    fireEvent.click(unlinkButton);
    fireEvent.click(await screen.findByRole("button", { name: "Keep it" }));
    expect(unlink).not.toHaveBeenCalled();
    fireEvent.click(unlinkButton);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(unlink).toHaveBeenCalledWith({}));
  });
});
