import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { sourceFiles } from "../strip-verticals.mjs";
import {
  PROVENANCE,
  fingerprint,
  sameFile,
  readProvenance,
} from "../framework-snapshot.mjs";
import { applyEntity, readFile } from "../entity-generator/plan.mjs";

function separate(a, b) {
  const inside = (root, candidate) =>
    candidate === root || candidate.startsWith(root + path.sep);
  if (inside(a, b) || inside(b, a))
    throw new Error(
      "Product and incoming export must be separate directories.",
    );
}
function changedPaths(base, incoming) {
  return [
    ...new Set([...Object.keys(base.files), ...Object.keys(incoming.files)]),
  ]
    .sort()
    .filter(
      (file) =>
        !sameFile(base.files[file] ?? null, incoming.files[file] ?? null),
    );
}

export function compareFramework(root, upstream) {
  root = fs.realpathSync(root);
  upstream = fs.realpathSync(upstream);
  separate(root, upstream);
  const base = readProvenance(root);
  const incoming = readProvenance(upstream);
  if (base.source.kind !== "framework" || incoming.source.kind !== "framework")
    throw new Error(
      "Product re-exports cannot be used as framework update baselines. Use an export made directly from Sonae.",
    );
  if (
    JSON.stringify([...base.keep].sort()) !==
    JSON.stringify([...incoming.keep].sort())
  )
    throw new Error(
      "The incoming export keeps different modules. Export the same module cut; module migrations require separate review.",
    );
  const actual = sourceFiles(upstream);
  if (
    JSON.stringify(actual) !==
    JSON.stringify(Object.keys(incoming.files).sort())
  )
    throw new Error(
      "Incoming export file inventory changed; create a fresh export before reviewing it.",
    );
  for (const file of actual)
    if (!sameFile(fingerprint(upstream, file), incoming.files[file]))
      throw new Error(`Incoming export changed: ${file}`);
  const entries = changedPaths(base, incoming).map((file) => {
    const before = base.files[file] ?? null;
    const next = incoming.files[file] ?? null;
    const current = fingerprint(root, file);
    const change = sameFile(current, next)
      ? "already-aligned"
      : !sameFile(current, before)
        ? "overlap"
        : next === null
          ? "upstream-deletion"
          : before === null
            ? "upstream-addition"
            : "upstream-change";
    return {
      path: file,
      base: before,
      product: current,
      upstream: next,
      change,
      decision: "review",
      reason: "",
    };
  });
  const incomingChanges = new Set(entries.map((entry) => entry.path));
  const productOnly = [
    ...new Set([...Object.keys(base.files), ...sourceFiles(root)]),
  ]
    .sort()
    .filter(
      (file) =>
        !incomingChanges.has(file) &&
        !sameFile(fingerprint(root, file), base.files[file] ?? null),
    );
  return {
    version: 1,
    root,
    upstream,
    baselineId: base.id,
    incomingId: incoming.id,
    source: incoming.source,
    keep: incoming.keep,
    entries,
    productOnly,
    verification: "",
  };
}

/** A review file is editable data, never an executable patch or command list. */
export function writeReview(plan, destination) {
  const target = path.join(
    fs.realpathSync(path.dirname(path.resolve(destination))),
    path.basename(destination),
  );
  separate(plan.root, target);
  separate(plan.upstream, target);
  fs.writeFileSync(target, JSON.stringify(plan, null, 2) + "\n", {
    flag: "wx",
  });
  return target;
}

function checkpoint(root) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  if (fs.realpathSync(git("rev-parse", "--show-toplevel")) !== root)
    throw new Error("The product must have its own Git repository.");
  const branch = git("branch", "--show-current");
  if (!branch || branch === "main")
    throw new Error(
      "Record updates on dev or a review branch, not main or detached HEAD.",
    );
  const commit = git("rev-parse", "--verify", "HEAD");
  git("ls-files", "--error-unmatch", PROVENANCE);
  if (git("status", "--porcelain", "--untracked-files=all"))
    throw new Error(
      "Commit your reviewed product changes locally first. Recording requires a clean Git checkpoint; keep the review JSON outside the product.",
    );
  return commit;
}

/** Only provenance/history is written. Product code is integrated by its owner. */
export function recordReview(root, upstream, reviewFile) {
  const target = path.resolve(reviewFile);
  if (fs.statSync(target).size > 32 * 1024 * 1024)
    throw new Error("Review file is too large.");
  const review = JSON.parse(fs.readFileSync(target, "utf8"));
  const current = compareFramework(root, upstream);
  if (
    review.version !== 1 ||
    review.root !== current.root ||
    review.upstream !== current.upstream ||
    review.baselineId !== current.baselineId ||
    review.incomingId !== current.incomingId ||
    !Array.isArray(review.entries) ||
    review.entries.length !== current.entries.length
  )
    throw new Error(
      "Review is stale or belongs to another product/export. Generate a new plan.",
    );
  if (current.baselineId === current.incomingId)
    throw new Error("This framework baseline is already recorded.");
  if (
    typeof review.verification !== "string" ||
    !review.verification.trim() ||
    review.verification.length > 4000
  )
    throw new Error(
      "Describe the checks you actually ran in verification before recording the review.",
    );
  const decisions = current.entries.map((expected, i) => {
    const entry = review.entries[i];
    if (
      !entry ||
      entry.path !== expected.path ||
      !sameFile(entry.base, expected.base) ||
      !sameFile(entry.upstream, expected.upstream)
    )
      throw new Error(
        "Review paths/fingerprints changed. Only edit decision, reason and verification.",
      );
    if (!["take-upstream", "keep-product"].includes(entry.decision))
      throw new Error(`Unreviewed update: ${entry.path}`);
    if (
      entry.decision === "take-upstream" &&
      !sameFile(expected.product, expected.upstream)
    )
      throw new Error(
        `Incoming file has not been integrated exactly: ${entry.path}. Integrate it or record a reviewed product override.`,
      );
    if (
      typeof entry.reason !== "string" ||
      entry.reason.length > 2000 ||
      (entry.decision === "keep-product" && !entry.reason.trim())
    )
      throw new Error(`Explain the retained product change: ${entry.path}`);
    return {
      path: entry.path,
      decision: entry.decision,
      reason: entry.reason,
      product: expected.product,
    };
  });
  const commit = checkpoint(current.root);
  const baselineBefore = readFile(current.root, PROVENANCE);
  const incoming = readProvenance(current.upstream);
  // Recheck after Git inspection so a concurrent integration cannot be acknowledged silently.
  const recheck = compareFramework(current.root, current.upstream);
  if (
    incoming.id !== current.incomingId ||
    JSON.stringify(recheck) !== JSON.stringify(current) ||
    checkpoint(current.root) !== commit
  )
    throw new Error("Product or export changed while recording. Review again.");
  const historyPath = `.sonae/reviews/${current.incomingId}.json`;
  if (readFile(current.root, historyPath, true) !== null)
    throw new Error("A review for this snapshot already exists.");
  const history = {
    version: 1,
    baselineId: current.baselineId,
    incomingId: current.incomingId,
    productCommit: commit,
    verification: review.verification.trim(),
    decisions,
  };
  applyEntity({
    root: current.root,
    edits: [
      {
        path: PROVENANCE,
        before: baselineBefore,
        after: JSON.stringify(incoming, null, 2) + "\n",
      },
      {
        path: historyPath,
        before: null,
        after: JSON.stringify(history, null, 2) + "\n",
      },
    ],
  });
  return historyPath;
}
