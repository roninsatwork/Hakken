import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import WhoToFollowPage from "./page";

const nav = vi.hoisted(() => ({ locale: "en" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return { ...base, useLocale: () => nav.locale };
});
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  usePathname: () => "/app/who-to-follow",
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const FOLLOWS = [
  { _id: "follow_1", kind: "YOUTUBE", name: "Edward Sturm", url: "https://youtube.com/@edwardsturm", why: "Short videos with great guests." },
  { _id: "follow_2", kind: "X", name: "Lily Ray", url: "https://x.com/lilyraynyc", why: "Clear takes on every core update." },
];

/** Who to follow on its own page in Learn (docs/plans/active/knowledge-news-and-digest-plan.md, revised again 2026-10-01, R4, R11). */
describe("Who to follow", () => {
  beforeEach(() => {
    nav.locale = "en";
    vi.mocked(useQuery).mockReset().mockImplementation(answerQueries({ "newsFollows:listFollows": FOLLOWS }));
  });

  it("lists who we recommend, where they post and why, each opening where they post", () => {
    render(<WhoToFollowPage />);

    expect(screen.getByRole("link", { name: "Edward Sturm" })).toHaveAttribute("href", "https://youtube.com/@edwardsturm");
    expect(screen.getByText("news.followKinds.YOUTUBE")).toBeInTheDocument();
    expect(screen.getByText("Clear takes on every core update.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /learn\.menu\.whoToFollow/ })).toHaveAttribute("aria-current", "page");
  });

  it("asks for the reader's language and finds someone by name", () => {
    nav.locale = "it";
    render(<WhoToFollowPage />);

    expect(vi.mocked(useQuery).mock.calls.some(([, args]) => (args as { language?: string })?.language === "it")).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("learn.follow.searchPlaceholder"), { target: { value: "lily" } });
    expect(screen.queryByText("Edward Sturm")).not.toBeInTheDocument();
    expect(screen.getByText("Lily Ray")).toBeInTheDocument();
  });
});
