import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { convexPath } from "@/src/test/siteViewFixtures";
import { ClassificationTypeEditor } from "./ClassificationTypeEditor";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation(),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const T = "admin.classificationTypes";

const detail = (overrides: Record<string, unknown> = {}) => ({
  key: "INFORMATIONAL", nameEn: "Informational content", builtIn: true, addedAt: null, classifications: 41, websites: 12, more: false, ...overrides,
});

/**
 * A type's own page and Add a type (docs/plans/active/classification-types-
 * plan.md, CT3–CT4): one field, its English name; a built-in type is renamed,
 * never removed; an added type is removed only while unused.
 */
describe("a classification type's page", () => {
  const save = vi.fn();
  const remove = vi.fn();
  let answer: unknown = detail();

  beforeEach(() => {
    answer = detail();
    push.mockClear();
    save.mockReset().mockResolvedValue("INFORMATIONAL");
    remove.mockReset().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      return convexPath(reference).endsWith("classificationTypes:classificationTypeDetail") ? answer : undefined;
    }) as never);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("saveClassificationType")) return save;
      if (name.endsWith("removeClassificationType")) return remove;
      return vi.fn();
    }) as never);
  });

  const saveButton = (label: string) => screen.getByRole("button", { name: new RegExp(label) });

  it("adds a type once it has a name, then goes back to the list", async () => {
    renderWithProviders(<ClassificationTypeEditor typeKey={null} />);

    expect(screen.getByText(`${T}.newTitle`)).toBeInTheDocument();
    expect(saveButton(`${T}.create`)).toBeDisabled();

    fireEvent.change(screen.getByLabelText(`${T}.name`), { target: { value: "Location page" } });
    fireEvent.click(saveButton(`${T}.create`));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ name: "Location page" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/settings/classification"));
  });

  it("renames a built-in type, and says it can't be removed", async () => {
    renderWithProviders(<ClassificationTypeEditor typeKey="INFORMATIONAL" />);

    expect(screen.getByLabelText(`${T}.name`)).toHaveValue("Informational content");
    expect(screen.getByText(`${T}.builtInFoot`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${T}.removeType` })).not.toBeInTheDocument();
    // Nothing changed, nothing to save.
    expect(saveButton(`${T}.save`)).toBeDisabled();

    fireEvent.change(screen.getByLabelText(`${T}.name`), { target: { value: "Articles" } });
    fireEvent.click(saveButton(`${T}.save`));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ key: "INFORMATIONAL", name: "Articles" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("removes an added type no classification uses, after a yes", async () => {
    answer = detail({ key: "k_careers", nameEn: "Careers", builtIn: false, addedAt: Date.UTC(2026, 9, 15), classifications: 0, websites: 0 });
    renderWithProviders(<ClassificationTypeEditor typeKey="k_careers" />);

    expect(screen.getByText(`${T}.added ${T}.uses`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `${T}.removeType` }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: `${T}.removeDialog.confirm` }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ key: "k_careers" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/settings/classification"));
  });

  it("keeps an added type in use, saying why", () => {
    answer = detail({ key: "k_location", nameEn: "Location page", builtIn: false, addedAt: Date.UTC(2026, 9, 15), classifications: 2, websites: 1 });
    renderWithProviders(<ClassificationTypeEditor typeKey="k_location" />);

    expect(screen.getByText(`${T}.inUseFoot`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${T}.removeType` })).not.toBeInTheDocument();
  });

  it("says so when the type is no longer in the list", () => {
    answer = null;
    renderWithProviders(<ClassificationTypeEditor typeKey="k_gone" />);
    expect(screen.getByText(`${T}.notFound`)).toBeInTheDocument();
  });
});
