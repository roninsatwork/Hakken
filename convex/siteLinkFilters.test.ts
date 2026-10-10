import { describe, expect, test } from "vitest";
import { linkChangedIn, linkInGroup } from "./siteLinkLists";

/**
 * All backlinks' two filters (discovery-detail-and-hakken-sees-plan.md §5): a
 * group from Where links come from, read from each stored link, and a stretch
 * of days from New and lost links.
 */
const link = { domainFrom: "blog.example.co.uk", country: "GB", platformTypes: ["blogs"], itemType: "anchor", attributes: ["nofollow"] };

describe("a link's group", () => {
  test("by country, domain ending, kind of site, kind of link and attribute", () => {
    expect(linkInGroup(link, "countries:GB")).toBe(true);
    expect(linkInGroup(link, "countries:RU")).toBe(false);
    expect(linkInGroup({ ...link, country: undefined }, "countries:(none)")).toBe(true);
    expect(linkInGroup(link, "tlds:co.uk")).toBe(true);
    expect(linkInGroup(link, "tlds:com")).toBe(false);
    expect(linkInGroup(link, "platforms:blogs")).toBe(true);
    expect(linkInGroup({ ...link, platformTypes: [] }, "platforms:unknown")).toBe(true);
    expect(linkInGroup(link, "linkTypes:anchor")).toBe(true);
    expect(linkInGroup(link, "attributes:nofollow")).toBe(true);
    expect(linkInGroup(link, "attributes:ugc")).toBe(false);
  });
});

describe("gained or lost in a stretch of days", () => {
  test("first seen in it, or lost and last seen in it", () => {
    expect(linkChangedIn({ firstSeen: "2026-09-29", lastSeen: "2026-10-08", status: "LIVE" }, "2026-09-28", "2026-10-05")).toBe(true);
    expect(linkChangedIn({ firstSeen: "2025-01-01", lastSeen: "2026-10-01", status: "LOST" }, "2026-09-28", "2026-10-05")).toBe(true);
    expect(linkChangedIn({ firstSeen: "2025-01-01", lastSeen: "2026-10-01", status: "LIVE" }, "2026-09-28", "2026-10-05")).toBe(false);
    expect(linkChangedIn({ firstSeen: "2026-10-05", lastSeen: "2026-10-08", status: "NEW" }, "2026-09-28", "2026-10-05")).toBe(false);
  });
});
