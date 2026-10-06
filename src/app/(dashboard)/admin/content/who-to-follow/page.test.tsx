import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import WhoToFollowAdminPage from "./page";
import { FollowEditor } from "./FollowEditor";

const { update, setPick, push } = vi.hoisted(() => ({ update: vi.fn(), setPick: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const follow = (id: string, name: string, extra: { topic?: string | null; pickedAt?: number | null } = {}) => ({
  _id: id, kind: "X", name, url: `https://x.com/${id}`, whyEn: `Why ${name}.`, topic: null, pickedAt: null, translations: { done: 1, total: 1 }, ...extra,
});
const PICKED = ["Nacho Mascort", "Lily Ray", "Kevin Indig", "Google Search Central"].map((name, index) => follow(`pick_${index}`, name, { pickedAt: index + 1, topic: "RANKINGS" }));
const EDWARD = follow("edward", "Edward Sturm", { topic: "TRAFFIC" });
const TOPICS = [{ key: "TRAFFIC", nameEn: "Traffic" }, { key: "RANKINGS", nameEn: "Rankings" }];

/**
 * Admin → Content → Who to follow with a topic and "Our picks"
 * (docs/plans/active/insights-helpful-content-plan.md, IH14, boards 14 and 15):
 * at most four picks, ticked on the list or on an entry's page, greyed with
 * what to do once four are picked.
 */
describe("Admin Who to follow", () => {
  beforeEach(() => {
    push.mockReset();
    update.mockReset().mockResolvedValue(null);
    setPick.mockReset().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "newsFollows:getFollowTotals": { all: 5, byKind: {}, byTopic: {}, byKindTopic: {} },
      "newsFollows:getFollow": EDWARD,
      "newsFollows:listPicksForAdmin": PICKED.map((pick) => ({ _id: pick._id, name: pick.name })),
      "topics:listTopicChoices": TOPICS,
    }));
    // The server filters and pages (insights-helpful-content-plan.md, IH21): "Our picks" answers with the picks.
    vi.mocked(usePaginatedQuery).mockReset().mockImplementation(((_query: unknown, args: { picks?: boolean }) => ({
      results: args?.picks ? PICKED : [...PICKED, EDWARD],
      status: "Exhausted",
      isLoading: false,
      loadMore: vi.fn(),
    })) as never);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      return name.endsWith("updateFollow") ? update : name.endsWith("setFollowPick") ? setPick : vi.fn();
    }) as never);
  });

  it("names the picks, filters to them, and greys the tick for a fifth", () => {
    renderWithProviders(<WhoToFollowAdminPage />);

    expect(screen.getByText("admin.newsFollows.picksNotice")).toBeInTheDocument();
    expect(screen.getAllByText("admin.newsFollows.picked")).toHaveLength(4);
    const edward = screen.getByText("Edward Sturm").closest("tr") as HTMLElement;
    expect(within(edward).getByText("Traffic")).toBeInTheDocument();
    expect(within(edward).getByRole("checkbox")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("admin.newsFollows.filters.show"), { target: { value: "PICKS" } });
    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ picks: true });
    expect(screen.queryByText("Edward Sturm")).not.toBeInTheDocument();
    expect(screen.getByText("Lily Ray")).toBeInTheDocument();
  });

  it("takes someone out of the picks with the tick, without opening their page", async () => {
    renderWithProviders(<WhoToFollowAdminPage />);

    const lily = screen.getByText("Lily Ray").closest("tr") as HTMLElement;
    fireEvent.click(within(lily).getByRole("checkbox"));
    await waitFor(() => expect(setPick).toHaveBeenCalledWith({ followId: "pick_1", picked: false }));
    expect(push).not.toHaveBeenCalled();
  });

  it("an entry's page keeps its topic, and says who to untick when four are picked", async () => {
    renderWithProviders(<FollowEditor followId={"edward" as never} />);

    expect(screen.getByLabelText(/admin\.newsFollows\.pickCheckbox/)).toBeDisabled();
    expect(screen.getByText("admin.newsFollows.pickHintFull")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/admin\.newsFollows\.topicLabel/), { target: { value: "RANKINGS" } });
    fireEvent.submit(screen.getByLabelText(/admin\.newsFollows\.nameLabel/).closest("form") as HTMLFormElement);
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      followId: "edward", kind: "X", name: "Edward Sturm", url: "https://x.com/edward", whyEn: "Why Edward Sturm.", topic: "RANKINGS", picked: false,
    }));
  });
});
