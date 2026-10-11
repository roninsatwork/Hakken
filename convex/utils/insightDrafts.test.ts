import { describe, expect, test } from "vitest";
import { campaignOf, draftsFrom, taggedLink } from "./insightDrafts";

/**
 * Drafted fixes (insights-analyst-plan.md I23, I39): each link tagged so
 * Analytics' campaigns count what it brought, and only well-formed drafts of
 * the area asked for kept from a model's answer.
 */

describe("drafted fixes", () => {
  test("a tagged link names where it was put, how, and Hakken's campaign for the week", () => {
    expect(taggedLink("https://www.ronins.co.uk", "/ai-agency/", "POST", "Guildford", "2026-10-05"))
      .toBe("https://www.ronins.co.uk/ai-agency/?utm_source=google-business-profile&utm_medium=post&utm_campaign=hakken-post-2026-10-05");
    expect(taggedLink("https://www.ronins.co.uk", "/case-studies/", "OUTREACH", "www.casestudies.com", "2026-10-05"))
      .toBe("https://www.ronins.co.uk/case-studies/?utm_source=casestudies.com&utm_medium=outreach&utm_campaign=hakken-outreach-2026-10-05");
    expect(campaignOf("REVIEW_REQUEST", "2026-10-05")).toBe("hakken-review-request-2026-10-05");
  });

  test("only the area's own kinds, with words, a page from those given, and no more than the area's limit", () => {
    const answer = {
      drafts: [
        { kind: "POST", target: "Guildford", why: "No post since February 2025.", title: "Post: what AI agents do for small businesses", body: "A post.", page: "/ai-agency/" },
        { kind: "POST", target: "London", why: "", title: "Post", body: "Another post.", page: "/not-a-page-given/" },
        { kind: "OUTREACH", target: "casestudies.com", why: "", title: "Email", body: "Hello", page: "/" },
        { kind: "CATEGORY", target: "Both profiles", why: "", title: "", body: "No title" },
        { kind: "MADE_UP", target: "x", title: "x", body: "x" },
        { kind: "NAME", target: "Both profiles", why: "Two names.", title: "Use one name", body: "Ronins", page: null },
        { kind: "DESCRIPTION", target: "London", why: "", title: "A description", body: "Words", page: "/" },
        { kind: "CATEGORY", target: "Both", why: "", title: "Add a category", body: "Artificial intelligence company", page: null },
      ],
    };
    const local = draftsFrom(answer, "LOCAL", ["/", "/ai-agency/"]);
    expect(local.map((draft) => [draft.kind, draft.page])).toEqual([["POST", "/ai-agency/"], ["POST", null], ["NAME", null], ["DESCRIPTION", "/"]]);
    expect(draftsFrom(answer, "LINKS", ["/"]).map((draft) => draft.target)).toEqual(["casestudies.com"]);
    expect(draftsFrom(null, "REVIEWS", [])).toEqual([]);
  });
});
