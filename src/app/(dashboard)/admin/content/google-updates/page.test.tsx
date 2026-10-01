import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import GoogleUpdatesAdminPage from "./page";
import { GoogleUpdateEditor } from "./GoogleUpdateEditor";

const { create, push } = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const UPDATE = {
  _id: "update_1", titleEn: "March 2025 core update", descriptionEn: "Google re-ranked results.", startedOn: "2025-03-13",
  finishedOn: null, url: "https://status.search.google.com/1", updatedAt: 1, translations: { done: 1, total: 1 },
};

/** Admin → Content → Google updates (docs/plans/active/knowledge-news-and-digest-plan.md, D6). */
describe("Admin Google updates", () => {
  beforeEach(() => {
    push.mockReset();
    create.mockReset().mockResolvedValue("update_2");
    vi.mocked(useQuery).mockImplementation(answerQueries({ "googleUpdates:listGoogleUpdates": [UPDATE] }));
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => (convexPath(reference).endsWith("createGoogleUpdate") ? create : vi.fn())) as never);
  });

  it("lists each update, still rolling out until it has a finish, translated, and opening on its own page", () => {
    renderWithProviders(<GoogleUpdatesAdminPage />);

    expect(screen.getByText("March 2025 core update")).toBeInTheDocument();
    expect(screen.getByText("admin.googleUpdates.rollingOut")).toBeInTheDocument();
    expect(screen.getByText("admin.contentEditor.translations.done")).toBeInTheDocument();
    fireEvent.click(screen.getByText("March 2025 core update"));
    expect(push).toHaveBeenCalledWith("/admin/content/google-updates/update_1");
  });

  it("enters a new update in English, with no finish while it rolls out", async () => {
    renderWithProviders(<GoogleUpdateEditor />);

    fireEvent.change(screen.getByLabelText(/admin\.googleUpdates\.titleLabel/), { target: { value: "June 2025 core update" } });
    fireEvent.change(screen.getByLabelText(/admin\.googleUpdates\.descriptionLabel/), { target: { value: "Another re-rank." } });
    fireEvent.change(screen.getByLabelText(/admin\.googleUpdates\.startedLabel/), { target: { value: "2025-06-30" } });
    const link = screen.getByLabelText(/admin\.googleUpdates\.urlLabel/);
    fireEvent.change(link, { target: { value: "https://status.search.google.com/2" } });
    fireEvent.submit(link.closest("form") as HTMLFormElement);

    // It may take up to Google's usual two weeks unless the announcement says otherwise (R8).
    await waitFor(() => expect(create).toHaveBeenCalledWith({
      titleEn: "June 2025 core update", descriptionEn: "Another re-rank.", meaningEn: "", startedOn: "2025-06-30", finishedOn: "", expectedDays: 14, url: "https://status.search.google.com/2",
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/google-updates"));
  });

  // What it means for the reader, and how long Google said it may take (knowledge-news-and-digest-plan.md, revised again 2026-10-01, R8).
  it("says what an update means for the reader and how long it may take", async () => {
    renderWithProviders(<GoogleUpdateEditor />);

    fireEvent.change(screen.getByLabelText(/admin\.googleUpdates\.titleLabel/), { target: { value: "September 2026 spam update" } });
    fireEvent.change(screen.getByLabelText(/admin\.googleUpdates\.descriptionLabel/), { target: { value: "A spam update." } });
    fireEvent.change(screen.getByLabelText(/admin\.googleUpdates\.meaningLabel/), { target: { value: "Wait before changing pages." } });
    fireEvent.change(screen.getByLabelText(/admin\.googleUpdates\.startedLabel/), { target: { value: "2026-09-24" } });
    fireEvent.change(screen.getByLabelText(/admin\.googleUpdates\.expectedDaysLabel/), { target: { value: "10" } });
    const link = screen.getByLabelText(/admin\.googleUpdates\.urlLabel/);
    fireEvent.change(link, { target: { value: "https://status.search.google.com/3" } });
    fireEvent.submit(link.closest("form") as HTMLFormElement);

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ meaningEn: "Wait before changing pages.", expectedDays: 10 })));
  });
});
