import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { selectorFor } from "./check-drawing.mjs";
import { addedProblems, afterWrite, countOf, handle, loadSession, publishedFiles, saveSession } from "./words-hook.mjs";
import { fingerprint, loadReads, saveReads, sign } from "./words-read.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const KIT = ["text-foreground", "text-sm", "p-8"].map((name) => `${selectorFor(name)}{}`).join(" ");
const drawingContext = () => ({ kitCss: KIT, colours: new Set(), appSource: "" });

/** A fresh place for the hook to keep its reads and sessions, and a folder to draw in. */
function setUp() {
  const home = mkdtempSync(path.join(os.tmpdir(), "words-hook-home-"));
  const dir = mkdtempSync(path.join(os.tmpdir(), "words-hook-work-"));
  const run = (input) => handle({ session_id: "s1", cwd: dir, ...input }, { home, root: ROOT, drawingContext });
  const write = (file, content) => run({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: path.join(dir, file), content } });
  return { home, dir, run, write };
}

const board = (...lines) => `<html><head><title>Board</title></head><body><div class="p-8 text-foreground">${lines.map((line) => `<p class="text-sm">${line}</p>`).join("")}</div></body></html>`;
const decision = (answer) => answer?.hookSpecificOutput?.permissionDecision;
const reason = (answer) => answer?.hookSpecificOutput?.permissionDecisionReason ?? "";

describe("what a write leaves behind", () => {
  test("a Write is its content, and an Edit replaces the first match, or every one", () => {
    const read = () => "one two one";
    expect(afterWrite("Write", { file_path: "x", content: "new" }, read)).toEqual({ before: "one two one", after: "new" });
    expect(afterWrite("Edit", { file_path: "x", old_string: "one", new_string: "$&1" }, read).after).toBe("$&1 two one");
    expect(afterWrite("Edit", { file_path: "x", old_string: "one", new_string: "1", replace_all: true }, read).after).toBe("1 two 1");
    expect(afterWrite("Edit", { file_path: "x", old_string: "missing", new_string: "1" }, read).after).toBe("one two one");
  });

  test("only problems a write adds count, so fixing one fault at a time is never refused", () => {
    expect(addedProblems(["a", "b", "b"], ["b", "c"])).toEqual(["c"]);
    expect(addedProblems(["a", "b"], ["a"])).toEqual([]);
    expect(addedProblems(["a"], ["a", "a"])).toEqual(["a"]);
  });

  test("counts read as words do", () => {
    expect(countOf(1)).toBe("1 line");
    expect(countOf(3, "new line")).toBe("3 new lines");
  });
});

describe("the first write of words", () => {
  test("a file the hook doesn't judge is let through", async () => {
    const { write } = setUp();
    expect(await write("notes.md", "Anything at all — even this.")).toBeNull();
  });

  test("is stopped once with the brief, and the next write goes ahead", async () => {
    const { write } = setUp();
    const first = await write("Ways.dc.html", board("Visits each day"));
    expect(decision(first)).toBe("deny");
    expect(reason(first)).toContain("copy the redone screens");
    expect(reason(first)).toContain("One idea a sentence.");
    expect(reason(first)).toMatch(/- ".+" \((googleAnalytics|searchConsole)\./);
    expect(reason(first)).toContain("put each new line beside it");
    expect(reason(first)).not.toMatch(/\w—\w|\w — \w/);
    expect(await write("Ways.dc.html", board("Visits each day"))).toBeNull();
  });

  test("a helper gets its own brief", async () => {
    const { run, dir } = setUp();
    const input = { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: path.join(dir, "canvas.json"), content: "{}" } };
    expect(decision(await run(input))).toBe("deny");
    expect(decision(await run({ ...input, agent_id: "helper-1" }))).toBe("deny");
    expect(await run({ ...input, agent_id: "helper-1" })).toBeNull();
  });

  test("starting the drawing kit gets the brief, and other commands don't", async () => {
    const { run } = setUp();
    const bash = (command) => run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
    expect(await bash("git status")).toBeNull();
    expect(decision(await bash("npm run drawing-kit"))).toBe("deny");
    expect(await bash("python3 build-boards.py > Main.dc.html")).toBeNull();
  });
});

describe("each write after the brief", () => {
  test("a board write that adds a fault is refused, naming it", async () => {
    const { write } = setUp();
    await write("Ways.dc.html", board("Visits each day"));
    const answer = await write("Ways.dc.html", board("Each page's showings against the month before — a quick look."));
    expect(decision(answer)).toBe("deny");
    expect(reason(answer)).toContain("Name the month");
    expect(reason(answer)).toContain("No em dashes");
    expect(reason(answer)).toContain('"showings"');
  });

  test("a canvas's notes are held to the same rules", async () => {
    const { write } = setUp();
    await write("canvas.json", "{}");
    const answer = await write("canvas.json", JSON.stringify({ notes: { a: { text: "The chart: Show and Compare with, both on the card." } } }));
    expect(reason(answer)).toContain("A colon joins two ideas");
  });

  test("a new line in messages/en.json is judged, and kept for the fresh reader when it's fine", async () => {
    const { write, home, dir } = setUp();
    const file = path.join("messages", "en.json");
    const before = { live: { title: "Live" }, admin: { note: "Admin words: anything — at all" } };
    mkdirSync(path.join(dir, "messages"), { recursive: true });
    writeFileSync(path.join(dir, file), JSON.stringify(before));
    await write(file, JSON.stringify(before));
    const bad = await write(file, JSON.stringify({ ...before, live: { ...before.live, hint: "Light, dark, or the same as your device." } }));
    expect(reason(bad)).toContain("live.hint");
    expect(reason(bad)).toContain('No comma before the "and" or "or"');
    expect(await write(file, JSON.stringify({ ...before, live: { ...before.live, hint: "Nobody in the last 30 minutes." } }))).toBeNull();
    expect(loadSession(home, "s1").keys).toEqual(["live.hint"]);
  });
});

describe("a canvas publish", () => {
  function canvas(dir, ...lines) {
    writeFileSync(path.join(dir, "Ways.dc.html"), board(...lines));
    writeFileSync(path.join(dir, "canvas.json"), JSON.stringify({ title: "Words test", boards: { "Ways.dc.html": { title: "1 · Visits each day" } }, notes: {} }));
    return { hook_event_name: "PreToolUse", tool_name: "Artifact", tool_input: { root: dir, files: { "Ways.dc.html": "Ways.dc.html", "canvas.json": "canvas.json" }, icon: "test" } };
  }

  test("finds the boards and notes it sends, wherever they are written", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "words-hook-files-"));
    for (const name of ["A.dc.html", "canvas.json", "kit.css"]) writeFileSync(path.join(dir, name), "{}");
    expect(publishedFiles({ root: dir, files: { "A.dc.html": "A.dc.html", "canvas.json": { from: "canvas.json" }, "kit.css": "kit.css", "B.dc.html": null } }, "/")).toEqual([path.join(dir, "A.dc.html"), path.join(dir, "canvas.json")]);
    expect(publishedFiles({ files: [{ path: "A.dc.html" }] }, dir)).toEqual([path.join(dir, "A.dc.html")]);
    expect(publishedFiles({ action: "read", files: { "A.dc.html": "A.dc.html" } }, dir)).toEqual([]);
    expect(publishedFiles({ file_path: path.join(dir, "kit.css") }, dir)).toEqual([]);
  });

  test("a board the drawing check fails is refused", async () => {
    const { run, dir } = setUp();
    const input = canvas(dir, "Visits each day");
    writeFileSync(path.join(dir, "Ways.dc.html"), '<div class="made-up-class">Visits each day</div>');
    const answer = await run(input);
    expect(reason(answer)).toContain("The drawing check found problems");
    expect(reason(answer)).toContain("made-up-class");
  });

  test("waits for a fresh read of every new line, lists what the reader faulted once, then tells Anthony what was kept", async () => {
    const { run, dir, home } = setUp();
    const input = canvas(dir, "Each page's clicks since September.", "Has what's ticked here, unless you switch it off there.", "Bigger boxes had more visits.");

    const unread = await run(input);
    expect(decision(unread)).toBe("deny");
    // The canvas's title, the board's title and two lines. "Bigger boxes had more visits." is a redone screen's own line.
    expect(reason(unread)).toContain("A fresh reader hasn't read 4 new lines");
    const prompt = reason(unread).match(/You're a fresh reader\. Read (\S+) and do what it says\./);
    expect(prompt).not.toBeNull();

    const packet = JSON.parse(readFileSync(prompt[1].replace(/\.md$/, ".json"), "utf8"));
    expect(packet.lines).not.toContain("Bigger boxes had more visits."); // a redone screen's own line
    const faulted = packet.lines.indexOf("Has what's ticked here, unless you switch it off there.") + 1;
    saveReads(sign(loadReads(home), packet, { [faulted]: "Here and there point at nothing." }), home);

    const listed = await run(input);
    expect(decision(listed)).toBe("deny");
    expect(reason(listed)).toContain("found faults in 1 line, and it hasn't changed");

    const kept = await run(input);
    expect(decision(kept)).toBeUndefined();
    expect(kept.systemMessage).toContain("faulted 1 line on this canvas, and it was kept");
    expect(kept.hookSpecificOutput.additionalContext).toContain("Tell Anthony why");
  });

  test("says so when every line has passed", async () => {
    const { run, dir, home } = setUp();
    const input = canvas(dir, "Visits each day");
    const prompt = reason(await run(input)).match(/Read (\S+) and do/);
    saveReads(sign(loadReads(home), JSON.parse(readFileSync(prompt[1].replace(/\.md$/, ".json"), "utf8")), {}), home);
    expect((await run(input)).systemMessage).toBe("Words checked. Every new line on this canvas passed the checks and a fresh read.");
  });

  test("anything but a canvas publish is let through", async () => {
    const { run } = setUp();
    expect(await run({ hook_event_name: "PreToolUse", tool_name: "Artifact", tool_input: { action: "list" } })).toBeNull();
  });
});

describe("the end of a turn", () => {
  test("new screen lines need a fresh read first, and Anthony is told once if the turn ends without one", async () => {
    const { run, home } = setUp();
    saveSession(home, "s1", { ...loadSession(home, "s1"), keys: ["keywordResearch.verdicts.NONE", "searchConsole.lowCtr.title", "gone.key"] });
    const stop = (active) => run({ hook_event_name: "Stop", stop_hook_active: active });

    const blocked = await stop(false);
    expect(blocked.decision).toBe("block");
    expect(blocked.reason).toContain("You changed 1 line in messages/en.json"); // a redone screen's own title needs no read
    expect(await stop(true)).toEqual({ systemMessage: "1 new line in messages/en.json hasn't had a fresh read yet." });
    expect(await stop(true)).toBeNull();
  });

  test("reads the en.json the session edited, so a worktree's new line counts though the hook runs from the main checkout", async () => {
    const { write, run, dir } = setUp();
    const file = path.join("messages", "en.json");
    mkdirSync(path.join(dir, "messages"), { recursive: true });
    writeFileSync(path.join(dir, file), JSON.stringify({ live: { title: "Live" } }));
    await write(file, "{}");
    const after = JSON.stringify({ live: { title: "Live", newHint: "Each page's clicks since September." } });
    expect(await write(file, after)).toBeNull();
    writeFileSync(path.join(dir, file), after); // the Edit lands
    const blocked = await run({ hook_event_name: "Stop", stop_hook_active: false });
    expect(blocked.decision).toBe("block");
    expect(blocked.reason).toContain("You changed 1 line in messages/en.json");
  });

  test("a session that changed no screen lines ends as it likes", async () => {
    const { run } = setUp();
    expect(await run({ hook_event_name: "Stop", stop_hook_active: false })).toBeNull();
  });

  test("a line the reader read is let through", async () => {
    const { run, home } = setUp();
    const words = JSON.parse(readFileSync(path.join(ROOT, "messages/en.json"), "utf8")).keywordResearch.verdicts.NONE;
    saveSession(home, "s1", { ...loadSession(home, "s1"), keys: ["keywordResearch.verdicts.NONE"] });
    saveReads({ lines: { [fingerprint(words)]: { faults: [], at: "2026-11-21" } } }, home);
    expect(await run({ hook_event_name: "Stop", stop_hook_active: false })).toBeNull();
  });
});
