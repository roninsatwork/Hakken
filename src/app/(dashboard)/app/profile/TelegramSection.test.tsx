import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { TelegramSection } from "./TelegramSection";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/** The profile's Telegram section (hakken-tasks-plan.md, item 6.1, board TelegramLink). */
describe("the profile's Telegram section", () => {
  const bot = { username: "AskHakkenBot", name: "AskHakken" };
  const newCode = vi.fn(async () => ({ code: "482913", expiresAt: Date.now() + 600_000 }));
  const unlink = vi.fn(async () => null);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => (getFunctionName(reference as never).includes("unlink") ? unlink : newCode)) as never);
  });

  it("is not shown until the platform's bot is set up", () => {
    vi.mocked(useQuery).mockReturnValue({ bot: null, linked: null, code: null });
    render(<TelegramSection />);
    expect(screen.queryByText("user.preferences.telegram.title")).toBeNull();
  });

  it("shows the code to send, while it works, with a way to get a new one", () => {
    vi.mocked(useQuery).mockReturnValue({ bot, linked: null, code: { code: "482913", expiresAt: Date.now() + 600_000 } });
    render(<TelegramSection />);
    expect(screen.getByText("482 913")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "user.preferences.telegram.newCode" }));
    expect(newCode).toHaveBeenCalledWith({});
  });

  it("offers a code when there is none", () => {
    vi.mocked(useQuery).mockReturnValue({ bot, linked: null, code: null });
    render(<TelegramSection />);
    fireEvent.click(screen.getByRole("button", { name: "user.preferences.telegram.getCode" }));
    expect(newCode).toHaveBeenCalledWith({});
  });

  it("says who is linked, with Unlink", () => {
    vi.mocked(useQuery).mockReturnValue({ bot, linked: { telegramName: "@anthony", linkedAt: Date.now() }, code: null });
    render(<TelegramSection />);
    expect(screen.getByText("user.preferences.telegram.linkedAs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "user.preferences.telegram.unlink" }));
    expect(unlink).toHaveBeenCalledWith({});
  });
});
