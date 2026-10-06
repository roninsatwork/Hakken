import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import TopicsAdminPage from "./page";
import { TopicEditor } from "./TopicEditor";

const { create, update, remove, push } = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const topic = (id: string, key: string, nameEn: string, order: number, uses: { knowledge: number; helpful: number; people: number }) => ({
  _id: id, key, nameEn, order, uses, translations: { done: 1, total: 1 },
});
const TRAFFIC = topic("topic_1", "TRAFFIC", "Traffic", 1, { knowledge: 2, helpful: 1, people: 38 });
const RANKINGS = topic("topic_2", "RANKINGS", "Rankings", 2, { knowledge: 2, helpful: 5, people: 92 });

/**
 * Admin → Content → Topics (docs/plans/active/insights-helpful-content-plan.md,
 * IH20, boards 16 and 17): the shared list with what uses each topic, a topic
 * on its own page, and a delete that asks yes or no first.
 */
describe("Admin Topics", () => {
  beforeEach(() => {
    push.mockReset();
    create.mockReset().mockResolvedValue("topic_3");
    update.mockReset().mockResolvedValue(null);
    remove.mockReset().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(answerQueries({ "topics:listTopicsForAdmin": [TRAFFIC, RANKINGS], "topics:getTopic": RANKINGS }));
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      return name.endsWith("createTopic") ? create : name.endsWith("updateTopic") ? update : name.endsWith("deleteTopic") ? remove : vi.fn();
    }) as never);
  });

  it("lists each topic in order with what uses it, each opening on its own page, and deletes one only after a yes", async () => {
    renderWithProviders(<TopicsAdminPage />);

    const row = screen.getByText("Rankings").closest("tr") as HTMLElement;
    expect(within(row).getByText("92")).toBeInTheDocument();
    expect(within(row).getByText("5")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "admin.topics.edit" }));
    expect(push).toHaveBeenCalledWith("/admin/content/topics/topic_2");
    fireEvent.click(screen.getByRole("button", { name: /admin\.topics\.create/ }));
    expect(push).toHaveBeenCalledWith("/admin/content/topics/new");

    fireEvent.click(within(row).getByRole("button", { name: "admin.topics.delete" }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "common.actions.delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ topicId: "topic_2" }));
  });

  it("adds a topic with its name and, if given, its place; left blank, it goes last", async () => {
    renderWithProviders(<TopicEditor />);

    const name = screen.getByLabelText(/admin\.topics\.nameLabel/);
    fireEvent.change(name, { target: { value: "Local search" } });
    fireEvent.submit(name.closest("form") as HTMLFormElement);
    await waitFor(() => expect(create).toHaveBeenCalledWith({ nameEn: "Local search" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/topics"));

    create.mockClear();
    fireEvent.change(screen.getByLabelText(/admin\.topics\.orderLabel/), { target: { value: "2" } });
    fireEvent.submit(name.closest("form") as HTMLFormElement);
    await waitFor(() => expect(create).toHaveBeenCalledWith({ nameEn: "Local search", order: 2 }));
  });

  it("a topic's page renames or moves it, says what uses it, and deletes from its header after a yes", async () => {
    renderWithProviders(<TopicEditor topicId={"topic_2" as never} />);

    expect(screen.getByText("admin.topics.uses.people")).toBeInTheDocument();
    const name = screen.getByLabelText(/admin\.topics\.nameLabel/);
    expect(name).toHaveValue("Rankings");
    fireEvent.change(name, { target: { value: "Positions" } });
    fireEvent.submit(name.closest("form") as HTMLFormElement);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ topicId: "topic_2", nameEn: "Positions", order: 2 }));

    fireEvent.click(screen.getByRole("button", { name: "admin.topics.delete" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "common.actions.delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ topicId: "topic_2" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/topics"));
  });
});
