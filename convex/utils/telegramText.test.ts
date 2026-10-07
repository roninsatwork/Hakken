import { describe, expect, it } from "vitest";
import { linkCodeOf, telegramHtml } from "./telegramText";

/** An answer's words in Telegram (hakken-tasks-plan.md, item 6.1). */
describe("words for Telegram", () => {
  it("turns an answer's Markdown into the HTML Telegram reads, links made whole", () => {
    const answer = "### What changed\n\nIt had **7 visitors** on [Monday](/app/search-console/s1).\n\n{{chart}}\n\n- One\n- Two `code`\n\n---\n\nSee <this> & that.";
    expect(telegramHtml(answer, "https://app.example")).toBe(
      "<b>What changed</b>\n\nIt had <b>7 visitors</b> on <a href=\"https://app.example/app/search-console/s1\">Monday</a>.\n\n• One\n• Two <code>code</code>\n\nSee &lt;this&gt; &amp; that.",
    );
  });

  it("drops a link it cannot open safely, keeping its words", () => {
    expect(telegramHtml("[click](javascript:alert(1))", "https://app.example")).toBe("click");
  });

  it("keeps to Telegram's longest message", () => {
    expect(telegramHtml("a".repeat(5000), "https://app.example")).toHaveLength(4096);
  });

  it("reads a linking code as people type it", () => {
    expect([linkCodeOf("482 913"), linkCodeOf("482913"), linkCodeOf("why?"), linkCodeOf("12345")]).toEqual(["482913", "482913", null, null]);
  });
});
