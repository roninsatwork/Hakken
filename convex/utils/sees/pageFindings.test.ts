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
    // A product new this month is a mover; the biggest fall among the ten; said once though the table holds them too.
    expect(words).toEqual([
      "Eclipse 1838 steel butt hinge, 102mm: items bought rose to 200 from 0, the biggest rise on the list.",
      "Frelan 5mm plain spindle: items bought fell to 2 from 106, the biggest fall on the list.",
      "Waltz round cupboard knob, antique brass, 25mm: items bought fell to 188 from 250, the biggest fall on the list.",
    ]);
    // Ten products, or a table's first page, picked from the whole list: never "holds most of the list".
    expect(words.some((line) => line.includes(" holds "))).toBe(false);
    // The boxes moved under a sixth: nothing to say of them. A sixth or more is said, as the boxes name it.
    const fewer = pageFindings("googleAnalytics.products", { boxes: { ...page.boxes, productsNeverBought: 620 } }).map(findingWords);
    expect(fewer).toEqual(["Products added but never bought fell to 620 from 970 the span before."]);
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
    const found = pageFindings("googleAnalytics.allPages", { rows: pages });
    expect(found.map(findingWords)).toEqual(["Waltz round knob holds 77.6% of the list's views."]);
    const quiet = pages.map((row) => (row.key === "~fu" ? { ...row, views: 10 } : row));
    expect(pageFindings("googleAnalytics.allPages", { rows: quiet }).map((finding) => finding.params.name)).toEqual(["https://shop.test/returns"]);
    expect(pageFindings("googleAnalytics.allPages", { rows: [{ key: "~1", views: 9 }, { key: "~2", views: 5 }, { key: "~3", views: 3 }, { key: "~4", views: 1 }] })).toEqual([]);
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
    expect(pageFindings("googleAnalytics.channelsPage", { channelsTable: { rows: channels } }).map(findingWords)).toEqual(["Organic Search holds 67.5% of the list's visits."]);
  });

  test("a share of a whole is set against its own reference, the whole website's, never the list's average; the mirror of it is said once", () => {
    // Seen on every page (2026-11-03): "tablet: share 2.8%, against 33.3% on average".
    const devices = [{ name: "mobile", viewsShare: 0.65, websiteViewsShare: 0.393 }, { name: "desktop", viewsShare: 0.322, websiteViewsShare: 0.577 }, { name: "tablet", viewsShare: 0.028, websiteViewsShare: 0.03 }];
    const words = pageFindings("googleAnalytics.page", pageDataFor({ devices }, "googleAnalytics.page")).map(findingWords);
    expect(words).toEqual(["mobile: share of views 65%, against 39.3% across the whole website."]);
    // With no reference, a share says nothing at all.
    const shares = devices.map(({ name, viewsShare }) => ({ name, share: viewsShare }));
    expect(pageFindings("googleAnalytics.overview", pageDataFor({ devices: shares }, "googleAnalytics.overview"))).toEqual([]);
    // Two genders: the gain is said, never its mirror as well.
    const genders = [{ name: "female", peopleShare: 0.213, websitePeopleShare: 0.475 }, { name: "male", peopleShare: 0.787, websitePeopleShare: 0.525 }];
    expect(pageFindings("googleAnalytics.page", pageDataFor({ genders }, "googleAnalytics.page")).map(findingWords)).toEqual(["male: share of people 78.7%, against 52.5% across the whole website."]);
  });

  test("the page's own boxes against the whole website and similar pages, past 100% where Google counts more than one a visit", () => {
    const boxes = { views: 456, viewsBefore: 456, visits: 86, visitsBefore: 73, websiteVisits: 35739, boughtRate: 0.07, websiteBoughtRate: 0.034, scrolledToBottomRate: 0.214, groupScrolledToBottomRate: 0.094 };
    const found = pageFindings("googleAnalytics.page", pageDataFor({ boxes }, "googleAnalytics.page"));
    expect(found.map(findingWords)).toEqual([
      "This page: scrolled to the bottom 21.4%, against 9.4% on similar pages.",
      "This page: visitors who bought 7%, against 3.4% across the whole website.",
      "Visits rose to 86 from 73 the span before.",
    ]);
    expect(found[0].params).toMatchObject({ whole: 1, against: "group" });
    // Too few visits to trust a rate on; too close to its reference to say.
    expect(pageFindings("googleAnalytics.page", pageDataFor({ boxes: { ...boxes, visits: 12, visitsBefore: 11 } }, "googleAnalytics.page"))).toEqual([]);
    expect(pageFindings("googleAnalytics.page", pageDataFor({ boxes: { visits: 400, boughtRate: 0.04, websiteBoughtRate: 0.034 } }, "googleAnalytics.page"))).toEqual([]);
  });

  test("totals three deep; a list of one or two read as totals, each by its name; lists inside a list's rows", () => {
    expect(pageFindings("googleAnalytics.overview", { figures: { now: { all: { visits: 900, visitsBefore: 600 } } } }).map(findingWords)).toEqual(["Visits rose to 900 from 600 the span before."]);
    // A Websites screen's one website.
    expect(pageFindings("googleAnalytics.websites", [{ host: "shop.test", visits: 400, visitsBefore: 800 }]).map(findingWords)).toEqual(["shop.test: Visits fell to 400 from 800 the span before."]);
    // An AI engine's websites, each engine a list of its own (Visibility's AI share of voice).
    const engines = [
      { engine: "chatgpt", asked: 20, sites: [{ host: "shop.test", named: 6 }, { host: "rival.test", named: 1 }, { host: "other.test", named: 1 }, { host: "fourth.test", named: 0 }] },
      { engine: "perplexity", asked: 20, sites: [{ host: "shop.test", named: 2 }, { host: "rival.test", named: 2 }, { host: "other.test", named: 2 }, { host: "fourth.test", named: 2 }] },
    ];
    expect(pageFindings("visibility.aiShare", engines).map(findingWords)).toEqual(["shop.test holds 75% of the list's AI answers naming it."]);
  });
});

