import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import { mentionsRivalsSees, webMentionsSees, whereListedSees } from "./mentions";

/** What Hakken sees on the Web mentions screens (discovery-detail-and-hakken-sees-plan.md §6). */
describe("All mentions", () => {
  const row = (host: string, day: string, tone: number, strength: number, linked = 0) => ({ url: `https://${host}/page`, host, day, tone, strength, linked });

  test("new pages, those speaking badly, and the strong pages worth asking for a link", () => {
    const box = webMentionsSees({
      rows: [
        row("news.example", "2026-10-05", 1, 420), row("forum.example", "2026-10-02", 2, 300), row("blog.example", "2026-09-20", 0, 150, 1),
        row("old.example", "2026-06-01", 0, 90), row("weak.example", "2026-10-01", 0, 20),
      ],
    }, "2026-10-10");
    expect(box.says).toEqual([{ code: "newPages", a: 4, b: 5 }, { code: "badly", a: 1, text: "forum.example" }, { code: "noLink", a: 1, text: "news.example" }]);
    expect(box.steps).toEqual([
      { code: "reply", text: "forum.example", link: "visitPage", to: { url: "https://forum.example/page" } },
      { code: "askForLink", text: "news.example", link: "visitPage", to: { url: "https://news.example/page" } },
    ]);
    expectWords("mentions", box);
  });

  test("quiet and linked; nothing found", () => {
    const box = webMentionsSees({ rows: [row("blog.example", "2026-08-01", 0, 300, 1)] }, "2026-10-10");
    expect(box).toEqual({ says: [{ code: "newPages", a: 0, b: 1 }], steps: [] });
    expectWords("mentions", box);
    expect(webMentionsSees({ rows: [] }, "2026-10-10").says).toEqual([{ code: "none" }]);
  });
});

describe("Against rivals", () => {
  const business = (host: string, mentions: number, before: number, you = false) => ({ host, you, mentions, before });

  test("behind the leader, the month's change, and where to get listed", () => {
    const box = mentionsRivalsSees({ businesses: [business("ronins.co.uk", 12, 15, true), business("www.brightside.co.uk", 28, 20)] });
    expect(box.says).toEqual([{ code: "behind", a: 30, b: 70, text: "www.brightside.co.uk" }, { code: "downMonth", a: 3 }]);
    expect(box.steps).toEqual([
      { code: "seeLeader", text: "www.brightside.co.uk", link: "seeBusiness", to: { record: "business", key: "brightside.co.uk" } },
      { code: "getListed", link: "whereToGetListed", to: { segment: "mentions/listed" } },
    ]);
    expectWords("mentionsRivals", box);
  });

  test("level is leading; nothing found", () => {
    const box = mentionsRivalsSees({ businesses: [business("brightside.co.uk", 5, 2), business("ronins.co.uk", 5, 1, true)] });
    expect(box.says).toEqual([{ code: "lead", a: 50 }, { code: "upMonth", a: 4 }]);
    expect(box.steps).toEqual([{ code: "getListed", link: "whereToGetListed", to: { segment: "mentions/listed" } }]);
    expectWords("mentionsRivals", box);
    expect(mentionsRivalsSees({ businesses: [business("ronins.co.uk", 0, 0, true)] }).says).toEqual([{ code: "none" }]);
  });
});

describe("Where to get listed", () => {
  const place = (host: string, rivals: string[], strength: number | null, there = false) => ({ host, rivals, strength, there });

  test("the places rivals are and you are not, the one with most rivals, and the strongest", () => {
    const box = whereListedSees({
      rows: [place("clutch.co", ["a", "b", "c"], 300), place("bbc.co.uk", ["a"], 900), place("goodfirms.co", ["a"], 200, true), place("nobody.example", [], 50)],
    });
    expect(box.says).toEqual([{ code: "places", a: 2, b: 4 }, { code: "mostRivals", text: "clutch.co", a: 3 }, { code: "strongest", text: "bbc.co.uk", a: 900 }]);
    expect(box.steps).toEqual([
      { code: "getOnto", text: "clutch.co", link: "seeWebsite", to: { record: "website", key: "clutch.co" } },
      { code: "getOnto", text: "bbc.co.uk", link: "seeWebsite", to: { record: "website", key: "bbc.co.uk" } },
    ]);
    expectWords("mentionsListed", box);
  });

  test("on every place already; nothing known", () => {
    const box = whereListedSees({ rows: [place("clutch.co", ["a"], 300, true)] });
    expect(box).toEqual({ says: [{ code: "everywhere", a: 1 }], steps: [] });
    expectWords("mentionsListed", box);
    const one = whereListedSees({ rows: [place("clutch.co", ["a"], null)] });
    expect(one).toEqual({ says: [{ code: "places", a: 1, b: 1 }], steps: [{ code: "getOnto", text: "clutch.co", link: "seeWebsite", to: { record: "website", key: "clutch.co" } }] });
    expectWords("mentionsListed", one);
    expect(whereListedSees({ rows: [] }).says).toEqual([{ code: "none" }]);
  });
});
