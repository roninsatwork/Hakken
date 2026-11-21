import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import { AI_MENU_GROUPS, AI_MENU_PAGES, AI_PATHS, aiPageForPath, isAiRecordPath } from "./aiMenu";

/**
 * The Artificial Intelligence section's menu down the left
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S0 and S2): every screen the old
 * tabs and drop-downs reached, Tools and Tool servers from the admin menu, the
 * wiki's map as a line of its own, and the four pages the wiki's long page
 * became (S6).
 */
describe("the AI menu", () => {
  it("keeps every page the old tabs, drop-downs and admin menu reached", () => {
    const hrefs = AI_MENU_PAGES.map((page) => page.href);
    for (const href of [
      "/admin/ai/usage/costs",
      "/admin/ai/money",
      "/admin/ai/usage/chat-logs",
      "/admin/ai/skills",
      "/admin/ai/rules",
      "/admin/ai/system-prompt",
      "/admin/ai/knowledge",
      "/admin/ai/voice",
      "/admin/ai/unanswered",
      "/admin/ai/diary",
      "/admin/ai/decisions",
      "/admin/ai/evals",
      "/admin/ai/models/providers",
      "/admin/ai/models/catalogue",
      "/admin/ai/models/defaults",
      "/admin/ai/widget",
      "/admin/ai/widget?section=welcome-screen",
      "/admin/ai/widget?section=conversation-starters",
      "/admin/ai/widget?section=greeting",
      "/admin/ai/widget?section=integration",
      "/admin/ai/tools",
      "/admin/ai/tool-servers",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("gives the wiki's map and its four own pages a line each, beside the wiki's pages", () => {
    const knows = AI_MENU_PAGES.filter((page) => page.group === "knows").map((page) => [page.id, page.href]);
    expect(knows).toEqual([
      ["wiki", "/admin/ai/knowledge"],
      ["wikiMap", "/admin/ai/knowledge/map"],
      ["wikiAdd", "/admin/ai/knowledge/add"],
      ["wikiWaiting", "/admin/ai/knowledge/waiting"],
      ["wikiAsk", "/admin/ai/knowledge/ask"],
      ["wikiCheckup", "/admin/ai/knowledge/checkup"],
      ["diary", "/admin/ai/diary"],
    ]);
  });

  it("puts every line in a group, with no line twice", () => {
    const ids = AI_MENU_PAGES.map((page) => page.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of AI_MENU_GROUPS) {
      expect(AI_MENU_PAGES.some((page) => page.group === group)).toBe(true);
    }
  });

  // Italian is held to the same keys by src/translation-parity-drift.test.ts.
  it("has words for every group and line", () => {
    const menu: Record<string, unknown> = en.ai.menu;
    const groups: Record<string, string> = en.ai.menu.groups;
    for (const group of AI_MENU_GROUPS) expect(groups[group]).toBeTruthy();
    for (const page of AI_MENU_PAGES) expect(menu[page.id]).toBeTruthy();
  });

  it.each([
    ["/admin/ai", null, "costs"],
    ["/admin/ai/usage/costs", null, "costs"],
    ["/admin/ai/costs", null, "costs"],
    ["/admin/ai/chat-logs", null, "chatLogs"],
    ["/admin/ai/knowledge", null, "wiki"],
    ["/admin/ai/knowledge/page123", null, "wiki"],
    ["/admin/ai/global-knowledge", null, "wiki"],
    ["/admin/ai/knowledge/map", null, "wikiMap"],
    ["/admin/ai/knowledge/add", null, "wikiAdd"],
    ["/admin/ai/knowledge/waiting", null, "wikiWaiting"],
    ["/admin/ai/knowledge/ask", null, "wikiAsk"],
    ["/admin/ai/knowledge/checkup", null, "wikiCheckup"],
    ["/admin/ai/knowledge/new-goal", null, "wiki"],
    ["/admin/ai/rules/rule123", null, "rules"],
    ["/admin/ai/evals/new", null, "evals"],
    ["/admin/ai/models", null, "modelCatalogue"],
    ["/admin/ai/models/model123", null, "modelCatalogue"],
    ["/admin/ai/models/defaults", null, "defaults"],
    ["/admin/ai/models/providers", null, "providers"],
    ["/admin/ai/tools/connectors/gmail", null, "tools"],
    ["/admin/ai/tool-servers", null, "toolServers"],
    ["/admin/ai/widget", null, "appearance"],
    ["/admin/ai/widget", "integration", "integration"],
    ["/admin/ai/widget", "nonsense", "appearance"],
    ["/admin/companies/company123/ai", null, null],
  ])("lights the right line on %s (section %s)", (pathname, section, id) => {
    expect(aiPageForPath(pathname, section)).toBe(id);
  });

  it.each([
    ["/admin/ai/usage/costs", false],
    ["/admin/ai/knowledge", false],
    ["/admin/ai/knowledge/map", false],
    ["/admin/ai/knowledge/add", false],
    ["/admin/ai/knowledge/waiting", false],
    ["/admin/ai/knowledge/ask", false],
    ["/admin/ai/knowledge/checkup", false],
    ["/admin/ai/knowledge/new-goal", true],
    ["/admin/ai/knowledge/address", true],
    ["/admin/ai/models/catalogue", false],
    ["/admin/ai/tools", false],
    ["/admin/ai/widget", false],
    ["/admin/ai/rules/rule123", true],
    ["/admin/ai/rules/new", true],
    ["/admin/ai/evals/eval123/edit", true],
    ["/admin/ai/decisions/wiki.merge", true],
    ["/admin/ai/knowledge/page123", true],
    ["/admin/ai/models/model123", true],
    ["/admin/ai/tools/new", true],
    ["/admin/ai/tools/connectors/gmail", true],
  ])("treats %s as a record page: %s", (pathname, record) => {
    expect(isAiRecordPath(pathname)).toBe(record);
  });

  it("spells the wiki's addresses once, under the wiki's own", () => {
    expect(AI_PATHS.wikiMap).toBe(`${AI_PATHS.wiki}/map`);
    for (const path of [AI_PATHS.wikiAdd, AI_PATHS.wikiWaiting, AI_PATHS.wikiAsk, AI_PATHS.wikiCheckup, AI_PATHS.wikiNewGoal]) {
      expect(path.startsWith(`${AI_PATHS.wiki}/`)).toBe(true);
    }
  });
});
