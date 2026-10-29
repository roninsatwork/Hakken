import { fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectApprovedLook } from "@/src/test/lookOutline";
import UnsubscribePage from "./page";

/**
 * The page an email's unsubscribe link opens holds to the look Anthony
 * approved on the "Hakken home page" canvas on 2026-10-29
 * (docs/plans/active/before-sign-in-plan.md; design-drift-plan D4): boards
 * UnsubscribeAsk, UnsubscribeDone, UnsubscribeFailed and UnsubscribeIncomplete
 * of docs/plans/assets/before-sign-in/.
 */

const unsubscribeMock = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ token: "tok_1" as string | null }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (name: string) => (name === "token" ? params.token : null) }),
}));
vi.mock("convex/react", () => ({ useMutation: () => unsubscribeMock }));
vi.mock("@/convex/_generated/api", () => ({ api: { readerPreferences: { unsubscribeWithToken: "u" } } }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

describe("From an unsubscribe link", () => {
  beforeEach(() => {
    unsubscribeMock.mockReset();
    params.token = "tok_1";
  });

  it("asks before stopping the emails, as drawn", async () => {
    const { container } = render(<UnsubscribePage />);
    expect(screen.getByRole("heading", { name: "Stop Weekly News Digest emails?" })).toBeInTheDocument();
    await expectApprovedLook(container, "before-sign-in", "UnsubscribeAsk", "Unsubscribe · stop these emails?");
  });

  it("done, as drawn", async () => {
    unsubscribeMock.mockResolvedValue(true);
    const { container } = render(<UnsubscribePage />);
    fireEvent.click(screen.getByRole("button", { name: /stop these emails/i }));
    await screen.findByRole("heading", { name: "You're unsubscribed" });
    await waitFor(() => expect(unsubscribeMock).toHaveBeenCalledWith({ token: "tok_1", kind: "WEEKLY_NEWS_DIGEST" }));
    await expectApprovedLook(container, "before-sign-in", "UnsubscribeDone", "Unsubscribe · done");
  });

  it("the link no longer working, as drawn", async () => {
    unsubscribeMock.mockResolvedValue(false);
    const { container } = render(<UnsubscribePage />);
    fireEvent.click(screen.getByRole("button", { name: /stop these emails/i }));
    await screen.findByRole("heading", { name: "This link doesn't work any more" });
    await expectApprovedLook(container, "before-sign-in", "UnsubscribeFailed", "Unsubscribe · link no longer works");
  });

  it("the link incomplete, as drawn", async () => {
    params.token = null;
    const { container } = render(<UnsubscribePage />);
    expect(screen.getByRole("heading", { name: "This link didn't come through properly" })).toBeInTheDocument();
    await expectApprovedLook(container, "before-sign-in", "UnsubscribeIncomplete", "Unsubscribe · link incomplete");
  });
});
