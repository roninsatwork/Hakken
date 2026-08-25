import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The directory is observability, not administration.
 *
 * Anthony, 2026-07-31: *"i dont want to add / edit or delete users i want
 * observability."* The temptation on a screen like this is one "quick" toggle,
 * so read-only is asserted rather than merely intended. Source is inspected
 * rather than rendered because the property is about what the component is
 * allowed to reach for at all, not about what a particular render produced.
 *
 * Governed by docs/plans/active/user-directory-plan.md.
 */
const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/(dashboard)/admin/directory/page.tsx"),
  "utf8"
);

describe("admin user directory is read-only", () => {
  test("reaches for no mutation at all", () => {
    expect(source).not.toMatch(/useMutation/);
  });

  test("imports no user-mutating Convex function", () => {
    for (const forbidden of ["addUser", "updateUser", "deleteUser", "inviteUser", "impersonate"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  test("renders no destructive control", () => {
    for (const forbidden of ["Trash2", "Edit2", "Pencil", "ConfirmationModal", "AdminModalForm"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  test("pages server-side on the shared admin page size", () => {
    // A client-side slice of a full read would defeat the point of the indexes.
    expect(source).toContain("TABLE_PAGE_SIZE");
    expect(source).toContain("usePaginatedQuery");
    expect(source).toContain("listDirectoryUsers");
  });

  test("loads only the company fields needed by the filter", () => {
    expect(source).toContain("api.companies.getCompanies");
    expect(source).toContain('mode: "directoryOptions"');
  });

  test("sends every filter to the server rather than filtering a page", () => {
    // Accepts shorthand (`activity,`) as well as explicit (`activity: …`).
    const queryArgs = source.slice(source.indexOf("listDirectoryUsers"));
    for (const arg of ["companyId", "role", "activity", "sortBy", "searchTerm"]) {
      expect(queryArgs).toMatch(new RegExp(`\\b${arg}\\s*[,:]`));
    }
    expect(source).not.toMatch(/results\s*\.\s*filter\s*\(/);
    expect(source).not.toMatch(/results\s*\.\s*sort\s*\(/);
  });

  test("avatars bypass the image optimiser, as every other admin table does", () => {
    /*
     * An avatar URL can be any host — a Google photo, a dicebear placeholder,
     * an upload. Without `unoptimized`, next/image demands each host be
     * allowlisted in next.config and throws a runtime error on the first one
     * that is not. That is unwinnable for user-supplied URLs, which is why
     * every sibling admin table sets it.
     */
    const images = source.match(/<Image[\s\S]*?\/>/g) ?? [];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image).toContain("unoptimized");
    }
  });

  test("links through to the existing profile screen", () => {
    expect(source).toContain("/admin/users/${person._id}");
  });

  test("disables sorting while searching instead of ignoring it", () => {
    // Convex search indexes cannot range filter, so the two cannot combine.
    expect(source).toContain("disabled={searching}");
    expect(source).toContain("sortUnavailable");
  });
});
