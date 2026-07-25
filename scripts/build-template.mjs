#!/usr/bin/env node
/**
 * Produce the platform template from this repo.
 *
 * P4.3 asked for a `template/main` tag so new client products start as forks of
 * the platform rather than branches of this product. A tag made by hand — delete
 * the vertical folders, commit, tag — answers that once and then rots: six
 * months later nobody can say what the template is missing, and refreshing it
 * means redoing the same deletions from memory.
 *
 * So the template is *generated*, from `template.manifest.json`, and can be
 * regenerated from any commit. What that buys:
 *
 *  - The split is reviewable. The manifest is a list of paths and table names,
 *    not a diff of 400 deletions.
 *  - The split is testable. `src/template-boundary.test.ts` runs in the normal
 *    suite and fails when a vertical grows a file the manifest does not name, or
 *    when platform code starts importing a vertical.
 *  - Refreshing the template is one command, so it can happen every release
 *    instead of once.
 *
 * ### Two removal mechanisms, and why both are needed
 *
 * **Whole files** cover almost everything: a vertical owns its Convex modules,
 * its routes, its tests, its docs. Deleting a file cannot half-work.
 *
 * **Fence markers** — `template:remove:start <vertical>` … `template:remove:end`
 * — cover the four shared files a vertical unavoidably touches: the schema, the
 * HTTP router, the sidebar, and its own icon imports. Editing those by regex on
 * table or component names would be guesswork; a marker is placed by the person
 * who wrote the code, is visible while editing it, and is checked for balance by
 * the boundary test. If a shared file needs a marker in a fifth place, that is a
 * signal worth seeing rather than hiding.
 *
 * `package.json` takes neither: it is data, so dependencies and scripts are
 * removed by the names the manifest lists.
 *
 * ### What this deliberately does not do
 *
 * It only ever reads from git — `ls-files`, to learn what the repo consists of.
 * It writes a directory and stops there. Turning that directory into a branch or
 * a tag is a decision with a blast radius — force-pushing a shared
 * `template/main` is not something a build script should be able to do by
 * accident — so the operator does it, and the script prints exactly how.
 *
 * It does not run `convex codegen` either — that command contacts the Convex API
 * for deployment details, which a fresh template directory does not have. The
 * generated API index is pruned directly instead; see `pruneGeneratedApi`.
 *
 * Usage:
 *   node scripts/build-template.mjs --out ../sonae-template
 *   node scripts/build-template.mjs --out /tmp/t --dry-run
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MARKER_START = /^\s*(?:\/\/|\{\/\*)\s*template:remove:start\s+(\S+)\s*(?:\*\/\})?\s*$/;
const MARKER_END = /^\s*(?:\/\/|\{\/\*)\s*template:remove:end\s*(?:\*\/\})?\s*$/;

/** Never copied into the template, regardless of the manifest. */
const ALWAYS_SKIPPED = new Set(['node_modules', '.git', '.next', 'coverage', 'dist', '.turbo']);

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css', '.yml', '.yaml',
]);

export function readManifest(root = repoRoot) {
  return JSON.parse(fs.readFileSync(path.join(root, 'template.manifest.json'), 'utf8'));
}

/** Every repo-relative path the manifest says the template drops. */
export function collectRemovedPaths(manifest) {
  return [
    ...manifest.verticals.flatMap((vertical) => vertical.paths),
    ...(manifest.sharedVerticalPaths ?? []),
  ];
}

export function collectVerticalNames(manifest) {
  return manifest.verticals.map((vertical) => vertical.name);
}

/**
 * Strip every fenced block belonging to a removed vertical.
 *
 * Returns the new text plus the markers seen, so callers can report a marker
 * naming a vertical that no longer exists — a stale fence removes nothing and
 * would otherwise sit there looking like it does.
 */
export function stripFencedBlocks(contents, verticalNames) {
  const removable = new Set(verticalNames);
  const lines = contents.split('\n');
  const output = [];
  const seen = [];
  const unbalanced = [];

  let removingFor = null;

  for (const [index, line] of lines.entries()) {
    const start = MARKER_START.exec(line);
    if (start) {
      if (removingFor) unbalanced.push(`nested template:remove:start at line ${index + 1}`);
      seen.push(start[1]);
      removingFor = start[1];
      continue;
    }

    if (MARKER_END.test(line)) {
      if (!removingFor) unbalanced.push(`unmatched template:remove:end at line ${index + 1}`);
      removingFor = null;
      continue;
    }

    // A fence for a vertical this build keeps: drop the markers, keep the code.
    if (removingFor && !removable.has(removingFor)) output.push(line);
    if (!removingFor) output.push(line);
  }

  if (removingFor) unbalanced.push('template:remove:start never closed');

  return { contents: output.join('\n'), markers: seen, unbalanced };
}

/** Remove the manifest's dependencies and scripts from a parsed package.json. */
export function prunePackageJson(packageJson, manifest) {
  const next = structuredClone(packageJson);
  const removed = { dependencies: [], scripts: [] };

  for (const vertical of manifest.verticals) {
    for (const dependency of vertical.packageDependencies ?? []) {
      for (const field of ['dependencies', 'devDependencies']) {
        if (next[field]?.[dependency]) {
          delete next[field][dependency];
          removed.dependencies.push(dependency);
        }
      }
    }

    for (const scriptName of vertical.packageScripts ?? []) {
      if (next.scripts?.[scriptName]) {
        delete next.scripts[scriptName];
        removed.scripts.push(scriptName);
      }
    }

    for (const prefix of vertical.packageScriptPrefixes ?? []) {
      for (const scriptName of Object.keys(next.scripts ?? {})) {
        if (scriptName.startsWith(prefix)) {
          delete next.scripts[scriptName];
          removed.scripts.push(scriptName);
        }
      }
    }
  }

  return { packageJson: next, removed };
}

/**
 * The Convex module names the template drops — `convex/properties.ts` becomes
 * `properties`. Test files are excluded: they are not modules in the generated
 * API.
 */
export function collectRemovedConvexModules(manifest) {
  return collectRemovedPaths(manifest)
    .filter((entry) => entry.startsWith('convex/') && entry.endsWith('.ts'))
    .filter((entry) => !entry.endsWith('.test.ts'))
    .map((entry) => entry.slice('convex/'.length, -'.ts'.length))
    .filter((name) => !name.includes('/'));
}

/**
 * Prune `convex/_generated/api.d.ts` by hand.
 *
 * `npx convex codegen` is the proper way to rebuild this, but it contacts the
 * Convex API for deployment details, so it cannot run against a template
 * directory that has no deployment of its own — and a template that does not
 * typecheck until someone connects it to a Convex project is a template people
 * will assume is broken.
 *
 * The generated file is mechanical: each module contributes exactly one import
 * line and one property line, both containing the module name. Removing those
 * two lines produces the same file codegen would, which the operator confirms
 * the moment they run `npx convex dev`.
 */
export function pruneGeneratedApi(contents, removedModules) {
  const patterns = removedModules.flatMap((name) => [
    new RegExp(`^import type \\* as ${name} from "\\.\\./${name}\\.js";$`),
    new RegExp(`^\\s*${name}: typeof ${name};$`),
  ]);

  const lines = contents.split('\n');
  const kept = lines.filter((line) => !patterns.some((pattern) => pattern.test(line)));
  return { contents: kept.join('\n'), removedLines: lines.length - kept.length };
}

/** Delete a dotted key path from a parsed locale file. */
export function deleteLocaleKey(messages, dottedKey) {
  const segments = dottedKey.split('.');
  let node = messages;

  for (const segment of segments.slice(0, -1)) {
    if (typeof node !== 'object' || node === null || !(segment in node)) return false;
    node = node[segment];
  }

  const last = segments.at(-1);
  if (typeof node !== 'object' || node === null || !(last in node)) return false;
  delete node[last];
  return true;
}

function isUnderRemovedPath(relativePath, removedPaths) {
  return removedPaths.some(
    (removed) => relativePath === removed || relativePath.startsWith(`${removed}/`),
  );
}

/**
 * The files the repo actually consists of, according to git.
 *
 * Walking the filesystem is the obvious implementation and the wrong one: this
 * repo's git-ignored `tmp/` holds 46GB of movement replay analysis, and a walk
 * cheerfully tries to read it (a single 500MB JSON is past what Node will hold
 * in a string, so it does not even fail politely). Asking git also means the
 * template inherits `.gitignore` for free, which is the correct rule — the
 * template is a repo, so it should contain what a repo would contain.
 *
 * `--others --exclude-standard` includes files that are untracked but not
 * ignored, so a template built before its own work is committed still contains
 * that work.
 */
function listRepoFiles(root) {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  return output
    .split('\0')
    .filter(Boolean)
    .filter((file) => !ALWAYS_SKIPPED.has(file.split('/')[0]))
    // A deleted-but-still-tracked file is listed; it cannot be copied.
    .filter((file) => fs.existsSync(path.join(root, file)));
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const dryRun = args.includes('--dry-run');

  if (outIndex === -1 || !args[outIndex + 1]) {
    console.error('Usage: node scripts/build-template.mjs --out <dir> [--dry-run]');
    process.exit(1);
  }

  const outDir = path.resolve(args[outIndex + 1]);
  if (outDir === repoRoot) {
    console.error('Refusing to write the template over the product repo.');
    process.exit(1);
  }

  const manifest = readManifest();
  const removedPaths = collectRemovedPaths(manifest);
  const verticalNames = collectVerticalNames(manifest);
  const localeKeys = manifest.verticals.flatMap((vertical) => vertical.localeKeys ?? []);
  const removedModules = collectRemovedConvexModules(manifest);

  const missing = removedPaths.filter((entry) => !fs.existsSync(path.join(repoRoot, entry)));
  if (missing.length > 0) {
    console.error('template.manifest.json names paths that do not exist:');
    for (const entry of missing) console.error(`  ${entry}`);
    process.exit(1);
  }

  const regeneratedSnapshots = manifest.regeneratedSnapshots?.paths ?? [];
  const allFiles = listRepoFiles(repoRoot);
  const kept = allFiles
    .filter((file) => !isUnderRemovedPath(file, removedPaths))
    // Recorded against the product's navigation; the template records its own.
    .filter((file) => !regeneratedSnapshots.includes(file));

  const stats = {
    copied: 0,
    removedFiles: allFiles.length - kept.length,
    fenced: 0,
    localeKeys: 0,
    generatedApiLines: 0,
  };
  const staleMarkers = [];
  const brokenMarkers = [];

  if (!dryRun) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const file of kept) {
    const source = path.join(repoRoot, file);
    const target = path.join(outDir, file);
    const extension = path.extname(file);

    if (!TEXT_EXTENSIONS.has(extension)) {
      stats.copied += 1;
      if (!dryRun) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      }
      continue;
    }

    let contents = fs.readFileSync(source, 'utf8');

    if (contents.includes('template:remove:')) {
      const result = stripFencedBlocks(contents, verticalNames);
      if (result.contents !== contents) stats.fenced += 1;
      contents = result.contents;
      for (const marker of result.markers) {
        if (!verticalNames.includes(marker)) staleMarkers.push(`${file}: ${marker}`);
      }
      for (const problem of result.unbalanced) brokenMarkers.push(`${file}: ${problem}`);
    }

    if (file === 'convex/_generated/api.d.ts') {
      const { contents: pruned, removedLines } = pruneGeneratedApi(contents, removedModules);
      contents = pruned;
      stats.generatedApiLines = removedLines;
    }

    if (file === 'template.manifest.json') {
      // The template keeps the machinery but starts with nothing to remove: its
      // verticals have already gone, and a copy of this repo's manifest would
      // describe files the template does not have. The boundary test then reads
      // as green from day one and starts working the moment the new product
      // declares its first vertical.
      contents = `${JSON.stringify(
        {
          note: 'Product verticals this repo would strip when cutting its own template. Empty because this repo IS the template — add an entry when the product grows something that will not belong in the next one. See scripts/build-template.mjs and src/template-boundary.test.ts.',
          templateName: manifest.templateName,
          verticals: [],
          sharedVerticalPaths: [],
          regeneratedSnapshots: { paths: [], reason: '' },
          keptDeliberately: {},
        },
        null,
        2,
      )}\n`;
    }

    if (file === 'package.json') {
      const { packageJson, removed } = prunePackageJson(JSON.parse(contents), manifest);
      contents = `${JSON.stringify(packageJson, null, 2)}\n`;
      console.log(
        `package.json: removed ${removed.dependencies.length} dependencies, ${removed.scripts.length} scripts`,
      );
    }

    if (file.startsWith('messages/') && extension === '.json' && localeKeys.length > 0) {
      const messages = JSON.parse(contents);
      for (const key of localeKeys) {
        if (deleteLocaleKey(messages, key)) stats.localeKeys += 1;
      }
      contents = `${JSON.stringify(messages, null, 2)}\n`;
    }

    stats.copied += 1;
    if (!dryRun) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
  }

  if (brokenMarkers.length > 0) {
    console.error('Unbalanced fence markers — the template would be malformed:');
    for (const problem of brokenMarkers) console.error(`  ${problem}`);
    process.exit(1);
  }

  if (staleMarkers.length > 0) {
    console.error('Fence markers naming a vertical that is not in the manifest:');
    for (const marker of staleMarkers) console.error(`  ${marker}`);
    process.exit(1);
  }

  console.log(`\nTemplate ${dryRun ? 'preview' : 'written to ' + outDir}`);
  console.log(`  files copied:        ${stats.copied}`);
  console.log(`  files dropped:       ${stats.removedFiles}`);
  console.log(`  files de-fenced:     ${stats.fenced}`);
  console.log(`  locale keys removed: ${stats.localeKeys}`);
  console.log(`  generated api lines: ${stats.generatedApiLines}`);
  console.log(`  verticals dropped:   ${verticalNames.join(', ')}`);

  if (!dryRun) {
    console.log('\nFinish it off in the output directory:');
    console.log('  npm install                 # lockfile still lists the dropped packages');
    console.log('  npx vitest run              # records the template\'s own nav snapshots');
    console.log('  npx convex dev              # confirms the pruned convex/_generated matches codegen');
    console.log('  npm run typecheck && npm run lint && npm run test:run && npm run build');
    console.log('\nThen publish it, once you are happy:');
    console.log('  git init && git add -A && git commit -m "chore: platform template"');
    console.log('  git tag template/main');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
