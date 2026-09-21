import { describe, expect, test } from "vitest";
import { collectUrls } from "./apifyActors";

describe("apify actors", () => {

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
