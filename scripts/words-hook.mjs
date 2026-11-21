// The words hook, run by Claude Code from .claude/settings.json (docs/developer/writing-guide.md, "The tool asks first").
//
// In about ten sessions from 17 November 2026 Anthony asked "have you forgotten the language style and reading age"
// after the first publish. Each agent had measured the reading age, but hadn't copied the redone screens' words before
// writing. Every guide and note already said to. The step was skipped before any check ran, and then a passing check
// read as done. So the tool now asks at the moment words are written, and again before they reach him.
//
// - The first time a session, or a helper it starts, writes a board (*.dc.html), a canvas.json or messages/en.json, or
//   runs the drawing kit, the write is stopped once with a brief. The brief holds the writing guide's checklist and
//   real lines from the redone screens, and asks for each new line to be set beside the redone line it copies.
// - After that, each write's new words are checked as they go in. A write that adds a fault is refused.
// - A canvas publish (the Artifact tool) runs check:drawing on every board and the notes. Then it waits until a fresh
//   reader has read every new line (scripts/words-read.mjs).
// - A turn that changed lines in messages/en.json can't end until a fresh reader has read them.
//
// It reads the hook's JSON on stdin and answers in the JSON Claude Code expects. A file it doesn't judge costs a quick
// look at the path and nothing more.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** A Bash command that starts or builds boards: the drawing kit, a copy from the app, or writing a board out. */
const BUILDS_BOARDS = /\bdrawing-kit\b|from-app\.mjs|copy-page\.js|build-boards|>>?\s*["']?[^\s"'|;&]*\.dc\.html/;

export const isBoard = (file) => /\.dc\.html$/.test(file);
export const isCanvas = (file) => /(?:^|[/\\])canvas\.json$/.test(file);
export const isMessages = (file) => /(?:^|[/\\])messages[/\\]en\.json$/.test(file);

// ─── What a write leaves behind ──────────────────────────────────────────────────────────────────────────────────────

/** A file's text once this Write or Edit is done, and its text before. */
export function afterWrite(tool, input, read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : "")) {
  const before = read(input.file_path);
  if (tool === "Write") return { before, after: input.content ?? "" };
  const edits = tool === "MultiEdit" ? input.edits ?? [] : [input];
  let after = before;
  for (const edit of edits) {
    if (!edit.old_string || !after.includes(edit.old_string)) continue;
    after = edit.replace_all ? after.split(edit.old_string).join(edit.new_string) : after.replace(edit.old_string, () => edit.new_string);
  }
  return { before, after };
}

/** The problems in `after` that weren't in `before`, so fixing one fault at a time is never refused for the rest. */
export function addedProblems(before, after) {
  const left = new Map();
  for (const problem of before) left.set(problem, (left.get(problem) ?? 0) + 1);
  return after.filter((problem) => {
    const count = left.get(problem) ?? 0;
    if (count === 0) return true;
    left.set(problem, count - 1);
    return false;
  });
}

/** The client lines a change to messages/en.json adds or rewords, as `[key, message]`. */
export async function changedLines(before, after) {
  const { ADMIN_ONLY, messagesOf } = await import("./check-reading-age.mjs");
  let old;
  let next;
  try {
    old = new Map(messagesOf(JSON.parse(before || "{}")));
    next = [...messagesOf(JSON.parse(after))];
  } catch {
    return []; // Not whole JSON yet. The checks judge it once it is.
  }
  return next.filter(([key, message]) => !ADMIN_ONLY.has(key.split(".")[0]) && old.get(key) !== message);
}

/** The faults in some client lines, leaving out what the frozen lists already hold (scripts/*-allowlist.json). */
export async function lineFaults(lines, root = ROOT) {
  const { readOut, readingAge, tooHard } = await import("./reading-age.mjs");
  const { styleFaults } = await import("./word-style.mjs");
  const frozenStyle = JSON.parse(readFileSync(path.join(root, "scripts/word-style-allowlist.json"), "utf8")).rules;
  const frozenAge = new Set(JSON.parse(readFileSync(path.join(root, "scripts/reading-age-allowlist.json"), "utf8")).lines);
  const faults = [];
  for (const [key, message] of lines) {
    const words = readOut(message);
    for (const { rule, fix } of styleFaults(words)) if (!(frozenStyle[rule] ?? []).includes(key)) faults.push(`${key}: ${fix}\n    "${words}"`);
    if (tooHard(words) && !frozenAge.has(key)) faults.push(`${key}: reading age ${readingAge(words).toFixed(1)}, and the most is 14. Say it more simply.\n    "${words}"`);
  }
  return faults;
}

// ─── What the hook remembers for a session ───────────────────────────────────────────────────────────────────────────

function sessionFile(home, sessionId) {
  return path.join(home, "sessions", `${String(sessionId).replace(/[^\w-]/g, "_")}.json`);
}

export function loadSession(home, sessionId) {
  const file = sessionFile(home, sessionId);
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return { briefed: {}, keys: [], messagesFile: null, warned: [], told: [], ...saved };
}

export function saveSession(home, sessionId, state) {
  const file = sessionFile(home, sessionId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 1)}\n`);
}

// ─── What the hook says ──────────────────────────────────────────────────────────────────────────────────────────────

/** The brief a session gets before its first words: the checklist, how the redone screens say things, and what to do. */
export async function briefText({ keys = [], text = "" } = {}, root = ROOT) {
  const words = await import("./words-read.mjs");
  const guide = readFileSync(path.join(root, "docs/developer/writing-guide.md"), "utf8");
  const messages = JSON.parse(readFileSync(path.join(root, "messages/en.json"), "utf8"));
  const section = words.sectionOf({ keys, text });
  const sample = words.sampleRedone(words.redoneLines(messages, words.redoneNamespaces(guide)), { section });
  return [
    "Before you write words Anthony will read, copy the redone screens.",
    "",
    "Since 17 November Anthony has asked about the house style almost every day. Each time, the agent had measured the reading age. But it hadn't copied the redone screens first. So the tool stops your first write once, to show you this.",
    "",
    "The rules, from docs/developer/writing-guide.md",
    ...words.checklistOf(guide).map((rule, index) => `${index + 1}. ${rule}`),
    `Aim for a reading age of about ${words.AIM_READING_AGE}.`,
    "",
    "How the redone screens say things",
    ...sample.map(([key, line]) => `- "${line}" (${key})`),
    `See every redone line with: node scripts/words-read.mjs redone${section ? ` ${section}` : ""}`,
    "",
    "Before you write again",
    "1. Find the redone line each new line copies.",
    "2. In your reply, put each new line beside it, like this.",
    '   "Visits each day"  copies  "Clicks and impressions over time" (searchConsole.record.chartTitle)',
    "   If no redone line fits, say so.",
    "3. Then write again. The tool checks the words in each write from now on.",
    "",
    "A fresh reader reads every new line before Anthony sees it. The tool hands you the packet before a canvas is published, and before you end a turn with new screen lines.",
  ].join("\n");
}

/** "1 line", "2 lines". */
export const countOf = (count, word = "line") => `${count} ${word}${count === 1 ? "" : "s"}`;
const deny = (reason) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
const note = (context, systemMessage) => ({ ...(systemMessage ? { systemMessage } : {}), hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: context } });
const readerSteps = (packet) => ["Start a helper agent that didn't write the words, with this prompt.", `  ${packet.prompt}`, "Fix what it finds."];

// ─── Each event ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A Write or Edit of a board, a canvas.json or messages/en.json. */
async function onWrite(input, { home, root }) {
  const tool = input.tool_name;
  const file = path.resolve(input.cwd ?? root, input.tool_input?.file_path ?? "");
  if (!isBoard(file) && !isCanvas(file) && !isMessages(file)) return null;
  const { before, after } = afterWrite(tool, { ...input.tool_input, file_path: file });
  const state = loadSession(home, input.session_id);
  const who = input.agent_id ?? "main";
  const lines = isMessages(file) ? await changedLines(before, after) : [];

  if (!state.briefed[who]) {
    state.briefed[who] = true;
    saveSession(home, input.session_id, state);
    return deny(await briefText({ keys: lines.map(([key]) => key), text: after.slice(0, 20000) }, root));
  }

  let faults;
  if (isMessages(file)) {
    faults = await lineFaults(lines, existsSync(path.join(file, "../../scripts/word-style-allowlist.json")) ? path.resolve(file, "../..") : root);
  } else if (isCanvas(file)) {
    const { checkCanvasNotes } = await import("./check-drawing.mjs");
    const notes = (text) => { try { return checkCanvasNotes(JSON.parse(text || "{}")); } catch { return []; } };
    faults = addedProblems(notes(before), notes(after));
  } else {
    const { drawingWordProblems } = await import("./check-drawing.mjs");
    faults = addedProblems(drawingWordProblems(before), drawingWordProblems(after));
  }
  if (faults.length > 0) return deny(["These words break the house style. Fix them, then write again.", ...faults.map((fault) => `- ${fault}`)].join("\n"));
  if (lines.length > 0) {
    state.keys = [...new Set([...state.keys, ...lines.map(([key]) => key)])];
    // A worktree's session edits its own copy, and the hook runs from the main checkout, so keep which file it was.
    state.messagesFile = file;
    saveSession(home, input.session_id, state);
  }
  return null;
}

/** A Bash command that starts or builds boards: the brief, once, before the first board is drawn. */
async function onBash(input, { home, root }) {
  if (!BUILDS_BOARDS.test(input.tool_input?.command ?? "")) return null;
  const state = loadSession(home, input.session_id);
  const who = input.agent_id ?? "main";
  if (state.briefed[who]) return null;
  state.briefed[who] = true;
  saveSession(home, input.session_id, state);
  return deny(await briefText({}, root));
}

/** The boards and canvas.json files an Artifact publish sends, as files on disk. */
export function publishedFiles(input, cwd) {
  if ((input.action ?? "publish") !== "publish" || input.asset) return [];
  const base = input.root ? path.resolve(cwd, input.root) : cwd;
  const found = [];
  const add = (published, source) => {
    if ((isBoard(published) || isCanvas(published)) && source) found.push(path.resolve(base, source));
  };
  if (Array.isArray(input.files)) for (const entry of input.files) add(entry.path, entry.path);
  else for (const [published, source] of Object.entries(input.files ?? {})) add(published, typeof source === "string" ? source : source?.from);
  if (input.file_path) add(input.file_path, path.resolve(cwd, input.file_path));
  return [...new Set(found)].filter((file) => existsSync(file));
}

/** A canvas publish: check:drawing on every board and the notes, then a fresh read of every new line. */
async function onPublish(input, { home, root, drawingContext }) {
  const files = publishedFiles(input.tool_input ?? {}, input.cwd ?? root);
  if (files.length === 0) return null;
  const drawing = await import("./check-drawing.mjs");
  const context = (drawingContext ?? drawing.drawingContext)();
  if (!context) return deny("The drawing kit isn't built here, so the boards can't be checked. Run npm run drawing-kit, then publish again.");
  const problems = files.flatMap((file) => drawing.checkFile(file, context).map((problem) => `- ${path.basename(file)}: ${problem}`));
  if (problems.length > 0) return deny(["The drawing check found problems. Fix them, then publish again.", ...problems].join("\n"));

  const words = await import("./words-read.mjs");
  const known = words.appWords(root);
  const { unread, faulted, fine } = words.standing(words.canvasWords(files), words.loadReads(home), known);
  if (unread.length > 0) {
    const packet = words.makePacket(unread, { context: [...fine.filter((line) => !known.has(line)), ...faulted.map(({ line }) => line)], sectionText: words.canvasAbout(files), home, root });
    return deny([`A fresh reader hasn't read ${countOf(unread.length, "new line")} on this canvas yet.`, ...readerSteps(packet), "Then publish again."].join("\n"));
  }
  return keptFaults(input, home, faulted, {
    first: "Then publish again. If you keep a line, publishing again keeps it, and Anthony is told.",
    kept: "this canvas",
    done: "Words checked. Every new line on this canvas passed the checks and a fresh read.",
    answer: note,
  });
}

/**
 * Lines a fresh reader faulted and nobody changed. The first time, the tool refuses and lists them. The next time it
 * lets them through, tells Anthony which lines were kept, and asks the agent to tell him why.
 */
async function keptFaults(input, home, faulted, { first, kept, done, answer }) {
  const words = await import("./words-read.mjs");
  const state = loadSession(home, input.session_id);
  const fresh = faulted.filter(({ line }) => !state.warned.includes(words.fingerprint(line)));
  const list = faulted.map(({ line, faults }) => `- "${line}"  ${faults.join(" ")}`);
  if (fresh.length > 0) {
    state.warned.push(...fresh.map(({ line }) => words.fingerprint(line)));
    saveSession(home, input.session_id, state);
    return { refuse: [`The fresh reader found faults in ${countOf(faulted.length)}, and ${faulted.length === 1 ? "it hasn't" : "they haven't"} changed.`, ...list, "Fix each one. If you keep one, tell Anthony which line and why.", first].join("\n") };
  }
  if (faulted.length > 0) return answer("Tell Anthony why you kept each line the fresh reader faulted.", [`The fresh reader faulted ${countOf(faulted.length)} on ${kept}, and ${faulted.length === 1 ? "it was" : "they were"} kept.`, ...list].join("\n"));
  return done ? answer(done, done) : null;
}

/** The end of a turn: lines this session changed in messages/en.json need a fresh read first. */
async function onStop(input, { home, root }) {
  const state = loadSession(home, input.session_id);
  if (state.keys.length === 0) return null;
  const words = await import("./words-read.mjs");
  const file = state.messagesFile && existsSync(state.messagesFile) ? state.messagesFile : path.join(root, "messages/en.json");
  const current = words.linesOfKeys(state.keys, file);
  const keyOf = new Map(current.map(([key, message]) => [message, key]));
  const { unread, faulted } = words.standing(current.map(([, message]) => message), words.loadReads(home), words.redoneWords(root));
  if (unread.length > 0) {
    if (input.stop_hook_active) {
      const untold = unread.filter((line) => !state.told.includes(words.fingerprint(line)));
      if (untold.length === 0) return null;
      state.told.push(...untold.map((line) => words.fingerprint(line)));
      saveSession(home, input.session_id, state);
      return { systemMessage: `${countOf(unread.length, "new line")} in messages/en.json ${unread.length === 1 ? "hasn't" : "haven't"} had a fresh read yet.` };
    }
    const keys = unread.map((line) => keyOf.get(line));
    const packet = words.makePacket(unread, { keys, home, root });
    return { decision: "block", reason: [`You changed ${countOf(unread.length)} in messages/en.json, and a fresh reader hasn't read ${unread.length === 1 ? "it" : "them"} yet.`, ...readerSteps(packet), "Do it before you hand back."].join("\n") };
  }
  const answer = await keptFaults(input, home, faulted, {
    first: "Do it before you hand back. If you keep a line, tell Anthony in your reply.",
    kept: "the screens",
    answer: (_context, systemMessage) => {
      const untold = faulted.filter(({ line }) => !state.told.includes(words.fingerprint(line)));
      if (untold.length === 0) return null;
      state.told.push(...untold.map(({ line }) => words.fingerprint(line)));
      saveSession(home, input.session_id, { ...loadSession(home, input.session_id), told: state.told });
      return { systemMessage };
    },
  });
  if (answer?.refuse) return input.stop_hook_active ? null : { decision: "block", reason: answer.refuse };
  return answer;
}

/** What the hook answers for one event, or null to say nothing. */
export async function handle(input, { home, root = ROOT, drawingContext } = {}) {
  const where = { home: home ?? (await import("./words-read.mjs")).wordsHome(root), root, drawingContext };
  let answer = null;
  if (input.hook_event_name === "Stop") return onStop(input, where);
  if (input.hook_event_name !== "PreToolUse") return null;
  if (["Write", "Edit", "MultiEdit"].includes(input.tool_name)) answer = await onWrite(input, where);
  else if (input.tool_name === "Bash") answer = await onBash(input, where);
  else if (input.tool_name === "Artifact") answer = await onPublish(input, where);
  return answer?.refuse ? deny(answer.refuse) : answer;
}

async function main() {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const answer = await handle(input);
  if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`words hook: ${error.stack ?? error}\n`);
    process.exit(1);
  });
}
