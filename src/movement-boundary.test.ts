import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Keeps the movement demo's weight off the platform.
 *
 * The demo needs three.js, MediaPipe, TensorFlow and a webcam pipeline. Those
 * are large — three.js alone is ~4.3MB of client chunks — and no platform route
 * should pay for them. Today it does not: they are code-split away from the
 * ~450KB shared root bundle, purely because nothing outside the demo imports
 * them.
 *
 * That is a property nobody can see while editing, so it silently regresses.
 * `src/ui/components/Robot.tsx` had already drifted: a generated 3D component
 * sitting in the platform's shared UI folder importing four 3D libraries,
 * rendered by nothing. It was one import away from pulling three.js into a
 * shared chunk. It now lives with the demo.
 *
 * The demo itself is deliberately untouched — this fences it, it does not
 * shrink it. See docs/plans/active/platform-hardening-plan.md (P2.2).
 */

const repoRoot = process.cwd();

/** Heavy rendering / ML dependencies that belong to the movement demo only. */
const DEMO_ONLY_PACKAGES = [
  "three",
  "three-stdlib",
  "@pixiv/three-vrm",
  "@mediapipe/tasks-vision",
  "@react-three/fiber",
  "@react-three/drei",
  "react-webcam",
  "kalidokit",
  "@tensorflow/tfjs-core",
  "@tensorflow/tfjs-backend-webgl",
  "@tensorflow/tfjs-converter",
  "@tensorflow-models/body-pix",
];

/** Areas that own the movement demo and may import the packages above. */
const DEMO_AREAS = ["src/app/(dashboard)/demos/", "src/lib/movements/"];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

function toRepoRelative(filePath: string) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isDemoFile(relativePath: string) {
  return DEMO_AREAS.some((area) => relativePath.startsWith(area));
}

/** Matches `from "pkg"` and `import("pkg")`, including subpath imports. */
function importsPackage(contents: string, packageName: string) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:from|import\\()\\s*["'\`]${escaped}(?:/[^"'\`]*)?["'\`]`).test(contents);
}

describe("movement demo boundary", () => {
  test("platform code does not import the demo's heavy rendering or ML packages", () => {
    const violations: string[] = [];

    for (const filePath of walk(path.join(repoRoot, "src"))) {
      const relativePath = toRepoRelative(filePath);
      if (isDemoFile(relativePath)) continue;
      if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) continue;
      // This file names the packages in order to forbid them.
      if (relativePath === "src/movement-boundary.test.ts") continue;

      const contents = fs.readFileSync(filePath, "utf8");
      for (const packageName of DEMO_ONLY_PACKAGES) {
        if (importsPackage(contents, packageName)) {
          violations.push(`${relativePath} imports ${packageName}`);
        }
      }
    }

    expect(
      violations,
      [
        "Platform code must not import the movement demo's heavy dependencies:",
        "they would be pulled into shared client chunks that every route downloads.",
        "Keep such components inside src/app/(dashboard)/demos/ or src/lib/movements/.",
        "",
        ...violations,
      ].join("\n"),
    ).toEqual([]);
  });

  test("platform code does not import from the demo directories", () => {
    // A platform file importing a demo module would drag the same dependencies
    // in transitively, which the package check above would not catch.
    const violations: string[] = [];

    for (const filePath of walk(path.join(repoRoot, "src"))) {
      const relativePath = toRepoRelative(filePath);
      if (isDemoFile(relativePath)) continue;
      if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) continue;
      if (relativePath === "src/movement-boundary.test.ts") continue;

      const contents = fs.readFileSync(filePath, "utf8");
      if (/(?:from|import\()\s*["'`][^"'`]*(?:\/demos\/|lib\/movements)[^"'`]*["'`]/.test(contents)) {
        violations.push(relativePath);
      }
    }

    expect(
      violations,
      `Platform code must not import movement demo modules:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  test("every guarded package is actually installed", () => {
    // Otherwise a package removed or renamed upstream would quietly empty this
    // guard while the test kept passing. Checked against node_modules rather
    // than package.json because some, like three-stdlib, arrive transitively
    // and are still imported directly — that is exactly how Robot.tsx pulled
    // three.js into the platform's shared UI folder.
    const missing = DEMO_ONLY_PACKAGES.filter(
      (name) => !fs.existsSync(path.join(repoRoot, "node_modules", name)),
    );

    expect(
      missing,
      `These packages are guarded against but are not installed; remove them from the list:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});
