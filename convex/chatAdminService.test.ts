import { describe, expect, test } from "vitest";
import {
  getThreadUserSummary,
  normalizeSearchTerm,
  paginateItems,
  threadMatchesSearch,
} from "./chatAdminService";
import type { Doc, Id } from "./_generated/dataModel";

const thread = {
  _id: "thread-1" as Id<"threads">,
  _creationTime: 0,
  title: "Pricing conversation",
  userId: "user-1" as Id<"users">,
  companyId: "company-1" as Id<"companies">,
  sourceUrl: "https://source-only.test/pricing",
  createdAt: 1,
  updatedAt: 2,
} satisfies Doc<"threads">;

const user = {
  _id: "user-1" as Id<"users">,
  _creationTime: 0,
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "USER",
} satisfies Doc<"users">;

describe("chat admin service helpers", () => {
  test("normalizes blank search terms", () => {
    expect(normalizeSearchTerm("  Pricing ")).toBe("pricing");
    expect(normalizeSearchTerm("   ")).toBeNull();
    expect(normalizeSearchTerm()).toBeNull();
  });

  test("paginates arrays with totals", () => {
    expect(paginateItems([1, 2, 3, 4], 2, 2)).toEqual({ data: [3, 4], totalCount: 4, totalPages: 2 });
  });

  test("matches threads by title, user, or source URL when enabled", () => {
    expect(threadMatchesSearch({ thread, user, term: "pricing" })).toBe(true);
    expect(threadMatchesSearch({ thread, user, term: "ada" })).toBe(true);
    expect(threadMatchesSearch({ thread, user, term: "source-only", includeSourceUrl: false })).toBe(false);
    expect(threadMatchesSearch({ thread, user, term: "source-only", includeSourceUrl: true })).toBe(true);
  });

  test("summarizes optional thread users", () => {
    expect(getThreadUserSummary(user, "Unknown User")).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: "https://api.dicebear.com/7.x/notionists/svg",
    });
    expect(getThreadUserSummary(null, "Unknown User")).toBeNull();
  });
});
