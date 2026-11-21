import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  appWords,
  boardWords,
  checklistOf,
  fingerprint,
  makePacket,
  noteWords,
  redoneLines,
  redoneNamespaces,
  sampleRedone,
  sectionOf,
  sign,
  standing,
} from "./words-read.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const guide = readFileSync(path.join(ROOT, "docs/developer/writing-guide.md"), "utf8");
const messages = JSON.parse(readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));

describe("the redone screens", () => {
  test("come from the writing guide's table, so a screen added there counts here too", () => {
    const spaces = redoneNamespaces(guide);
    expect(spaces).toContain("searchConsole.performance");
    expect(spaces).toContain("googleAnalytics.allPages");
    expect(spaces.every((space) => /^(googleAnalytics|searchConsole)\./.test(space))).toBe(true);
  });

  test("every namespace in the table has lines in messages/en.json", () => {
    for (const space of redoneNamespaces(guide)) expect(redoneLines(messages, [space]).length, space).toBeGreaterThan(0);
  });

  test("a brief's sample takes a line from each screen in turn, as written, from one section when it's known", () => {
    const sample = sampleRedone(redoneLines(messages, redoneNamespaces(guide)), { section: "searchConsole", count: 10 });
    expect(sample).toHaveLength(10);
    expect(sample.every(([key]) => key.startsWith("searchConsole."))).toBe(true);
    expect(new Set(sample.map(([key]) => key.split(".").slice(0, 2).join("."))).size).toBe(10);
    expect(sample.every(([, words]) => !/plural,|select,/.test(words))).toBe(true);
  });

  test("the section is told by keys first, then by which tool a canvas's titles name", () => {
    expect(sectionOf({ keys: ["searchConsole.pages.title"] })).toBe("searchConsole");
    expect(sectionOf({ keys: ["searchConsole.pages.title", "googleAnalytics.live.title"] })).toBe(null);
    expect(sectionOf({ text: "Google Analytics, Funnel, three ways" })).toBe("googleAnalytics");
    expect(sectionOf({ text: "System Settings, Features" })).toBe(null);
  });

  test("the checklist is the guide's own rules, em dashes and Oxford commas among them", () => {
    const rules = checklistOf(guide);
    expect(rules[0]).toBe("One idea a sentence.");
    expect(rules.some((rule) => /em dash/i.test(rule))).toBe(true);
    expect(rules.some((rule) => /Copy the redone screens/.test(rule))).toBe(true);
  });
});

describe("the words on a canvas", () => {
  test("a board's lines, menu choices and hover words, but not a table's rows or the page's title", () => {
    const html = `<head><title>Board name</title></head><div><h2>Visits each day</h2><p title="Impressions">Shown</p>
      <select aria-label="Compare with"><option>September</option><option>No comparison</option></select>
      <table><thead><tr><th>Page</th></tr></thead><tbody><tr><td>Door handles - our blog</td></tr></tbody></table>
      <span>{{rows.r1.clicks}}</span><span>1,204</span><span>anthony@example.com</span></div>`;
    expect(boardWords(html)).toEqual(["Visits each day", "Shown", "Page", "September", "No comparison", "Impressions"]);
  });

  test("a table's cells are read, but not its name column, which holds the website's own words", () => {
    const html = `<table><thead><tr><th>Feature</th><th>What it does</th></tr></thead>
      <tbody><tr><td>Door handles - our blog</td><td>Every call to the phone line.</td></tr></tbody></table>`;
    expect(boardWords(html)).toEqual(["Feature", "What it does", "Every call to the phone line."]);
  });

  test("a board copied from the app is today's words, so there is nothing new to read", () => {
    expect(boardWords("<head><!-- copied-from-app --></head><p>Every place visits came from</p>")).toEqual([]);
  });

  test("a canvas's notes, a paragraph each, with its title and its boards' titles, but not drawn shapes", () => {
    const index = {
      title: "Features, three ways",
      boards: { "Main.dc.html": { title: "1 · Today" } },
      notes: { a: { text: "One line.\n\nAnother line." }, b: { kind: "rect", text: "a box" }, c: { kind: "title1", text: "Features" } },
    };
    expect(noteWords(index)).toEqual(["Features, three ways", "1 · Today", "One line.", "Another line.", "Features"]);
  });
});

describe("what has been read", () => {
  const packet = { id: "p1", lines: ["Visits each day", "Has what's ticked here, unless you switch it off there."] };

  test("a reader's sign-off marks every line read, and the faulted ones with what's wrong", () => {
    const reads = sign({ lines: {} }, packet, { 2: "Here and there point at nothing. Name the page." }, "2026-11-21");
    expect(reads.lines[fingerprint("Visits each day")]).toEqual({ faults: [], at: "2026-11-21" });
    expect(reads.lines[fingerprint(packet.lines[1])].faults).toEqual(["Here and there point at nothing. Name the page."]);
  });

  test("a fault on a line the packet doesn't have is refused", () => {
    expect(() => sign({ lines: {} }, packet, { 9: "no such line" })).toThrow(/no line 9/);
  });

  test("each line stands unread, faulted or fine, and a line the app already shows is fine", () => {
    const reads = sign({ lines: {} }, packet, { 2: "Name the page." });
    const { unread, faulted, fine } = standing(["Visits each day", packet.lines[1], "A new line", "Dashboard"], reads, new Set(["Dashboard"]));
    expect(unread).toEqual(["A new line"]);
    expect(faulted).toEqual([{ line: packet.lines[1], faults: ["Name the page."] }]);
    expect(fine).toEqual(["Visits each day", "Dashboard"]);
  });

  test("a line is known by its words, wherever it is, and spaces don't change it", () => {
    expect(fingerprint("Visits  each day ")).toBe(fingerprint("Visits each day"));
    expect(fingerprint("Visits each day")).not.toBe(fingerprint("Visitors each day"));
  });

  test("the app's words include the menu and the redone screens, as written and as read out", () => {
    const known = appWords(ROOT);
    expect(known.has("Dashboard")).toBe(true);
    expect(known.has(messages.searchConsole.lowCtr.title)).toBe(true);
  });
});

describe("a packet for a reader", () => {
  test("numbers the lines to read, shows the redone lines and the rules, and says how to sign it off", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "words-read-"));
    const packet = makePacket(["Has what's ticked here, unless you switch it off there."], { sectionText: "Search Console, Pages", home, root: ROOT });
    const text = readFileSync(packet.file, "utf8");
    expect(text).toContain("1. Has what's ticked here, unless you switch it off there.");
    expect(text).toContain("searchConsole.");
    expect(text).toContain("One idea a sentence.");
    expect(text).toContain(`node scripts/words-read.mjs sign ${packet.id}`);
    expect(text).not.toMatch(/\w—\w|\w — \w/);
    expect(packet.prompt).toBe(`You're a fresh reader. Read ${packet.file} and do what it says.`);
    expect(JSON.parse(readFileSync(packet.file.replace(/\.md$/, ".json"), "utf8")).lines).toHaveLength(1);
  });

  test("there is no packet when every line has been read", () => {
    expect(makePacket([], { home: os.tmpdir(), root: ROOT })).toBeNull();
  });
});
