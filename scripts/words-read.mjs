// npm run words:read: a fresh reader for new words (docs/developer/writing-guide.md, "A fresh reader").
//
// The checks catch what a machine can. They can't tell whether a line copies the redone screens, or whether it sounds
// like a person talking. In about ten sessions from 17 November 2026 Anthony asked "have you forgotten the language
// style and reading age" after the first publish, every check having passed. On 21 November the Features canvas
// reached him with "Has what's ticked here, unless you switch it off there." So before new words reach him, a helper
// that didn't write them reads every line against the redone screens' words, and signs them off here.
//
//   node scripts/words-read.mjs packet <board.dc.html | canvas.json>...      a canvas's words, for a reader
//   node scripts/words-read.mjs packet --keys <key,key> | --session <id>     new screen lines in messages/en.json
//   node scripts/words-read.mjs sign <packet> [--fault <n> "what's wrong"]...  the reader signs a packet off
//   node scripts/words-read.mjs redone [googleAnalytics | searchConsole]      every redone screen's lines, to copy
//
// What has been read is kept by each line's words, in the repository's git folder (hakken-words/read.json), so every
// worktree shares it and a line read once is read for good. The words hook (scripts/words-hook.mjs, run from
// .claude/settings.json) refuses a canvas publish, and the end of a turn, while a new line is unread.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tableCellWords } from "./check-drawing.mjs";
import { messagesOf } from "./check-reading-age.mjs";
import { drawingLines, readOut } from "./reading-age.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** The reading age to aim for. The redone screens average about this (scripts/reading-age.mjs measures it). */
export const AIM_READING_AGE = 8;
/** The redone screens' lines a brief shows. Enough to hear how they talk, short enough to read. */
export const SAMPLE_SIZE = 24;
/** The sections the redone screens belong to, as `messages/en.json` names them. */
export const SECTIONS = ["googleAnalytics", "searchConsole"];
/** Kinds of note on a canvas that are drawn, not written. */
const DRAWN = new Set(["rect", "oval", "pen", "line", "arrow", "image"]);
/** The key endings a brief samples: the lines that name and explain things, where house style shows most. */
const SAMPLED = /(?:title|hint|description|empty|subtitle|lede|note|caption|help|intro|label|none|nothing)$/i;

// ─── The redone screens ──────────────────────────────────────────────────────────────────────────────────────────────

/** The redone screens' namespaces, read from the writing guide's table, so a screen added there counts here too. */
export function redoneNamespaces(guide) {
  const table = guide.slice(guide.indexOf("## The standard is the redone screens"), guide.indexOf("## The checklist"));
  return [...new Set([...table.matchAll(/`((?:[A-Za-z]+)\.[A-Za-z.]+)`/g)].map((match) => match[1]))];
}

/** Every line on a redone screen, as `[key, words]`. */
export function redoneLines(messages, namespaces) {
  return [...messagesOf(messages)].filter(([key]) => namespaces.some((space) => key === space || key.startsWith(`${space}.`)));
}

/** The section some words or keys belong to, or null when they could be either or neither. */
export function sectionOf({ keys = [], text = "" }) {
  const fromKeys = new Set(keys.map((key) => key.split(".")[0]).filter((first) => SECTIONS.includes(first)));
  if (fromKeys.size === 1) return [...fromKeys][0];
  const sc = (text.match(/Search Console/g) ?? []).length;
  const ga = (text.match(/Google Analytics/g) ?? []).length;
  if (sc > ga) return "searchConsole";
  if (ga > sc) return "googleAnalytics";
  return null;
}

/** A short spread of the redone screens' own lines, from one section when it's known: titles, hints and empty pages. */
export function sampleRedone(lines, { section = null, count = SAMPLE_SIZE } = {}) {
  const wanted = lines.filter(([key]) => !section || key.startsWith(`${section}.`));
  const byScreen = new Map();
  const seen = new Set();
  for (const [key, message] of wanted) {
    // As written, with its holes ("{count} each month"). A plural or a choice reads badly written out, so it's left out.
    if (/,\s*(?:plural|select|selectordinal)\s*,/.test(message)) continue;
    const words = message.trim();
    const size = (readOut(words).match(/[A-Za-z']+/g) ?? []).length;
    if (!SAMPLED.test(key) || size < 2 || size > 16 || seen.has(words)) continue;
    seen.add(words);
    const screen = key.split(".").slice(0, 2).join(".");
    byScreen.set(screen, [...(byScreen.get(screen) ?? []), [key, words]]);
  }
  // A line from each screen in turn, so one big screen doesn't fill the sample.
  const picked = [];
  for (let round = 0; picked.length < count && [...byScreen.values()].some((list) => list.length > round); round += 1) {
    for (const list of byScreen.values()) if (list[round] && picked.length < count) picked.push(list[round]);
  }
  return picked;
}

/** The writing guide's checklist, as its rules' first sentences. */
export function checklistOf(guide) {
  const at = guide.indexOf("## The checklist");
  const section = guide.slice(at, guide.indexOf("\n## ", at + 1));
  return [...section.matchAll(/^(?:\d+\.|-)\s+\*\*(.+?)\*\*/gm)].map((match) => match[1]);
}

// ─── The words on a canvas ───────────────────────────────────────────────────────────────────────────────────────────

const decode = (text) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, " ").trim();
/** Words worth a read: two letters or more once a canvas's holes (`{{rows.r3.tracked}}`) are taken out, and not an address alone. */
const readable = (line) => /[A-Za-z]{2}/.test(line.replace(/\{\{[^}]*\}\}/g, " ")) && !/^\S*[@/]\S*$|^\S+\.[a-z]{2,}\S*$/.test(line);
const unique = (lines) => [...new Set(lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(readable))];

/**
 * The words a board shows a person: its lines, a table's cells but its name column, its menus' choices and its words
 * on hover. A table's name column is the website's own words, a page's title as the website wrote it. A board copied
 * from the app is today's page, so it has nothing new.
 */
export function boardWords(html) {
  if (/<!--\s*copied-from-app/.test(html)) return [];
  const page = html.replace(/<head\b[\s\S]*?<\/head>/g, "\n");
  const ours = page.replace(/<tbody\b[\s\S]*?<\/tbody>/g, "\n");
  const lines = [...drawingLines(ours), ...tableCellWords(page)];
  for (const option of ours.matchAll(/<option\b[^>]*>([^<]*)<\/option>/g)) lines.push(decode(option[1]));
  for (const hover of ours.matchAll(/\s(?:title|placeholder)="([^"]*)"/g)) lines.push(decode(hover[1]));
  return unique(lines);
}

/** The words of a canvas's notes, a paragraph each, and its boards' titles. */
export function noteWords(index) {
  const lines = [];
  if (typeof index.title === "string") lines.push(index.title);
  for (const board of Object.values(index.boards ?? {})) if (typeof board.title === "string") lines.push(board.title);
  for (const note of Object.values(index.notes ?? {})) {
    if (DRAWN.has(note.kind) || typeof note.text !== "string") continue;
    lines.push(...note.text.split(/\n+/));
  }
  return unique(lines);
}

/** What a canvas says it's about, in its title, its heading and its boards' titles, to tell which section it's for. */
export function canvasAbout(files) {
  return files.filter((file) => file.endsWith(".json")).map((file) => {
    const index = JSON.parse(readFileSync(file, "utf8"));
    const titles = [index.title, ...Object.values(index.boards ?? {}).map((board) => board.title), ...Object.values(index.notes ?? {}).filter((note) => note.kind === "title1").map((note) => note.text)];
    return titles.filter((title) => typeof title === "string").join("\n");
  }).join("\n");
}

/** The words in some boards and canvas.json files on disk. */
export function canvasWords(files) {
  return unique(files.flatMap((file) => (file.endsWith(".json") ? noteWords(JSON.parse(readFileSync(file, "utf8"))) : boardWords(readFileSync(file, "utf8")))));
}

// ─── What has been read ──────────────────────────────────────────────────────────────────────────────────────────────

/** Where reads are kept: the repository's git folder, which every worktree shares. */
export function wordsHome(root = ROOT) {
  if (process.env.HAKKEN_WORDS_HOME) return process.env.HAKKEN_WORDS_HOME;
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return path.join(path.resolve(root, common), "hakken-words");
  } catch {
    return path.join(os.tmpdir(), "hakken-words");
  }
}

/** A line's fingerprint: its words, whatever screen or board they're on. */
export function fingerprint(line) {
  return createHash("sha1").update(line.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
}

export function loadReads(home = wordsHome()) {
  const file = path.join(home, "read.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { lines: {} };
}

export function saveReads(reads, home = wordsHome()) {
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, "read.json"), `${JSON.stringify(reads, null, 1)}\n`);
}

/**
 * Every line the app already shows, as written and as read out. A board's line that's one of these is today's words,
 * like a board copied from the app, so it isn't new and needs no read: the menu's "Dashboard", a redone screen's title.
 */
export function appWords(root = ROOT) {
  const messages = JSON.parse(readFileSync(path.join(root, "messages/en.json"), "utf8"));
  const known = new Set();
  for (const [, message] of messagesOf(messages)) {
    known.add(message.replace(/\s+/g, " ").trim());
    known.add(readOut(message).replace(/\s+/g, " ").trim());
  }
  return known;
}

/** Every line on a redone screen. A new screen line that copies one word for word needs no read. */
export function redoneWords(root = ROOT) {
  const guide = readFileSync(path.join(root, "docs/developer/writing-guide.md"), "utf8");
  const messages = JSON.parse(readFileSync(path.join(root, "messages/en.json"), "utf8"));
  return new Set(redoneLines(messages, redoneNamespaces(guide)).map(([, message]) => message.replace(/\s+/g, " ").trim()));
}

/** Where each line stands: not read yet, read with faults the reader found, or read and fine. A line in `known` is fine. */
export function standing(lines, reads, known = new Set()) {
  const unread = [];
  const faulted = [];
  const fine = [];
  for (const line of lines) {
    const read = reads.lines[fingerprint(line)];
    if (!read && known.has(line)) fine.push(line);
    else if (!read) unread.push(line);
    else if (read.faults.length > 0) faulted.push({ line, faults: read.faults });
    else fine.push(line);
  }
  return { unread, faulted, fine };
}

/** A reader's verdict on a packet: every numbered line read, the faulted ones with what's wrong. */
export function sign(reads, packet, faults, at = new Date().toISOString()) {
  for (const number of Object.keys(faults)) {
    if (!packet.lines[Number(number) - 1]) throw new Error(`The packet has no line ${number}. It has lines 1 to ${packet.lines.length}.`);
  }
  const next = { lines: { ...reads.lines } };
  packet.lines.forEach((line, index) => {
    const fault = faults[index + 1];
    next.lines[fingerprint(line)] = { faults: fault ? [fault] : [], at };
  });
  return next;
}

// ─── The packet a reader gets ────────────────────────────────────────────────────────────────────────────────────────

/** The packet's words, for a reader who didn't write them. */
export function packetText({ id, lines, context = [], keys = [], checklist, sample, section }) {
  const where = section === "searchConsole" ? "Search Console" : section === "googleAnalytics" ? "Google Analytics" : "Google Analytics and Search Console";
  return [
    "# Words for a fresh reader",
    "",
    "You didn't write these words. Anthony will read every one of them, so read them the way he will.",
    "He wants every line to sound like a helpful person talking. He wants it short, plain and easy to understand.",
    `The standard is the screens he has redone, line by line. Here, that's ${where}.`,
    "",
    "## The rules",
    "",
    ...checklist.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    `Aim for a reading age of about ${AIM_READING_AGE}. Measure a line with \`node scripts/words-read.mjs age "the line"\`.`,
    "",
    "## How the redone screens say things",
    "",
    ...sample.map(([key, words]) => `- "${words}" (${key})`),
    "",
    `Every redone line, with its key: \`node scripts/words-read.mjs redone${section ? ` ${section}` : ""}\`. Search it for the thing a line is trying to say.`,
    "",
    "## The words to read",
    "",
    ...lines.map((line, index) => `${index + 1}. ${keys[index] ? `(${keys[index]}) ` : ""}${line}`),
    ...(context.length > 0 ? ["", "## Already read, here so you can see them together", "", ...context.map((line) => `- ${line}`)] : []),
    "",
    "## What to look for",
    "",
    "- A word or a phrase the redone screens say another way. Give the redone line it should copy, with its key.",
    "- A line that sounds like a report or a spreadsheet when you read it out loud.",
    "- A word that points at nothing. \"Here\", \"there\", \"one\", \"it\", \"their\" or \"the websites\", when the line never says which.",
    "- A verb that doesn't match its control, like \"untick\" under a column called Switched on.",
    "- One thing with two names, like \"None\" in one place and \"Off for everyone\" in another.",
    "- A line that doesn't match its section, or sits under the wrong step.",
    "- A promise the screen can't keep, like \"press a row\" on a row that opens nothing.",
    "- The same point made twice, across a description, a strip and a note.",
    "- An em dash anywhere, or a comma before the \"and\" or \"or\" that ends a list.",
    "",
    "## When you've read them all",
    "",
    "Sign the packet off. Name each line with a fault. Say what's wrong in plain words, then give a better line after an arrow.",
    "",
    `    node scripts/words-read.mjs sign ${id} --fault 3 "It says showings, and the redone screens say impressions → Impressions each day" --fault 7 "..."`,
    "",
    `With no faults at all, run \`node scripts/words-read.mjs sign ${id}\`.`,
    "Then end your reply with one line for each numbered line, as `3 OK` or `3 FAULT what's wrong → a better line (reading age 6)`.",
    "Don't change any other file.",
    "",
  ].join("\n");
}

/** Write a packet for some lines and say what to do with it. Null when every line has been read. */
export function makePacket(lines, { keys = [], context = [], sectionText = "", home = wordsHome(), root = ROOT } = {}) {
  if (lines.length === 0) return null;
  const guide = readFileSync(path.join(root, "docs/developer/writing-guide.md"), "utf8");
  const messages = JSON.parse(readFileSync(path.join(root, "messages/en.json"), "utf8"));
  const section = sectionOf({ keys, text: sectionText });
  const sample = sampleRedone(redoneLines(messages, redoneNamespaces(guide)), { section });
  const id = fingerprint(lines.join("\n")).slice(0, 10);
  const dir = path.join(home, "packets");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  writeFileSync(file, packetText({ id, lines, context, keys, checklist: checklistOf(guide), sample, section }));
  writeFileSync(path.join(dir, `${id}.json`), `${JSON.stringify({ id, lines, keys }, null, 1)}\n`);
  return { id, file, prompt: `You're a fresh reader. Read ${file} and do what it says.` };
}

/**
 * The current words of some keys in a messages/en.json, as `[key, message]`, leaving out keys that have gone. A
 * worktree's session edits its own copy, so the file is the one that was edited, not always this checkout's.
 */
export function linesOfKeys(keys, file = path.join(ROOT, "messages/en.json")) {
  const messages = JSON.parse(readFileSync(file, "utf8"));
  const all = new Map(messagesOf(messages));
  return [...new Set(keys)].filter((key) => all.has(key)).map((key) => [key, all.get(key)]);
}

// ─── The command ─────────────────────────────────────────────────────────────────────────────────────────────────────

function packetCommand(args) {
  const home = wordsHome();
  const reads = loadReads(home);
  let lines;
  let keys = [];
  let context = [];
  const keyAt = args.indexOf("--keys");
  const sessionAt = args.indexOf("--session");
  if (keyAt >= 0 || sessionAt >= 0) {
    const session = sessionAt >= 0 ? JSON.parse(readFileSync(path.join(home, "sessions", `${args[sessionAt + 1]}.json`), "utf8")) : {};
    const wanted = keyAt >= 0 ? args[keyAt + 1].split(",") : session.keys ?? [];
    const copied = redoneWords();
    const unread = linesOfKeys(wanted, session.messagesFile ?? undefined).filter(([, message]) => !reads.lines[fingerprint(message)] && !copied.has(message.replace(/\s+/g, " ").trim()));
    keys = unread.map(([key]) => key);
    lines = unread.map(([, message]) => message);
  } else {
    const known = appWords();
    const { unread, faulted, fine } = standing(canvasWords(args), reads, known);
    lines = unread;
    context = [...fine.filter((line) => !known.has(line)), ...faulted.map(({ line }) => line)];
  }
  const packet = makePacket(lines, { keys, context, sectionText: keys.length > 0 ? "" : canvasAbout(args), home });
  if (!packet) {
    console.log("Every line here has had a fresh read.");
    return;
  }
  console.log(`${lines.length} ${lines.length === 1 ? "line" : "lines"} to read. The packet is ${packet.file}.`);
  console.log("Start a helper agent that didn't write these words, with this prompt:");
  console.log(`  ${packet.prompt}`);
}

function signCommand([id, ...rest]) {
  const home = wordsHome();
  const file = path.join(home, "packets", `${id}.json`);
  if (!id || !existsSync(file)) {
    console.error(`No packet called ${id}. Make one with: node scripts/words-read.mjs packet ...`);
    process.exit(2);
  }
  const faults = {};
  for (let at = 0; at < rest.length; at += 1) {
    if (rest[at] !== "--fault") continue;
    faults[rest[at + 1]] = rest[at + 2];
    at += 2;
  }
  const packet = JSON.parse(readFileSync(file, "utf8"));
  saveReads(sign(loadReads(home), packet, faults), home);
  const count = Object.keys(faults).length;
  console.log(`Signed off ${packet.lines.length} ${packet.lines.length === 1 ? "line" : "lines"}. ${count === 0 ? "No faults." : `${count} ${count === 1 ? "has a fault" : "have faults"} to fix.`}`);
}

async function main([command, ...args]) {
  if (command === "packet") return packetCommand(args);
  if (command === "sign") return signCommand(args);
  if (command === "redone") {
    const guide = readFileSync(path.join(ROOT, "docs/developer/writing-guide.md"), "utf8");
    const messages = JSON.parse(readFileSync(path.join(ROOT, "messages/en.json"), "utf8"));
    for (const [key, message] of redoneLines(messages, redoneNamespaces(guide))) if (!args[0] || key.startsWith(`${args[0]}.`)) console.log(`${key}: ${message}`);
    return;
  }
  if (command === "age") {
    const { readingAge } = await import("./reading-age.mjs");
    const age = readingAge(args.join(" "));
    console.log(age === null ? "Nothing to read." : `Reading age ${age.toFixed(1)}. Aim for about ${AIM_READING_AGE}, and never over 14.`);
    return;
  }
  console.error("Usage: node scripts/words-read.mjs packet <files>... | packet --keys <a,b> | sign <packet> [--fault <n> \"...\"]... | redone [section] | age \"words\"");
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main(process.argv.slice(2));
