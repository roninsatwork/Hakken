import { label } from "./model.mjs";
export const ROUTES_FILE = "src/lib/productEntityRoutes.ts";
export function routesModule(entities) {
  return `// Generated feature routes. The generator keeps this in step with product.entities.json.
const routes = ${JSON.stringify(
    entities.map((e) => ({ path: "/admin/" + e.route, label: label(e.table) })),
    null,
    2,
  )};
export function isProductEntityPath(pathname: string): boolean {
  return getProductEntityLabel(pathname) !== undefined;
}
export function getProductEntityLabel(pathname: string): string | undefined {
  return routes.find(route => pathname === route.path || pathname.startsWith(route.path + "/"))?.label;
}
`;
}
export function routesTest(entities) {
  return `import { describe, expect, test } from "vitest";
import { getProductEntityLabel, isProductEntityPath } from "./productEntityRoutes";
describe("generated feature access boundary", () => {
  test("includes generated list and detail routes only", () => {
${entities
  .map(
    (e) => `    expect(isProductEntityPath("/admin/${e.route}")).toBe(true);
    expect(getProductEntityLabel("/admin/${e.route}/record")).toBe("${label(e.table)}");
    expect(isProductEntityPath("/admin/${e.route}/record")).toBe(true);
    expect(isProductEntityPath("/admin/${e.route}-extra")).toBe(false);`,
  )
  .join("\n")}
    expect(isProductEntityPath("/admin")).toBe(false);
    expect(isProductEntityPath("/admin/settings")).toBe(false);
    expect(isProductEntityPath("/admin/companies")).toBe(false);
  });
});
`;
}
export function wireAccess(layout, sidebar) {
  const importLine =
    'import { isProductEntityPath } from "@/src/lib/productEntityRoutes";';
  const current = 'ADMIN_SECTION_ROLES.includes(user?.role ?? "")';
  const extended =
    '(ADMIN_SECTION_ROLES.includes(user?.role ?? "") || (user?.role === "ADMIN" && isProductEntityPath(pathname)))';
  if (!layout.includes(importLine)) {
    if (
      layout.split(current).length !== 2 ||
      !layout.startsWith('"use client";')
    )
      throw new Error(
        "Admin access layout has changed; review its role check.",
      );
    layout = layout
      .replace('"use client";', '"use client";\n' + importLine)
      .replace(current, extended);
  } else if (!layout.includes(extended))
    throw new Error("Generated admin route access has changed.");
  const sidebarImport =
    'import { getProductEntityLabel } from "@/src/lib/productEntityRoutes";';
  const activeAnchor = "function getActiveItemFromPathname(pathname: string) {";
  const activeBody =
    activeAnchor +
    "\n  const productLabel = getProductEntityLabel(pathname);\n  if (productLabel) return productLabel;";
  if (!sidebar.includes(sidebarImport)) {
    if (
      sidebar.split(activeAnchor).length !== 2 ||
      !sidebar.startsWith('"use client";')
    )
      throw new Error("Sidebar active-route mapping has changed.");
    sidebar = sidebar
      .replace('"use client";', '"use client";\n' + sidebarImport)
      .replace(activeAnchor, activeBody);
  } else if (!sidebar.includes(activeBody))
    throw new Error("Generated active-route mapping has changed.");
  const previous = "{isAdmin ? (\n                  <AdminNavTree";
  const next =
    "{isAdmin && (canSeeAdminSections || isAuditor) ? (\n                  <AdminNavTree";
  if (sidebar.includes(next)) return { layout, sidebar };
  if (sidebar.split(previous).length !== 2)
    throw new Error(
      "Sidebar tree selection has changed; review its role check.",
    );
  return { layout, sidebar: sidebar.replace(previous, next) };
}
export function accessTest(entities) {
  return `import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import messages from "@/messages/en.json";
import AdminLayout from "@/src/app/(dashboard)/admin/layout";
import { PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
const state = vi.hoisted(() => ({ role: "ADMIN", path: "/admin/${entities[0].route}", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path, useRouter: () => ({ push: state.push }) }));
vi.mock("convex/react", () => ({ useQuery: () => ({ role: state.role }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
function show(role: string, path: string) {
  state.role = role; state.path = path; state.push.mockClear();
  render(<NextIntlClientProvider locale="en" messages={messages}><AdminLayout>
    <p>Feature content</p><PagePrimaryAction>Change record</PagePrimaryAction>
  </AdminLayout></NextIntlClientProvider>);
}
describe("generated features in the actual admin layout", () => {
  test.each(["ADMIN", "SUPER_ADMIN"])("%s can open and edit the generated feature", role => {
    show(role, "/admin/${entities[0].route}");
    expect(screen.getByText("Feature content")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change record" })).toBeTruthy();
  });
  test("READ_ONLY sees the feature without edit controls", () => {
    show("READ_ONLY", "/admin/${entities[0].route}");
    expect(screen.getByText("Feature content")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change record" })).toBeNull();
  });
  test.each(["/admin/settings", "/admin/companies", "/admin/${entities[0].route}-extra"])("ADMIN is still refused %s", async path => {
    show("ADMIN", path);
    expect(screen.queryByText("Feature content")).toBeNull();
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/app"));
  });
  test.each(["USER", "AUDITOR"])("%s cannot open the generated feature", role => {
    show(role, "/admin/${entities[0].route}");
    expect(screen.queryByText("Feature content")).toBeNull();
  });
});
`;
}
