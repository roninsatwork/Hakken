import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { convexPath } from "@/src/test/siteViewFixtures";
import ClassificationTypesPage from "./page";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation(),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const T = "admin.classificationTypes";

const type = (key: string, name: string, builtIn: boolean, classifications: number, more = false) => ({ key, name, builtIn, classifications, more });
const list = (types = [
  type("INFORMATIONAL", "Informational content", true, 41),
  type("SERVICE", "Service", true, 300, true),
  type("k_location", "Location page", false, 2),
  type("k_careers", "Careers", false, 0),
]) => ({ types, counted: 300, most: 50 });

/**
 * System Settings → Classification (docs/plans/active/classification-types-
 * plan.md, CT2): every type and how many classifications use it; the bin
 * only on an added type no classification uses.
 */
describe("System Settings → Classification", () => {
  const remove = vi.fn();
  let answer: unknown = list();

  beforeEach(() => {
    answer = list();
    push.mockClear();
    remove.mockReset().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      return convexPath(reference).endsWith("classificationTypes:classificationTypeList") ? answer : undefined;
    }) as never);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => (convexPath(reference).endsWith("removeClassificationType") ? remove : vi.fn())) as never);
  });

  const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

  it("lists each type and how many classifications use it", () => {
    renderWithProviders(<ClassificationTypesPage />);

    expect(within(rowOf("Informational content")).getByText("41")).toBeInTheDocument();
    // Past the count, the column says so rather than a number it did not read.
    expect(within(rowOf("Service")).getByText(`${T}.more`)).toBeInTheDocument();
  });

  it("offers the bin only on an added type no classification uses, and removes it after a yes", async () => {
    renderWithProviders(<ClassificationTypesPage />);

    for (const name of ["Informational content", "Service", "Location page"]) {
      expect(within(rowOf(name)).queryByRole("button", { name: `${T}.remove` })).not.toBeInTheDocument();
    }
    fireEvent.click(within(rowOf("Careers")).getByRole("button", { name: `${T}.remove` }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(`${T}.removeDialog.body`)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: `${T}.removeDialog.confirm` }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ key: "k_careers" }));
  });

  it("opens a type's own page from its pencil, and a new type's from Add type", () => {
    renderWithProviders(<ClassificationTypesPage />);

    fireEvent.click(within(rowOf("Location page")).getByRole("button", { name: `${T}.edit` }));
    expect(push).toHaveBeenLastCalledWith("/admin/settings/classification/k_location");
    fireEvent.click(screen.getByRole("button", { name: `${T}.add` }));
    expect(push).toHaveBeenLastCalledWith("/admin/settings/classification/new");
  });

  it("greys out Add type at the most types there can be", () => {
    answer = { ...list(), most: 4 };
    renderWithProviders(<ClassificationTypesPage />);
    expect(screen.getByRole("button", { name: `${T}.add` })).toBeDisabled();
  });
});
