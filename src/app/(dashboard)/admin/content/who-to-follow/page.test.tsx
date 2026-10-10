import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import WhoToFollowAdminPage from "./page";
import { AddPersonPage } from "./AddPersonPage";
import { FollowEditor } from "./FollowEditor";
import { PersonPage } from "./PersonPage";

const { update, create, setPick, setCollect, setInKnowledge, push } = vi.hoisted(() => ({
  update: vi.fn(), create: vi.fn(), setPick: vi.fn(), setCollect: vi.fn(), setInKnowledge: vi.fn(), push: vi.fn(),
}));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const follow = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  _id: id, name, whyEn: `Why ${name}.`, channelKinds: ["X"], topic: null, pickedAt: null, collected: 0, inKnowledge: 0, newestAt: null, ...extra,
});
const PICKED = ["Nacho Mascort", "Lily Ray", "Kevin Indig", "Google Search Central"].map((name, index) => follow(`pick_${index}`, name, { pickedAt: index + 1, topic: "RANKINGS" }));
const EDWARD = follow("edward", "Edward Sturm", { topic: "TRAFFIC", channelKinds: ["X", "YOUTUBE"], collected: 22 });
const TOPICS = [{ key: "TRAFFIC", nameEn: "Traffic" }, { key: "RANKINGS", nameEn: "Rankings" }];
const page = (rows: unknown[]) => ({ rows, total: rows.length, page: 1, pages: 1, size: 15, cut: null, preparing: false });
// Each the same object every render, as Convex answers until something changes.
const EVERYONE = page([...PICKED, EDWARD]);
const PICKS_ONLY = page(PICKED);
const CHANNELS = [
  { _id: "c_x", kind: "X", address: "https://x.com/edwardeachday", collect: true, status: "X_NOT_SET_UP", problem: null, lastCheckedAt: null, lastItemAt: null, found: 0 },
  { _id: "c_yt", kind: "YOUTUBE", address: "https://www.youtube.com/@buildinpublic", collect: true, status: "COLLECTING", problem: null, lastCheckedAt: 1, lastItemAt: 1, found: 22 },
  { _id: "c_li", kind: "LINKEDIN", address: "https://linkedin.com/in/edwardsturm", collect: false, status: "LINKEDIN", problem: null, lastCheckedAt: null, lastItemAt: null, found: 0 },
];
const ITEMS = {
  results: [{
    _id: "item_1", kind: "YOUTUBE", titleEn: "I tested internal links for 30 days", summaryEn: "What moved.", url: "https://www.youtube.com/watch?v=1",
    publishedAt: 1, knowledge: { state: null, words: null, problem: null },
  }],
  status: "Exhausted", isLoading: false, loadMore: vi.fn(),
};

/**
 * Admin → Content → Who to follow (docs/plans/active/content-people-
 * knowledge-plan.md, boards 1–3): one row a person with their channels,
 * narrowed and sorted on the server, "Our picks" ticked on the list; a
 * person's page with their channels' Collect ticks and their stories' In
 * knowledge ticks; Add a person from their channels' addresses; and Edit
 * details.
 */
describe("Admin Who to follow", () => {
  beforeEach(() => {
    push.mockReset();
    update.mockReset().mockResolvedValue(null);
    create.mockReset().mockResolvedValue("new_person");
    setPick.mockReset().mockResolvedValue(null);
    setCollect.mockReset().mockResolvedValue(null);
    setInKnowledge.mockReset().mockResolvedValue(null);
    const others: (reference: unknown, args: unknown) => unknown = answerQueries({
      "newsFollows:getFollow": { ...EDWARD, createdAt: 1, translations: { done: 1, total: 1 } },
      "newsFollows:listPicksForAdmin": PICKED.map((pick) => ({ _id: pick._id, name: pick.name })),
      "followChannels:listChannelsForAdmin": CHANNELS,
      "topics:listTopicChoices": TOPICS,
    });
    vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
      if (convexPath(reference).endsWith("listFollowsForAdmin")) return (args as { picks?: boolean }).picks ? PICKS_ONLY : EVERYONE;
      return others(reference, args);
    }) as never);
    vi.mocked(usePaginatedQuery).mockReset().mockImplementation((() => ITEMS) as never);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("updateFollow")) return update;
      if (name.endsWith("createFollow")) return create;
      if (name.endsWith("setFollowPick")) return setPick;
      if (name.endsWith("setChannelCollect")) return setCollect;
      if (name.endsWith("setNewsItemInKnowledge")) return setInKnowledge;
      return vi.fn();
    }) as never);
  });

  const lastListArgs = () => vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith("listFollowsForAdmin")).at(-1)?.[1];

  it("lists people with their channels, filters to the picks on the server, and greys the tick for a fifth", () => {
    renderWithProviders(<WhoToFollowAdminPage />);

    expect(screen.getByText("admin.newsFollows.picksNotice")).toBeInTheDocument();
    const edward = screen.getByText("Edward Sturm").closest("tr") as HTMLElement;
    expect(within(edward).getByText("Traffic")).toBeInTheDocument();
    expect(within(edward).getByText("admin.newsFollows.kinds.YOUTUBE")).toBeInTheDocument();
    expect(within(edward).getByRole("checkbox")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("admin.newsFollows.filters.show"), { target: { value: "PICKS" } });
    expect(lastListArgs()).toMatchObject({ picks: true, page: 1, rows: 15 });
    expect(screen.queryByText("Edward Sturm")).not.toBeInTheDocument();
  });

  it("sorts by a heading over the whole list, the most articles first", () => {
    renderWithProviders(<WhoToFollowAdminPage />);
    expect(lastListArgs()).toMatchObject({ sort: "name", direction: "asc" });
    fireEvent.click(screen.getByRole("button", { name: /admin\.newsFollows\.columns\.collected/ }));
    expect(lastListArgs()).toMatchObject({ sort: "collected", direction: "desc", page: 1 });
  });

  it("takes someone out of the picks with the tick without opening their page, and a row opens it", async () => {
    renderWithProviders(<WhoToFollowAdminPage />);

    const lily = screen.getByText("Lily Ray").closest("tr") as HTMLElement;
    fireEvent.click(within(lily).getByRole("checkbox"));
    await waitFor(() => expect(setPick).toHaveBeenCalledWith({ followId: "pick_1", picked: false }));
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Edward Sturm"));
    expect(push).toHaveBeenCalledWith("/admin/content/who-to-follow/edward");
  });

  it("a person's page shows each channel's status; LinkedIn can't be ticked, and a tick stops collecting", async () => {
    renderWithProviders(<PersonPage followId={"edward" as never} />);

    expect(screen.getByText("admin.newsFollows.person.channels.status.X_NOT_SET_UP")).toBeInTheDocument();
    expect(screen.getByText("admin.newsFollows.person.channels.status.LINKEDIN")).toBeInTheDocument();
    const linkedin = screen.getByText("linkedin.com/in/edwardsturm").closest("tr") as HTMLElement;
    expect(within(linkedin).getByRole("checkbox")).toBeDisabled();

    const youtube = screen.getByText("youtube.com/@buildinpublic").closest("tr") as HTMLElement;
    fireEvent.click(within(youtube).getByRole("checkbox"));
    await waitFor(() => expect(setCollect).toHaveBeenCalledWith({ channelId: "c_yt", collect: false }));
  });

  it("a person's stories each have the In knowledge tick, beside the words kept", async () => {
    renderWithProviders(<PersonPage followId={"edward" as never} />);

    const video = screen.getByText("I tested internal links for 30 days").closest("tr") as HTMLElement;
    expect(within(video).getByText("admin.knowledgeTick.summaryOnly")).toBeInTheDocument();
    fireEvent.click(within(video).getByRole("checkbox"));
    await waitFor(() => expect(setInKnowledge).toHaveBeenCalledWith({ itemId: "item_1", keep: true }));
  });

  it("Add a person names each address's channel as it is typed, sends only the filled ones, and opens their page", async () => {
    renderWithProviders(<AddPersonPage />);

    fireEvent.change(screen.getByLabelText(/admin\.newsFollows\.nameLabel/), { target: { value: "Aleyda Solis" } });
    fireEvent.change(screen.getByLabelText("admin.newsFollows.add.channelsLabel"), { target: { value: "https://x.com/aleyda" } });
    expect(screen.getByText("admin.newsFollows.kinds.X")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/admin\.newsFollows\.whyLabel/), { target: { value: "International SEO, explained clearly." } });
    fireEvent.submit(screen.getByLabelText(/admin\.newsFollows\.nameLabel/).closest("form") as HTMLFormElement);

    await waitFor(() => expect(create).toHaveBeenCalledWith({
      name: "Aleyda Solis", whyEn: "International SEO, explained clearly.", picked: false, channels: ["https://x.com/aleyda"], topic: undefined,
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/who-to-follow/new_person"));
  });

  it("Edit details keeps the topic, says who to untick when four are picked, and goes back to the person", async () => {
    renderWithProviders(<FollowEditor followId={"edward" as never} />);

    expect(screen.getByLabelText(/admin\.newsFollows\.pickCheckbox/)).toBeDisabled();
    expect(screen.getByText("admin.newsFollows.pickHintFull")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/admin\.newsFollows\.topicLabel/), { target: { value: "RANKINGS" } });
    fireEvent.submit(screen.getByLabelText(/admin\.newsFollows\.nameLabel/).closest("form") as HTMLFormElement);
    await waitFor(() => expect(update).toHaveBeenCalledWith({
      followId: "edward", name: "Edward Sturm", whyEn: "Why Edward Sturm.", topic: "RANKINGS", picked: false,
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/who-to-follow/edward"));
  });
});
