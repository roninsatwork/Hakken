import { describe, expect, test } from "vitest";
import { collectUrls } from "./apifyActors";
// template:remove:start properties
import { RIGHTMOVE_ACTOR_ID, producesPropertyListings } from "./apifyActors";
// template:remove:end

describe("apify actors", () => {
// template:remove:start properties
  test("only the Rightmove scraper's results are read as property listings", () => {
    // The generic Apify tool lets an agent start any job an admin has set up.
    // Their results have shapes this platform has never seen, and writing them
    // into the properties table would invent records out of whichever fields
    // happened to line up — a fabricated property looks exactly like a real one.
    expect(producesPropertyListings(RIGHTMOVE_ACTOR_ID)).toBe(true);
    expect(producesPropertyListings("some_other_actor")).toBe(false);
    expect(producesPropertyListings(undefined)).toBe(false);
  });
// template:remove:end

  test("finds every address in a job's settings, however deeply it is buried", () => {
    // The agent chooses both the job and its settings, and each job has its own
    // shape, so there is no known field to check. Anything missed here is an
    // address that reaches the internet without being checked first.
    expect(
      collectUrls({
        startUrls: [{ url: "https://example.com/a" }],
        proxy: { nested: { deeper: ["http://169.254.169.254/latest"] } },
        maxItems: 5,
        note: "not a url",
        empty: null,
      })
    ).toEqual(["https://example.com/a", "http://169.254.169.254/latest"]);
  });

  test("ignores things that only look like addresses", () => {
    expect(collectUrls({ scheme: "ftp://example.com", text: "visit example.com" })).toEqual([]);
  });
});
