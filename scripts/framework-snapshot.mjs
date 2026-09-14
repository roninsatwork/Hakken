import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const PROVENANCE = ".sonae/framework.json";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stable(value[key])]),
        )
      : value;
export const snapshotId = (value) => digest(JSON.stringify(stable(value)));

export function safeFile(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    /[\\\x00-\x1f\x7f]/.test(relative) ||
    path.isAbsolute(relative) ||
    relative
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part === ".git" ||
          (part.startsWith(".env") && part !== ".env.example"),
      )
  )
    throw new Error(`Unsafe framework path: ${relative}`);
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw new Error(`Refusing symlink: ${relative}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return current;
}

export function fingerprint(root, relative) {
  const target = safeFile(root, relative);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!stat.isFile()) throw new Error(`Expected a regular file: ${relative}`);
  return {
    sha256: digest(fs.readFileSync(target)),
    executable: Boolean(stat.mode & 0o111),
  };
}
export const sameFile = (a, b) =>
  a === null || b === null
    ? a === b
    : a.sha256 === b.sha256 && a.executable === b.executable;

function sourceVersion(root) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  let commit = null;
  let dirty = null;
  try {
    if (
      fs.realpathSync(git("rev-parse", "--show-toplevel")) ===
      fs.realpathSync(root)
    ) {
      dirty = Boolean(git("status", "--porcelain", "--untracked-files=all"));
      try {
        commit = git("rev-parse", "--verify", "HEAD");
      } catch {
        /* A fresh export has no first commit. */
      }
    }
  } catch {
    /* A source directory without Git is an unversioned snapshot. */
  }
  return {
    repository: "https://github.com/roninsatwork/Sonae.git",
    commit,
    dirty,
    kind: fs.existsSync(path.join(root, PROVENANCE))
      ? "product-reexport"
      : "framework",
  };
}

/** Fingerprints describe the actual pruned export, including its rewritten lockfile. */
export function writeProvenance(sourceRoot, outputRoot, keep, files) {
  const snapshot = {
    version: 1,
    source: sourceVersion(sourceRoot),
    keep: [...new Set(keep)].sort(),
    files: Object.fromEntries(
      [...files].sort().map((file) => {
        if (file.startsWith(".sonae/"))
          throw new Error("Provenance cannot fingerprint itself.");
        const value = fingerprint(outputRoot, file);
        if (!value) throw new Error(`Export file is missing: ${file}`);
        return [file, value];
      }),
    ),
  };
  const result = { ...snapshot, id: snapshotId(snapshot) };
  const target = safeFile(outputRoot, PROVENANCE);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
  });
  return result;
}

export function readProvenance(root) {
  const target = safeFile(root, PROVENANCE);
  if (!fs.existsSync(target))
    throw new Error(
      `Missing ${PROVENANCE}. This clone needs a known export baseline; do not guess its original version.`,
    );
  if (fs.statSync(target).size > 32 * 1024 * 1024)
    throw new Error("Framework provenance is too large.");
  const { id, ...snapshot } = JSON.parse(fs.readFileSync(target, "utf8"));
  if (
    snapshot.version !== 1 ||
    !snapshot.source ||
    !["framework", "product-reexport"].includes(snapshot.source.kind) ||
    snapshot.source.repository !==
      "https://github.com/roninsatwork/Sonae.git" ||
    !(
      snapshot.source.commit === null ||
      /^[a-f0-9]{40,64}$/.test(snapshot.source.commit)
    ) ||
    ![true, false, null].includes(snapshot.source.dirty) ||
    !Array.isArray(snapshot.keep) ||
    !snapshot.keep.includes("base") ||
    !snapshot.keep.includes("arcade") ||
    snapshot.keep.some(
      (name) =>
        typeof name !== "string" || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(name),
    ) ||
    new Set(snapshot.keep).size !== snapshot.keep.length ||
    !snapshot.files ||
    Array.isArray(snapshot.files) ||
    typeof snapshot.files !== "object" ||
    id !== snapshotId(snapshot)
  )
    throw new Error("Invalid or changed framework provenance.");
  for (const [file, value] of Object.entries(snapshot.files)) {
    safeFile(root, file);
    if (
      file.startsWith(".sonae/") ||
      !value ||
      !/^[a-f0-9]{64}$/.test(value.sha256) ||
      typeof value.executable !== "boolean"
    )
      throw new Error(`Invalid fingerprint: ${file}`);
  }
  return { ...snapshot, id };
}
