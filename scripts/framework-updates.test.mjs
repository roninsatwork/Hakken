import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { sourceFiles, buildTemplate } from "./strip-verticals.mjs";
import {
  writeProvenance,
  readProvenance,
  fingerprint,
  snapshotId,
  PROVENANCE,
} from "./framework-snapshot.mjs";
import {
  compareFramework,
  writeReview,
  recordReview,
} from "./framework-updates/review.mjs";

let directory, source, product, upstream, reviewFile;
const write = (root, file, contents) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), contents);
};
const read = (root, file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (root, ...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const sealIncoming = (keep = ["base", "arcade"]) => {
  fs.rmSync(path.join(upstream, PROVENANCE), { force: true });
  return writeProvenance(source, upstream, keep, sourceFiles(upstream));
};
function saveReview(plan = compareFramework(product, upstream)) {
  plan.verification = "Fixture checks completed; no live backend.";
  fs.writeFileSync(reviewFile, JSON.stringify(plan));
  return plan;
}
function commit() {
  git(product, "add", ".");
  git(
    product,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "Local test checkpoint",
  );
}
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "hakken-framework-review-"));
  source = path.join(directory, "source");
  product = path.join(directory, "product");
  upstream = path.join(directory, "incoming");
  reviewFile = path.join(directory, "review.json");
  for (const root of [source, product, upstream]) {
    fs.mkdirSync(root);
    write(root, "core.txt", "base\n");
    write(root, "remove.txt", "delete me\n");
    write(root, "local.txt", "base local\n");
  }
  writeProvenance(source, product, ["base", "arcade"], sourceFiles(product));
  git(product, "init", "--quiet", "--initial-branch=dev", "--template=");
  commit();
  write(upstream, "core.txt", "incoming\n");
  sealIncoming();
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("exports fingerprint the pruned files, retain Arcade, and describe re-exports honestly", () => {
  write(
    source,
    "convex/utils/companyModules.ts",
    "export const modules = [{vertical: 'base'}];",
  );
  write(
    source,
    "template.verticals.json",
    JSON.stringify({
      version: 1,
      alwaysKeep: ["base", "arcade"],
      verticals: {},
    }),
  );
  const first = path.join(directory, "export");
  expect(buildTemplate(source, ["base"], first).errors).toEqual([]);
  const provenance = readProvenance(first);
  expect(provenance.keep).toEqual(["arcade", "base"]);
  expect(provenance.source).toMatchObject({
    commit: null,
    dirty: null,
    kind: "framework",
  });
  expect(provenance.files["core.txt"]).toEqual(fingerprint(first, "core.txt"));
  expect(provenance.files[PROVENANCE]).toBeUndefined();
  const second = path.join(directory, "recut");
  expect(buildTemplate(first, ["base"], second).errors).toEqual([]);
  expect(readProvenance(second).source.kind).toBe("product-reexport");
  expect(() => compareFramework(second, upstream)).toThrow(/re-exports/);
});
test("records a source commit and flags uncommitted exports", () => {
  git(source, "init", "--quiet", "--initial-branch=dev", "--template=");
  git(source, "add", ".");
  git(
    source,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "-m",
    "Fixture",
  );
  expect(sealIncoming().source).toMatchObject({
    commit: git(source, "rev-parse", "HEAD"),
    dirty: false,
  });
  write(source, "core.txt", "uncommitted");
  expect(sealIncoming().source.dirty).toBe(true);
});
test("classifies incoming edits/deletions/additions, overlap, aligned files and product-only changes", () => {
  write(product, "core.txt", "product customization");
  write(product, "local.txt", "product only");
  write(product, "new.txt", "local collision");
  write(upstream, "new.txt", "new upstream");
  write(upstream, "aligned.txt", "same");
  write(product, "aligned.txt", "same");
  write(upstream, "addition.txt", "new");
  fs.rmSync(path.join(upstream, "remove.txt"));
  sealIncoming();
  const plan = compareFramework(product, upstream);
  expect(
    Object.fromEntries(plan.entries.map((e) => [e.path, e.change])),
  ).toEqual({
    "addition.txt": "upstream-addition",
    "aligned.txt": "already-aligned",
    "core.txt": "overlap",
    "new.txt": "overlap",
    "remove.txt": "upstream-deletion",
  });
  expect(plan.productOnly).toEqual(["local.txt"]);
  expect(plan.entries.every((entry) => entry.decision === "review")).toBe(true);
});
test("binary content and executable changes are included", () => {
  write(upstream, "core.txt", Buffer.from([0, 255, 0, 128]));
  fs.chmodSync(path.join(upstream, "local.txt"), 0o755);
  sealIncoming();
  expect(
    compareFramework(product, upstream).entries.map((e) => e.path),
  ).toEqual(["core.txt", "local.txt"]);
});
test("comparison is read-only; review files are exclusive and outside both trees", () => {
  const before = read(product, PROVENANCE);
  const output = execFileSync(
    process.execPath,
    [
      path.resolve("scripts/framework-update.mjs"),
      "--root",
      product,
      "--upstream",
      upstream,
    ],
    { encoding: "utf8" },
  );
  expect(output).toContain("Read-only comparison");
  expect(read(product, PROVENANCE)).toBe(before);
  const plan = compareFramework(product, upstream);
  expect(() => writeReview(plan, path.join(product, "review.json"))).toThrow(
    /separate/,
  );
  writeReview(plan, reviewFile);
  expect(() => writeReview(plan, reviewFile)).toThrow(/exist/);
});
test.each(["changed", "added", "removed"])(
  "rejects %s incoming files after export",
  (kind) => {
    if (kind === "changed") write(upstream, "core.txt", "changed after seal");
    if (kind === "added") write(upstream, "extra.txt", "unrecorded");
    if (kind === "removed") fs.rmSync(path.join(upstream, "core.txt"));
    expect(() => compareFramework(product, upstream)).toThrow(/changed/);
  },
);
test("rejects missing/corrupted provenance, unsafe paths and different module cuts", () => {
  sealIncoming(["base", "arcade", "salesData"]);
  expect(() => compareFramework(product, upstream)).toThrow(
    /different modules/,
  );
  const doc = sealIncoming();
  doc.files["../outside"] = doc.files["core.txt"];
  const { id: _id, ...data } = doc;
  doc.id = snapshotId(data);
  write(upstream, PROVENANCE, JSON.stringify(doc));
  expect(() => readProvenance(upstream)).toThrow(/Unsafe/);
  write(upstream, PROVENANCE, JSON.stringify({ ...doc, id: "wrong" }));
  expect(() => readProvenance(upstream)).toThrow(/Invalid/);
  fs.rmSync(path.join(upstream, PROVENANCE));
  expect(() => compareFramework(product, upstream)).toThrow(/Missing/);
});
test("rejects symlink files and ancestors instead of following them", () => {
  fs.rmSync(path.join(product, "core.txt"));
  fs.symlinkSync(
    path.join(upstream, "core.txt"),
    path.join(product, "core.txt"),
  );
  expect(() => compareFramework(product, upstream)).toThrow(/symlink/);
});
test("unreviewed entries, absent checks and unintegrated takes cannot advance the baseline", () => {
  saveReview();
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(
    /Unreviewed/,
  );
  const plan = compareFramework(product, upstream);
  plan.entries[0].decision = "take-upstream";
  saveReview(plan);
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(
    /not been integrated/,
  );
  plan.entries[0].decision = "keep-product";
  plan.entries[0].reason = "Custom behaviour";
  saveReview(plan);
  plan.verification = "";
  fs.writeFileSync(reviewFile, JSON.stringify(plan));
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(
    /checks you actually ran/,
  );
});
test("stale incoming versions and forged review paths cannot advance the baseline", () => {
  const plan = saveReview();
  plan.entries[0].path = "../outside";
  saveReview(plan);
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(
    /paths\/fingerprints/,
  );
  saveReview(compareFramework(product, upstream));
  write(upstream, "core.txt", "next version");
  sealIncoming();
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(/stale/);
});
test("retaining product code needs a reason and a clean Git checkpoint", () => {
  const plan = saveReview();
  plan.entries[0].decision = "keep-product";
  saveReview(plan);
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(/Explain/);
  plan.entries[0].reason = "Keep the product implementation";
  saveReview(plan);
  write(product, "uncommitted.txt", "local work");
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(
    /clean Git checkpoint/,
  );
  commit();
  git(product, "branch", "-m", "main");
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(/not main/);
});
test("records exact takes/deletions and intentional overrides without changing product code", () => {
  fs.rmSync(path.join(upstream, "remove.txt"));
  sealIncoming();
  const plan = compareFramework(product, upstream);
  for (const entry of plan.entries) {
    entry.decision =
      entry.path === "core.txt" ? "keep-product" : "take-upstream";
    entry.reason = "Reviewed product implementation";
  }
  saveReview(plan);
  write(product, "core.txt", "manually merged product version");
  fs.rmSync(path.join(product, "remove.txt"));
  commit();
  const history = recordReview(product, upstream, reviewFile);
  expect(read(product, "core.txt")).toBe("manually merged product version");
  expect(readProvenance(product).id).toBe(readProvenance(upstream).id);
  expect(JSON.parse(read(product, history)).decisions[0]).toMatchObject({
    decision: "keep-product",
    product: fingerprint(product, "core.txt"),
  });
  expect(compareFramework(product, upstream).entries).toEqual([]);
  expect(compareFramework(product, upstream).productOnly).toContain("core.txt");
  // Subsequent updates still identify the retained override as an overlap.
  write(upstream, "core.txt", "next framework version");
  sealIncoming();
  expect(compareFramework(product, upstream).entries[0].change).toBe("overlap");
});
test("an exact take must include the executable mode", () => {
  fs.chmodSync(path.join(upstream, "core.txt"), 0o755);
  sealIncoming();
  const plan = saveReview();
  plan.entries[0].decision = "take-upstream";
  saveReview(plan);
  write(product, "core.txt", read(upstream, "core.txt"));
  commit();
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(
    /not been integrated/,
  );
  fs.chmodSync(path.join(product, "core.txt"), 0o755);
  commit();
  recordReview(product, upstream, reviewFile);
  expect(readProvenance(product).id).toBe(readProvenance(upstream).id);
});
test("a history write failure restores the previous baseline", () => {
  const before = read(product, PROVENANCE);
  const plan = saveReview();
  plan.entries[0].decision = "keep-product";
  plan.entries[0].reason = "Keep product";
  saveReview(plan);
  const original = fs.linkSync;
  vi.spyOn(fs, "linkSync").mockImplementation((source, target) => {
    if (String(target).includes("/.hakken/reviews/"))
      throw new Error("history disk failure");
    return original(source, target);
  });
  expect(() => recordReview(product, upstream, reviewFile)).toThrow(
    "history disk failure",
  );
  expect(read(product, PROVENANCE)).toBe(before);
  expect(git(product, "status", "--porcelain")).toBe("");
});
