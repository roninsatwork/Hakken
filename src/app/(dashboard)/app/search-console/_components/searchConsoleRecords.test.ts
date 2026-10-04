import { describe, expect, it } from "vitest";
import { pageLabel } from "./searchConsoleRecords";

/**
 * A page's address as the tables write it. Google reports a link to a section
 * of a page as a page of its own, so the section stays in the label — without
 * it, seven rows read as seven copies of one page (2026-10-04 audit).
 */
describe("a page's label", () => {
  it("is its path on the website's own host, the host too on any other", () => {
    expect(pageLabel("https://www.acme-shop.test/hub/web-apps/", "acme-shop.test")).toBe("/hub/web-apps/");
    expect(pageLabel("https://blog.acme-shop.test/post/", "acme-shop.test")).toBe("blog.acme-shop.test/post/");
  });

  it("keeps the section it links to, readable", () => {
    expect(pageLabel("https://www.acme-shop.test/hub/web-apps/#types-and-uses", "acme-shop.test")).toBe("/hub/web-apps/#types-and-uses");
    expect(pageLabel("https://www.acme-shop.test/hub/#caf%C3%A9-menu", "acme-shop.test")).toBe("/hub/#café-menu");
  });
});
