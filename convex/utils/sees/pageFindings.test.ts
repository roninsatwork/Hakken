import { describe, expect, test } from "vitest";
import { findingWords } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

/**
 * The general rules over any page's own figures (sees-every-page-plan-2026-10-31.md, phase 3), on answers shaped like
 * the screens' own: Search Console's searches with last period's clicks, Clarity's pages with how far people scroll,
 * Visibility's websites.
 */
const searches = {
  totals: { clicks: 900, clicksBefore: 1200, impressions: 40000 },
  rows: [
    { key: "door handles", clicks: 520, previousClicks: 300, impressions: 9000, ctrPercent: 5.8 },
    { key: "brass hinges", clicks: 160, previousClicks: 480, impressions: 8000, ctrPercent: 2 },
    { key: "cabinet knobs", clicks: 120, previousClicks: 130, impressions: 1500, ctrPercent: 8 },
    { key: "door stops", clicks: 60, previousClicks: 70, impressions: 12000, ctrPercent: 0.5 },
    { key: "letter plates", clicks: 40, previousClicks: 45, impressions: 900, ctrPercent: 4.4 },
  ],
};

describe("what a page's own figures show", () => {
  test("the whole fell, the biggest rise and fall on the list, and the one holding most of it", () => {
    const found = pageFindings("searchConsole.keywords", searches);
    const words = found.map(findingWords);
    expect(words).toContain("Clicks fell to 900 from 1200 the span before.");
    expect(words).toContain("door handles: clicks rose to 520 from 300, the biggest rise on the list.");
    expect(words).toContain("brass hinges: clicks fell to 160 from 480, the biggest fall on the list.");
    // At most four from one list: the list's four strongest, before the share it holds.
    expect(words.filter((line) => line.startsWith("door handles holds"))).toEqual([]);
    expect(pageFindings("searchConsole.keywords", { rows: searches.rows.map(({ key, clicks }) => ({ key, clicks })) }).map(findingWords)).toEqual(["door handles holds 57.8% of the list's clicks."]);
    // Each finding's figures are keyed by its place, for the writer to name.
    expect(found[0].facts[0].key).toMatch(/^f1\./);
    expect(found.length).toBeLessThanOrEqual(6);
  });

  test("a percentage far from the list's average, weighed by its own base, on rows enough to trust", () => {
    const words = pageFindings("searchConsole.keywords", { rows: searches.rows }).map(findingWords);
    // Weighed by the times shown: door stops are shown most and clicked least; door handles clicked twice the average.
    expect(words).toContain("door stops: share clicked 0.5%, against 2.9% on average across the list.");
    expect(words).toContain("door handles: share clicked 5.8%, against 2.9% on average across the list.");
  });

  test("a figure where less is better is marked so; a figure not on the measures list is never a finding", () => {
    const clarity = { pages: [
      { page: "/basket", visits: 300, rage: 40, scroll: 20 },
      { page: "/", visits: 900, rage: 5, scroll: 45 },
      { page: "/about", visits: 200, rage: 2, scroll: 70 },
      { page: "/blog", visits: 150, rage: 1, scroll: 48 },
    ] };
    const found = pageFindings("clarity.pages", clarity);
    expect(found.find((finding) => finding.kind === "rowBelow")?.params).toMatchObject({ name: "/basket", measure: "scroll", value: 20 });
    expect(pageFindings("visibility.something", { rows: [{ name: "a", widgets: 5 }, { name: "b", widgets: 9 }, { name: "c", widgets: 1 }] })).toEqual([]);
    expect(pageFindings("visibility.something", null)).toEqual([]);
    // A row named by a code the screen turns into words is never a finding's name (seen on Almost there, 2026-10-31).
    expect(pageFindings("searchConsole.almost", { byIntent: [{ kind: "UNJUDGED", clicks: 97 }, { kind: "BUYING", clicks: 50 }, { kind: "RESEARCHING", clicks: 30 }, { kind: "BRAND", clicks: 23 }] })).toEqual([]);
  });

  test("small moves and even lists say nothing", () => {
    const even = { totals: { clicks: 100, clicksBefore: 96 }, rows: [{ key: "a", clicks: 25, previousClicks: 24 }, { key: "b", clicks: 25, previousClicks: 26 }, { key: "c", clicks: 25, previousClicks: 23 }, { key: "d", clicks: 25, previousClicks: 23 }] };
    expect(pageFindings("searchConsole.keywords", even)).toEqual([]);
  });

  test("the span before kept beside the figures, as the Products screen keeps its steps", () => {
    const products = { figures: { steps: { looked: 24587, basket: 5108, checkout: 2310, bought: 1246 }, before: { looked: 23200, basket: 4910, checkout: 2950, bought: 1080 } } };
    const words = pageFindings("googleAnalytics.products", products).map(findingWords);
    expect(words).toContain("Checkouts started fell to 2310 from 2950 the span before.");
  });

  test("Products as it hands the eye: Selling more and Selling less with their items, picked, and the boxes with their befores (More Handles, October 2026)", () => {
    // Page-screen-redo-plan-2026-11-03.md, step 3: the last press found nothing, as the chart handed names only.
    const items = (name: string, itemsBought: number, itemsBoughtBefore: number, itemsAdded: number) => ({ name, itemsBought, itemsBoughtBefore, itemsAdded, itemsLeft: Math.max(0, itemsAdded - itemsBought) });
    const page = {
      boxes: { basketsLeft: 3771, basketsLeftBefore: 3862, sale: "Purchase", visitsThatBought: 1205, visitsThatBoughtBefore: 1246, productsNeverBought: 865, productsNeverBoughtBefore: 970, productsAdded: 2301 },
      steps: { picked: true, rows: [{ name: "Add to cart", visits: 4976, visitsThatBought: 1205, visitsLeft: 3771 }] },
      productsChart: {
        view: "Selling more than September",
        sellingMore: { picked: true, rows: [
          items("Eclipse 1838 steel butt hinge, 102mm", 200, 0, 200),
          items("Waltz round cupboard knob, satin brass, 32mm", 88, 10, 129),
          items("Carlisle Brass Taylor spindle, 8mm", 87, 2, 104),
          items("Cottingham shaker cupboard knob", 91, 21, 140),
        ] },
        sellingLess: { picked: true, rows: [
          items("Frelan 5mm plain spindle", 2, 106, 17),
          items("Waltz round cupboard knob, antique brass, 25mm", 188, 250, 619),
          items("Carlisle Brass tubular latch, 64mm", 0, 60, 0),
          items("Bardom lever on rose", 170, 178, 770),
        ] },
      },
      // The table's page on screen, sorted by items bought: picked from every product too.
      productsTable: { picked: true, rows: [
        { key: "Waltz 32mm\u001fDefault Category", name: "Waltz round cupboard knob, antique brass, 32mm", category: "Default Category", itemsBought: 493, itemsBoughtBefore: 547, itemsAdded: 1753, itemsLeft: 1260, share: 0.071 },
        { key: "Eclipse\u001fDefault Category", name: "Eclipse 1838 steel butt hinge, 102mm", category: "Default Category", itemsBought: 200, itemsBoughtBefore: 0, itemsAdded: 200, itemsLeft: 0, share: 0.029 },
        { key: "Waltz 25mm\u001fDefault Category", name: "Waltz round cupboard knob, antique brass, 25mm", category: "Default Category", itemsBought: 188, itemsBoughtBefore: 250, itemsAdded: 619, itemsLeft: 431, share: 0.027 },
        { key: "Bardom\u001fDefault Category", name: "Bardom lever on rose", category: "Default Category", itemsBought: 170, itemsBoughtBefore: 178, itemsAdded: 770, itemsLeft: 600, share: 0.025 },
      ] },
    };
    const words = pageFindings("googleAnalytics.products", pageDataFor(page, "googleAnalytics.products")).map(findingWords);
    // Its own first (pageOwnFindings.ts): the step that loses most, and the products never bought. Then the general
    // rules': a product new this month is a mover; the biggest fall among the ten; said once though the table holds them too.
    expect(words).toEqual([
      "Of the visits that did Add to cart, 24.2% went on to Purchase.",
      "Added but never bought holds 37.6% of the list's products added to baskets.",
      "Eclipse 1838 steel butt hinge, 102mm: items bought rose to 200 from 0, the biggest rise on the list.",
      "Frelan 5mm plain spindle: items bought fell to 2 from 106, the biggest fall on the list.",
      "Waltz round cupboard knob, antique brass, 25mm: items bought fell to 188 from 250, the biggest fall on the list.",
    ]);
    // Ten products, or a table's first page, picked from the whole list: never "holds most of the list" — only the
    // products never bought, which are a share of every product added.
    expect(words.filter((line) => line.includes(" holds "))).toEqual(["Added but never bought holds 37.6% of the list's products added to baskets."]);
    // The boxes moved under a sixth: nothing to say of them. A sixth or more is said, as the boxes name it.
    const fewer = pageFindings("googleAnalytics.products", { boxes: { ...page.boxes, productsNeverBought: 620 } }).map(findingWords);
    expect(fewer).toContain("Products added but never bought fell to 620 from 970 the span before.");
  });

  test("every way a page keeps the span before is read: a plain before, and Google Analytics' change as a fraction (shared work 3)", () => {
    // Channels as Google Analytics hands it: visits and their change against the span before, as a fraction.
    const channels = { rows: [
      { name: "Organic Search", visits: 4000, change: 0.02 },
      { name: "Referral", visits: 1640, change: 0.64 },
      { name: "Direct", visits: 1200, change: -0.4 },
      { name: "Email", visits: 300, change: 0.05 },
    ] };
    const words = pageFindings("googleAnalytics.channels", pageDataFor(channels, "googleAnalytics.channelsPage")).map(findingWords);
    expect(words).toContain("Referral: visits rose to 1640 from 1000, the biggest rise on the list.");
    expect(words).toContain("Direct: visits fell to 1200 from 2000, the biggest fall on the list.");
    // A plain before beside the row's main count.
    const plain = { rows: channels.rows.map(({ name, visits, change }) => ({ name, visits, before: Math.round(visits / (1 + change)) })) };
    expect(pageFindings("insights.sources", plain).map(findingWords)).toContain("Referral: visits rose to 1640 from 1000, the biggest rise on the list.");
  });

  test("a place that moved: the biggest climb and drop on Google, weighed by clicks, read however the screen keeps it (shared work 7)", () => {
    // Search Console keeps the move as positionChange (the place before less the place now) and its change as clicks.
    const searches = { rows: [
      { key: "door handles", clicks: 520, change: 40, position: 4.2, positionChange: 4.8 },
      { key: "brass hinges", clicks: 160, change: -20, position: 11.4, positionChange: -6.1 },
      { key: "rare knob", clicks: 1, change: 0, position: 3, positionChange: 30 },
      { key: "door stops", clicks: 60, change: 2, position: 7, positionChange: 0.4 },
    ] };
    const said = pageFindings("searchConsole.keywords", searches).map(findingWords);
    expect(said).toContain("door handles: place in search results 4.2, from 9 the span before, the biggest climb on the list.");
    expect(said).toContain("brass hinges: place in search results 11.4, from 5.3 the span before, the biggest drop on the list.");
    // Visibility keeps its move as change; a page of a longer list says no "biggest". On a page with no rules of its own:
    // Keywords has its own since 2026-11-03 (own/visibility.ts), which say only theirs.
    const ranks = { rows: [{ keyword: "door handles", volume: 900, position: 4, change: 5 }, { keyword: "hinges", volume: 400, position: 12, change: -4 }, { keyword: "knobs", volume: 200, position: 8, change: 0 }] };
    expect(pageFindings("visibility.pageRecord", ranks).map((one) => one.kind)).toEqual(expect.arrayContaining(["placeUp", "placeDown"]));
    expect(pageFindings("visibility.pageRecord", { ...ranks, total: 900, page: 1, pages: 36 }).map((one) => one.kind)).not.toContain("placeUp");
  });

  test("pages not sorted yet count in a list's totals but are never named (2026-11-03)", () => {
    const kinds = [{ name: "Not sorted yet", views: 9000, sorted: false }, { name: "Handles", views: 600, sorted: true }, { name: "Hinges", views: 250, sorted: true }, { name: "Knobs", views: 150, sorted: true }];
    const said = pageFindings("googleAnalytics.visitors", { kinds }).map(findingWords).concat(pageFindings("searchConsole.pages", { kinds }).map(findingWords));
    expect(said.some((line) => line.includes("Not sorted yet"))).toBe(false);
  });

  test("one page of a longer list is never a whole: no row holds most of it (shared work 4)", () => {
    const rows = [{ key: "/a", views: 900 }, { key: "/b", views: 50 }, { key: "/c", views: 30 }, { key: "/d", views: 20 }];
    expect(pageFindings("googleAnalytics.landingPage", { rows }).map((one) => one.kind)).toContain("holdsMost");
    // A Sites page of a list, a list the eye cut, and a list the page marked.
    for (const paged of [{ rows, total: 9000, page: 1, pages: 360 }, { rows, rowsAllRows: 9000 }, { picked: true, rows }]) {
      expect(pageFindings("googleAnalytics.landingPage", paged).map((one) => one.kind)).not.toContain("holdsMost");
    }
  });

  test("a row's figures kept one level down, as Clarity keeps its groups", () => {
    const overview = { groups: [
      { kind: "SERVICE", name: "Service", now: { visits: 325, scroll: 22 } },
      { kind: "HUB", name: "Content hub", now: { visits: 487, scroll: 41 } },
      { kind: "HOME", name: "Home", now: { visits: 139, scroll: 30 } },
      { kind: "ABOUT", name: "About", now: { visits: 60, scroll: 70 } },
    ] };
    const words = pageFindings("clarity.overview", overview).map(findingWords);
    expect(words).toContain("Service: how far people scroll 22%, against 35.1% on average across the list.");
  });

  test("a list held twice is said once; a row new this period is a mover, where the list held the period before (Clarity's Pages, 2026-10-31; 2026-11-03)", () => {
    const rows = [
      { page: "/guide/", visits: 320, visitsBefore: 0, scroll: 35 },
      { page: "/", visits: 139, visitsBefore: 120, scroll: 39 },
      { page: "/ai-agency/", visits: 135, visitsBefore: 160, scroll: 32 },
      { page: "/about-us/", visits: 36, visitsBefore: 30, scroll: 69 },
    ];
    const found = pageFindings("clarity.pages", { rows, busiest: rows });
    const ids = found.map((finding) => `${finding.kind}|${JSON.stringify(finding.params)}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(found.map(findingWords)).toContain("/guide/: visits rose to 320 from 0, the biggest rise on the list.");
    // A list with nothing the period before at all was not kept then: no row of it is new.
    const unkept = rows.map((row) => ({ ...row, visitsBefore: 0 }));
    expect(pageFindings("clarity.pages", { rows: unkept }).some((finding) => finding.kind === "rowUp")).toBe(false);
    // A move of three in every hundred of the list's figure is said, past ten: once lost under a twentieth.
    const small = [{ key: "a", clicks: 500, previousClicks: 480 }, { key: "b", clicks: 200, previousClicks: 236 }, { key: "c", clicks: 150, previousClicks: 150 }, { key: "d", clicks: 150, previousClicks: 150 }];
    expect(pageFindings("searchConsole.keywords", { rows: small }).map(findingWords)).toContain("b: clicks fell to 200 from 236, the biggest fall on the list.");
  });

  test("a row is named by its own words before the number or id it is kept by; Google's stand-ins name nothing (page-screen-redo-plan-2026-11-03.md)", () => {
    const pages = [
      { key: "~fu", title: "Waltz round knob", address: "https://shop.test/waltz", views: 900 },
      { key: "~1u", address: "https://shop.test/returns", views: 120 },
      { key: "~0", name: "jd7c5kzq1w2e3r4t5y6u7i8o9p0a1s2d", label: "Home", views: 80 },
      { key: "~2", name: "(not set)", views: 70 },
      { key: "~3", title: "Door stops", views: 60 },
    ];
    // Named by its title, past its number; the row with an id for a name by its label; Google's "(not set)" left out.
    const found = pageFindings("googleAnalytics.landingPage", { rows: pages });
    expect(found.map(findingWords)).toEqual(["Waltz round knob holds 77.6% of the list's views."]);
    const quiet = pages.map((row) => (row.key === "~fu" ? { ...row, views: 10 } : row));
    expect(pageFindings("googleAnalytics.landingPage", { rows: quiet }).map((finding) => finding.params.name)).toEqual(["https://shop.test/returns"]);
    expect(pageFindings("googleAnalytics.landingPage", { rows: [{ key: "~1", views: 9 }, { key: "~2", views: 5 }, { key: "~3", views: 3 }, { key: "~4", views: 1 }] })).toEqual([]);
    // The event a row is about, an AI engine, a question: each a name.
    const events = [{ eventName: "add_to_cart", visits: 900 }, { eventName: "begin_checkout", visits: 200 }, { eventName: "purchase", visits: 100 }, { eventName: "view_cart", visits: 50 }];
    expect(pageFindings("googleAnalytics.events", { rows: events }).map((finding) => finding.params.name)).toEqual(["add_to_cart"]);
  });

  test("a list's main figure is the first count with something in it: a list whose conversions are all nought is read by its visits", () => {
    const channels = [
      { name: "Organic Search", conversions: 0, visits: 5200 },
      { name: "Direct", conversions: 0, visits: 1500 },
      { name: "Referral", conversions: 0, visits: 700 },
      { name: "Email", conversions: 0, visits: 300 },
    ];
    expect(pageFindings("googleAnalytics.channels", { channelsTable: { rows: channels } }).map(findingWords)).toEqual(["Organic Search holds 67.5% of the list's visits."]);
  });

  test("a share of a whole is set against its own reference, the whole website's, never the list's average; the mirror of it is said once", () => {
    // Seen on every page (2026-11-03): "tablet: share 2.8%, against 33.3% on average".
    const devices = [{ name: "mobile", viewsShare: 0.65, websiteViewsShare: 0.393 }, { name: "desktop", viewsShare: 0.322, websiteViewsShare: 0.577 }, { name: "tablet", viewsShare: 0.028, websiteViewsShare: 0.03 }];
    const words = pageFindings("googleAnalytics.landingPage", pageDataFor({ devices }, "googleAnalytics.page")).map(findingWords);
    expect(words).toEqual(["mobile: share of views 65%, against 39.3% across the whole website."]);
    // With no reference, a share says nothing at all.
    const shares = devices.map(({ name, viewsShare }) => ({ name, share: viewsShare }));
    expect(pageFindings("googleAnalytics.channel", pageDataFor({ devices: shares }, "googleAnalytics.overview"))).toEqual([]);
    // Two genders: the gain is said, never its mirror as well.
    const genders = [{ name: "female", peopleShare: 0.213, websitePeopleShare: 0.475 }, { name: "male", peopleShare: 0.787, websitePeopleShare: 0.525 }];
    expect(pageFindings("googleAnalytics.landingPage", pageDataFor({ genders }, "googleAnalytics.page")).map(findingWords)).toEqual(["male: share of people 78.7%, against 52.5% across the whole website."]);
  });

  test("the page's own boxes against the whole website and similar pages, past 100% where Google counts more than one a visit", () => {
    const boxes = { views: 456, viewsBefore: 456, visits: 86, visitsBefore: 73, websiteVisits: 35739, boughtRate: 0.07, websiteBoughtRate: 0.034, scrolledToBottomRate: 0.214, groupScrolledToBottomRate: 0.094 };
    const found = pageFindings("googleAnalytics.landingPage", pageDataFor({ boxes }, "googleAnalytics.page"));
    expect(found.map(findingWords)).toEqual([
      "This page: scrolled to the bottom 21.4%, against 9.4% on similar pages.",
      "This page: visitors who bought 7%, against 3.4% across the whole website.",
      "Visits rose to 86 from 73 the span before.",
    ]);
    expect(found[0].params).toMatchObject({ whole: 1, against: "group" });
    // Too few visits to trust a rate on; too close to its reference to say.
    expect(pageFindings("googleAnalytics.landingPage", pageDataFor({ boxes: { ...boxes, visits: 12, visitsBefore: 11 } }, "googleAnalytics.page"))).toEqual([]);
    expect(pageFindings("googleAnalytics.landingPage", pageDataFor({ boxes: { visits: 400, boughtRate: 0.04, websiteBoughtRate: 0.034 } }, "googleAnalytics.page"))).toEqual([]);
  });

  test("totals three deep; a list of one or two read as totals, each by its name; lists inside a list's rows", () => {
    expect(pageFindings("googleAnalytics.channel", { figures: { now: { all: { visits: 900, visitsBefore: 600 } } } }).map(findingWords)).toEqual(["Visits rose to 900 from 600 the span before."]);
    // A Websites screen's one website.
    expect(pageFindings("googleAnalytics.websites", [{ host: "shop.test", visits: 400, visitsBefore: 800 }]).map(findingWords)).toEqual(["shop.test: Visits fell to 400 from 800 the span before."]);
    // An AI engine's websites, each engine a list of its own (Visibility's AI share of voice).
    const engines = [
      { engine: "chatgpt", asked: 20, sites: [{ host: "shop.test", named: 6 }, { host: "rival.test", named: 1 }, { host: "other.test", named: 1 }, { host: "fourth.test", named: 0 }] },
      { engine: "perplexity", asked: 20, sites: [{ host: "shop.test", named: 2 }, { host: "rival.test", named: 2 }, { host: "other.test", named: 2 }, { host: "fourth.test", named: 2 }] },
    ];
    // On a page with no rules of its own: Share of voice says only its own since 2026-11-03 (own/visibility.ts).
    expect(pageFindings("visibility.aiShareGeneral", engines).map(findingWords)).toEqual(["shop.test holds 75% of the list's AI answers naming it."]);
  });

  test("Visits says its own findings, never the general rules' (More Handles, October 2026; Anthony: \"is chrome stats the best you can come up with\")", () => {
    const group = (name: string, visits: number, visitsBefore: number, engaged: number) => ({ name, visits, visitsBefore, engaged });
    const data = pageDataFor({
      visits: { visits: 35739, visitsBefore: 37507 },
      visitorGroups: {
        visitorType: [group("New", 24289, 24516, 16533), group("Returning", 9510, 10283, 5906)],
        browser: [group("Chrome", 14473, 15875, 9130), group("Safari", 14396, 15207, 8900), group("Edge", 5001, 4414, 3541), group("Firefox", 594, 596, 380)],
        age: [group("18–24", 665, 838, 410), group("25–34", 2286, 2338, 1420), group("35–44", 1715, 1687, 1100), group("45–54", 1546, 1566, 990), group("65+", 823, 712, 592)],
      },
      whatPeopleLookedAt: { kinds: [{ name: "Not sorted yet", views: 48026, pages: 3197, sorted: false }, { name: "Cupboard Handles", views: 31727, pages: 888, sorted: true }, { name: "Handles", views: 19254, pages: 1414, sorted: true }, { name: "Brand", views: 54019, pages: 13, sorted: true }] },
    }, "googleAnalytics.visitors");
    const said = pageFindings("googleAnalytics.visitors", data).map(findingWords);
    expect(said).toContain("Returning: visits down 7.5%, to 9510 from 10283 the span before; New: down 0.9%.");
    expect(said).toContain("Returning: share of visits that left at once 37.9%, against 31.9% for New.");
    expect(said).toContain("18–24: visits down 20.6%, to 665 from 838 the span before.");
    // Pages not sorted yet are Hakken's housekeeping, never a finding (Anthony, 2026-11-03: "this is really poor from the ai").
    expect(said.some((line) => line.startsWith("Not sorted yet"))).toBe(false);
    // A browser holding most of the visits, or falling with the market, is no finding on this page.
    expect(said.some((line) => line.startsWith("Chrome"))).toBe(false);
  });

  test("Visits finds returning visits halving at weekends, beside new visits' own dip (More Handles, October 2026)", () => {
    // October 2026's days as the daily line hands them: new, then returning.
    const october = [[749, 354], [708, 304], [674, 200], [699, 217], [938, 380], [867, 416], [899, 405], [792, 348], [773, 351], [706, 212], [708, 204], [990, 403], [950, 372], [889, 352], [870, 360], [671, 312], [639, 185], [704, 189], [864, 320], [963, 394], [880, 345], [759, 325], [701, 297], [677, 217], [717, 217], [849, 387], [848, 413], [763, 338], [706, 293], [735, 258], [581, 156]];
    const byDay = Object.fromEntries(october.map(([fresh, back], at) => [`2026-10-${String(at + 1).padStart(2, "0")}`, { new: fresh, returning: back }]));
    const data = pageDataFor({ days: { byDay, newName: "New", returningName: "Returning", weekendName: "at weekends", weekdayName: "On weekdays" } }, "googleAnalytics.visitors");
    const weekend = pageFindings("googleAnalytics.visitors", data).find((one) => one.id.startsWith("rowBelow:weekend"));
    expect(weekend && findingWords(weekend)).toBe("Returning at weekends: visits a day 200, against 351 for On weekdays.");
    // Beside it, how much new visits dip, for the writer to set against it.
    expect(weekend?.facts.find((fact) => fact.key.endsWith(".otherDip"))?.value).toBe(17.8);
    // A week with no dip says nothing.
    const flat = Object.fromEntries(Object.keys(byDay).map((day) => [day, { new: 700, returning: 300 }]));
    expect(pageFindings("googleAnalytics.visitors", { days: { byDay: flat } }).some((one) => one.id.startsWith("rowBelow:weekend"))).toBe(false);
  });

  test("Products adds its own to the general rules': the step that loses most, products never bought, one left in baskets far more (More Handles, October 2026)", () => {
    const data = pageDataFor({
      boxes: { sale: "Purchase", visitsThatBought: 1205, visitsThatBoughtBefore: 1246, productsNeverBought: 865, productsNeverBoughtBefore: 970, productsAdded: 2301, neverBoughtName: "Added but not bought" },
      steps: { picked: true, rows: [{ name: "Added to basket", visits: 4976, visitsBefore: 5108 }] },
      productsTable: {
        picked: true, othersName: "The other products listed",
        rows: [
          { name: "Waltz knob 32mm", itemsAdded: 1753, itemsBought: 493, itemsLeft: 1260, itemsBoughtBefore: 547 },
          { name: "Grade 11 hinge", itemsAdded: 340, itemsBought: 20, itemsLeft: 320, itemsBoughtBefore: 22 },
          { name: "Fixed pin hinge", itemsAdded: 200, itemsBought: 200, itemsLeft: 0, itemsBoughtBefore: 190 },
          { name: "Waltz knob 25mm", itemsAdded: 619, itemsBought: 188, itemsLeft: 431, itemsBoughtBefore: 250 },
        ],
      },
    }, "googleAnalytics.products");
    const said = pageFindings("googleAnalytics.products", data).map(findingWords);
    expect(said).toContain("Of the visits that did Added to basket, 24.2% went on to Purchase, against 24.4% the span before.");
    expect(said).toContain("Added but not bought holds 37.6% of the list's products added to baskets.");
    expect(said.some((line) => line.startsWith("Grade 11 hinge: of the items added were left in baskets 94.1%, against"))).toBe(true);
  });
});

