import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import {
  allLinksSees, anchorRecordSees, anchorsSees, backlinksSummarySees, brokenSees, comparedSees, domainRecordSees, domainsSees, ipsSees, newLostSees,
  qualitySees, stepEnd, whereLinksSees,
} from "./backlinks";

/** What Hakken sees on the Backlinks screens (discovery-detail-and-hakken-sees-plan.md §6). */
describe("Summary", () => {
  test("the websites linking here, their fall over the dates, and broken links", () => {
    const box = backlinksSummarySees({ before: { referringDomains: 120, backlinks: 900 }, points: [{ referringDomains: 118 }, { referringDomains: 112, backlinks: 860, brokenBacklinks: 4 }] });
    expect(box.says).toEqual([{ code: "linkingWebsites", a: 112, b: 860 }, { code: "down", a: 8 }, { code: "broken", a: 4 }]);
    expect(box.steps).toEqual([
      { code: "seeLost", link: "newAndLost", to: { segment: "backlinks/new-lost" } },
      { code: "fixBroken", link: "brokenBacklinks", to: { segment: "backlinks/broken" } },
    ]);
    expectWords("backlinks", box);
  });

  test("growing, steady, a single reading, nothing read", () => {
    expect(backlinksSummarySees({ before: null, points: [{ referringDomains: 10 }, { referringDomains: 14 }] }).says[1]).toEqual({ code: "up", a: 4 });
    const steady = backlinksSummarySees({ before: null, points: [{ referringDomains: 10 }, { referringDomains: 10 }] });
    expect(steady).toEqual({ says: [{ code: "linkingWebsites", a: 10, b: 0 }, { code: "steady" }], steps: [{ code: "seeNew", link: "newAndLost", to: { segment: "backlinks/new-lost" } }] });
    expectWords("backlinks", steady);
    expect(backlinksSummarySees({ before: null, points: [{ referringDomains: 10 }] }).says).toEqual([{ code: "linkingWebsites", a: 10, b: 0 }]);
    expect(backlinksSummarySees({ before: null, points: [{ backlinks: 3 }] }).says).toEqual([{ code: "none" }]);
  });
});

describe("Compared with rivals", () => {
  test("behind the leader and the strongest website", () => {
    const box = comparedSees([
      { host: "ronins.co.uk", isYou: true, referringDomains: 112, domainRank: 210 },
      { host: "www.brightside.co.uk", isYou: false, referringDomains: 340, domainRank: 260 },
    ]);
    expect(box.says).toEqual([{ code: "behind", a: 112, b: 340, text: "www.brightside.co.uk" }, { code: "strongerRank", text: "www.brightside.co.uk", a: 260, b: 210 }]);
    expect(box.steps).toEqual([
      { code: "getListed", link: "whereToGetListed", to: { segment: "mentions/listed" } },
      { code: "seeLeader", text: "www.brightside.co.uk", link: "seeBusiness", to: { record: "business", key: "brightside.co.uk" } },
    ]);
    expectWords("backlinksCompared", box);
  });

  test("leading on both; nothing read", () => {
    const box = comparedSees([{ host: "ronins.co.uk", isYou: true, referringDomains: 50, domainRank: 300 }, { host: "b.co.uk", isYou: false, referringDomains: 50, domainRank: 300 }]);
    expect(box.says).toEqual([{ code: "lead", a: 50 }]);
    expectWords("backlinksCompared", box);
    expect(comparedSees([{ host: "ronins.co.uk", isYou: true, referringDomains: null, domainRank: null }]).says).toEqual([{ code: "none" }]);
  });
});

describe("Link quality", () => {
  test("broken links, the spam score, and links not followed", () => {
    const box = qualitySees({ spamScore: 12, brokenBacklinks: 9, brokenPages: 3, nofollowReferringDomains: 40, referringDomains: 112 });
    expect(box.says).toEqual([{ code: "broken", a: 9, b: 3 }, { code: "spam", a: 12 }, { code: "nofollow", a: 40, b: 112 }]);
    expect(box.steps).toEqual([{ code: "fixBroken", link: "brokenBacklinks", to: { segment: "backlinks/broken" } }]);
    expectWords("backlinksQuality", box);
  });

  test("nothing broken; nothing read", () => {
    const box = qualitySees({ spamScore: null, brokenBacklinks: 0, brokenPages: 0, nofollowReferringDomains: null, referringDomains: 0 });
    expect(box).toEqual({ says: [{ code: "noBroken" }], steps: [] });
    expectWords("backlinksQuality", box);
    expect(qualitySees(null).says).toEqual([{ code: "none" }]);
  });
});

describe("Where links come from", () => {
  test("the largest groups as a share of the links, and their links", () => {
    const names: Record<string, string> = { GB: "United Kingdom", US: "United States" };
    const box = whereLinksSees({ breakdown: "countries", groups: [{ key: "US", count: 200 }, { key: "(rest)", count: 500 }, { key: "GB", count: 300 }], total: 1000 }, (key) => names[key] ?? key);
    expect(box).toEqual({
      says: [{ code: "largest", text: "United Kingdom", a: 30, b: 300 }, { code: "second", text: "United States", a: 20 }],
      steps: [{ code: "seeGroup", text: "United Kingdom", link: "seeLinks", to: { segment: "backlinks/all", filters: { group: "countries:GB" } } }],
    });
    expectWords("backlinksWhere", box);
    expect(whereLinksSees({ breakdown: "countries", groups: [{ key: "(rest)", count: 5 }], total: 5 }, String).says).toEqual([{ code: "none" }]);
  });
});

describe("All backlinks", () => {
  const link = (domainFrom: string, domainRank: number, dofollow = true, status: "LIVE" | "NEW" | "LOST" = "LIVE") => ({ domainFrom, urlFrom: `https://${domainFrom}/post`, dofollow, status, domainRank });

  test("what the links listed have in common", () => {
    const box = allLinksSees([link("bbc.co.uk", 800), link("blog.example", 120, false), link("blog.example", 120, true, "LOST"), link("dir.example", 40)], true);
    expect(box.says).toEqual([{ code: "links", a: 4, b: 3 }, { code: "strongest", text: "bbc.co.uk", a: 800 }, { code: "followed", a: 75 }]);
    expect(box.steps).toEqual([
      { code: "visitStrongest", text: "bbc.co.uk", link: "visitPage", to: { url: "https://bbc.co.uk/post" } },
      { code: "seeLost", a: 1, link: "lostLinks", to: { segment: "backlinks/all", filters: { status: "LOST" } } },
    ]);
    expectWords("backlinksAll", box);
    expectWords("backlinksAll", { says: [{ code: "lost", a: 1 }], steps: [] });
  });

  test("every link lost needs no lost step; nothing, or nothing matching", () => {
    expect(allLinksSees([link("a.example", 10, true, "LOST")], true).steps).toHaveLength(1);
    expect(allLinksSees([], false).says).toEqual([{ code: "none" }]);
    const none = allLinksSees([], true);
    expect(none.says).toEqual([{ code: "noneMatch" }]);
    expectWords("backlinksAll", none);
  });
});

describe("Referring domains", () => {
  test("live of all, the strongest, the strongest lost, the new", () => {
    const box = domainsSees([
      { domain: "bbc.co.uk", rank: 800, status: "LIVE" }, { domain: "lost.example", rank: 300, status: "LOST" },
      { domain: "new.example", rank: 50, status: "NEW" }, { domain: "old.example", rank: 20, status: "LOST" },
    ]);
    expect(box.says).toEqual([{ code: "domains", a: 2, b: 4 }, { code: "strongest", text: "bbc.co.uk", a: 800 }, { code: "lost", a: 2, text: "lost.example" }]);
    expect(box.steps).toEqual([
      { code: "winBack", text: "lost.example", link: "seeDomain", to: { record: "domain", key: "lost.example" } },
      { code: "seeStrongest", text: "bbc.co.uk", link: "seeDomain", to: { record: "domain", key: "bbc.co.uk" } },
    ]);
    expectWords("backlinksDomains", box);
  });

  test("new ones said when nothing is lost; nothing read", () => {
    const box = domainsSees([{ domain: "bbc.co.uk", rank: 800, status: "NEW" }]);
    expect(box.says).toEqual([{ code: "domains", a: 1, b: 1 }, { code: "strongest", text: "bbc.co.uk", a: 800 }, { code: "new", a: 1 }]);
    expectWords("backlinksDomains", box);
    expect(domainsSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("Anchors", () => {
  test("the words used most, and the name against other words", () => {
    const box = anchorsSees([
      { anchor: "web design surrey", backlinks: 30 }, { anchor: "Ronins", backlinks: 50 }, { anchor: "www.ronins.co.uk", backlinks: 10 }, { anchor: "", backlinks: 10 },
    ], "www.ronins.co.uk");
    expect(box.says).toEqual([{ code: "top", text: "Ronins", a: 50 }, { code: "brand", a: 60 }, { code: "otherWords", a: 40 }]);
    expect(box.steps).toEqual([{ code: "seeAnchor", text: "Ronins", link: "seeAnchor", to: { record: "anchor", key: "Ronins" } }]);
    expectWords("backlinksAnchors", box);
    expect(anchorsSees([{ anchor: " ", backlinks: 3 }], "ronins.co.uk").says).toEqual([{ code: "none" }]);
  });
});

describe("Referring IPs", () => {
  test("the networks, and the one hosting most linking websites", () => {
    const box = ipsSees({ referringDomains: 112, referringSubnets: 90 }, [{ subnet: "185.12.4.0", referringDomains: 6 }, { subnet: "51.1.2.0", referringDomains: 2 }]);
    expect(box).toEqual({
      says: [{ code: "spread", a: 112, b: 90 }, { code: "crowded", text: "185.12.4.0", a: 6 }],
      steps: [
        { code: "seeNetwork", text: "185.12.4.0", link: "seeNetwork", to: { segment: "backlinks/ips", filters: { network: "185.12.4.0" } } },
        { code: "checkDomains", link: "referringDomains", to: { segment: "backlinks/domains" } },
      ],
    });
    expectWords("backlinksIps", box);
  });

  test("one website a network; nothing read", () => {
    const box = ipsSees({ referringDomains: 3, referringSubnets: 3 }, [{ subnet: "1.2.3.0", referringDomains: 1 }]);
    expect(box.says).toEqual([{ code: "spread", a: 3, b: 3 }, { code: "oneEach" }]);
    expectWords("backlinksIps", box);
    expect(ipsSees(null, []).says).toEqual([{ code: "none" }]);
  });
});

describe("Broken backlinks", () => {
  test("links on broken pages, the page most linked, the strongest link", () => {
    const box = brokenSees([
      { pageTo: "/old-pricing/", domainFrom: "blog.example", domainRank: 100 },
      { pageTo: "/old-pricing/", domainFrom: "dir.example", domainRank: 40 },
      { pageTo: "https://ronins.co.uk/case-study/", domainFrom: "bbc.co.uk", domainRank: 800 },
    ]);
    expect(box.says).toEqual([{ code: "broken", a: 3, b: 2 }, { code: "topPage", text: "/old-pricing/", a: 2 }, { code: "strongest", text: "bbc.co.uk", more: "/case-study/", a: 800 }]);
    expect(box.steps).toEqual([
      { code: "putBack", text: "/old-pricing/", link: "seePage", to: { record: "page", key: "/old-pricing/" } },
      { code: "putBack", text: "/case-study/", link: "seePage", to: { record: "page", key: "/case-study/" } },
    ]);
    expectWords("backlinksBroken", box);
    expect(brokenSees([]).says).toEqual([{ code: "none" }]);
  });
});

describe("New and lost links", () => {
  const row = (day: string, gained: number, lost: number) => ({ day, newReferringDomains: gained, lostReferringDomains: lost });

  test("gained against lost, the step that lost most, and its links", () => {
    const box = newLostSees([row("2026-09-21", 3, 1), row("2026-09-28", 1, 6), row("2026-10-05", 4, 0)], "week", (day) => `w/c ${day}`);
    expect(box.says).toEqual([{ code: "gainedLost", a: 8, b: 7 }, { code: "mostLost", text: "w/c 2026-09-28", a: 6 }, { code: "mostGained", text: "w/c 2026-10-05", a: 4 }]);
    expect(box.steps).toEqual([{ code: "seeLostThen", text: "w/c 2026-09-28", link: "seeLinks", to: { segment: "backlinks/all", filters: { changedFrom: "2026-09-28", changedUntil: "2026-10-05" } } }]);
    expectWords("backlinksNewLost", box);
  });

  test("only gained; nothing moved; a step's end", () => {
    const box = newLostSees([row("2026-09-01", 2, 0)], "month", String);
    expect(box.steps).toEqual([{ code: "seeGainedThen", text: "2026-09-01", link: "seeLinks", to: { segment: "backlinks/all", filters: { changedFrom: "2026-09-01", changedUntil: "2026-10-01" } } }]);
    expectWords("backlinksNewLost", box);
    expect(newLostSees([row("2026-09-01", 0, 0)], "day", String).says).toEqual([{ code: "none" }]);
    expect(stepEnd("2026-10-09", "day")).toBe("2026-10-10");
  });
});

describe("One linking website and one anchor", () => {
  const link = (urlFrom: string, pageTo: string, domainRank: number, pageRank: number | null, dofollow = true) =>
    ({ urlFrom, pageTo, dofollow, domainRank, pageRank, status: "LIVE" as const });

  test("a website's links here, followed, and its strongest; one that has gone", () => {
    const links = [link("https://bbc.co.uk/a", "/", 800, 40), link("https://bbc.co.uk/b", "/about/", 800, 90, false)];
    const box = domainRecordSees({ domain: "bbc.co.uk", website: { backlinks: 2, status: "LIVE", spamScore: 3 }, links });
    expect(box).toEqual({
      says: [{ code: "links", text: "bbc.co.uk", a: 2, b: 1 }, { code: "spam", a: 3 }],
      steps: [{ code: "seeLink", text: "bbc.co.uk", link: "visitPage", to: { url: "https://bbc.co.uk/b" } }],
    });
    expectWords("backlinksDomain", box);
    const gone = domainRecordSees({ domain: "bbc.co.uk", website: { backlinks: 2, status: "LOST", spamScore: null }, links });
    expect(gone.says[0]).toEqual({ code: "lost", text: "bbc.co.uk" });
    expect(gone.steps[0]).toMatchObject({ code: "askBack" });
    expectWords("backlinksDomain", gone);
    expect(domainRecordSees({ domain: "x.example", website: null, links: [] }).says).toEqual([{ code: "notHeld", text: "x.example" }]);
  });

  test("an anchor's links, websites, and the page they point at most", () => {
    const box = anchorRecordSees({
      anchor: "web design surrey",
      summary: { backlinks: 3, referringDomains: 2 },
      links: [link("https://a.example/x", "https://ronins.co.uk/web-design/", 100, null), link("https://b.example/y", "/web-design/", 300, null), link("https://b.example/z", "/", 300, 5)],
    });
    expect(box.says).toEqual([{ code: "links", text: "web design surrey", a: 3, b: 2 }, { code: "page", text: "/web-design/", a: 1 }]);
    expect(box.steps).toEqual([{ code: "seeLink", link: "visitPage", to: { url: "https://b.example/z" } }]);
    expectWords("backlinksAnchor", box);
    expect(anchorRecordSees({ anchor: "x", summary: null, links: [] }).says).toEqual([{ code: "notHeld", text: "x" }]);
  });
});
