/**
 * Shared source-scanning helpers for the drift guards.
 *
 * The guards read this repository's own source as text and assert properties a
 * type system cannot: that a screen pages on the server, that a runtime keeps
 * its safety spine, that a broad read stays classified. Each one used to carry
 * its own copy of the walking and extraction it needed.
 */
import fs from 'fs';
import path from 'path';

export const repoRoot = process.cwd();

/**
 * A screen fetches one page at a time from the server.
 *
 * Several guards below are named for this and used to assert the literal word
 * `usePaginatedQuery`, which stopped being the whole story once
 * `useServerPagedTable` existed — that hook calls `usePaginatedQuery` and adds
 * the numbered footer on top, so a screen using it pages exactly as before.
 * Spelled out here once so the next screen to move onto the house footer does
 * not read as a regression in six places at once.
 *
 * What each guard still checks for itself is the query: swapping the paged one
 * for a query that returns everything fails, which is the fault worth catching.
 */
export const PAGES_ON_THE_SERVER = /usePaginatedQuery|useServerPagedTable/;

export const walkFiles = (dir: string, extensions: ReadonlySet<string>): string[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(fullPath, extensions);
    }

    return extensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
};

export const relativePath = (filePath: string) => path.relative(repoRoot, filePath);
/**
 * A repo file's contents, or the empty string when it is not there.
 *
 * Several guards name a file and then assert the contents are not empty, so
 * that a check cannot pass by reading nothing. Throwing on a missing file made
 * those assertions unreachable: the gate still held, but the developer saw
 * `ENOENT` instead of the sentence written to explain what had moved and why
 * it mattered. Returning empty lets the assertion do its job and say its piece.
 */
export const readRepoFile = (relativeFilePath: string) => {
  const fullPath = path.join(repoRoot, relativeFilePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

/**
 * The source of one exported declaration, up to the next *exported* one.
 *
 * Module-private helpers in between are included, which is what the reachability
 * guards below want: a query written in a private helper is still a query that
 * export performs.
 */
export const extractExportBody = (relativeFilePath: string, exportName: string) => {
  const contents = readRepoFile(relativeFilePath);
  const startNeedle = `export const ${exportName} =`;
  const startIndex = contents.indexOf(startNeedle);

  if (startIndex === -1) {
    return '';
  }

  const body = contents.slice(startIndex);
  const nextExportMatch = /\nexport (?:const|async function|function) \w+/.exec(body.slice(startNeedle.length));

  return nextExportMatch ? body.slice(0, startNeedle.length + nextExportMatch.index) : body;
};

/**
 * The source of one top-level declaration, exported or not, up to the next
 * top-level declaration of any kind.
 *
 * Stricter than `extractExportBody` in both directions, and both properties
 * matter for the agent runtime spine. It can see a module-private function — a
 * safety helper is no less required for living in one — and it stops at the
 * next declaration, so a check on one function cannot be satisfied by code that
 * happens to sit below it.
 */
export const extractDeclarationBody = (relativeFilePath: string, declarationName: string) => {
  const contents = readRepoFile(relativeFilePath);
  const startPattern = new RegExp(
    `^(?:export )?(?:const ${declarationName}\\s*=|(?:async )?function ${declarationName}\\s*\\()`,
    'm',
  );
  const startMatch = startPattern.exec(contents);

  if (!startMatch) {
    return '';
  }

  const bodyStart = startMatch.index;
  const afterSignature = contents.slice(bodyStart + startMatch[0].length);
  const nextDeclaration = /^(?:export )?(?:const|type|async function|function) \w+/m.exec(afterSignature);

  return nextDeclaration
    ? contents.slice(bodyStart, bodyStart + startMatch[0].length + nextDeclaration.index)
    : contents.slice(bodyStart);
};

export const queryBlocksForTable = (body: string, tableName: string) => {
  const queryPattern = new RegExp(`ctx\\.db\\s*\\.query\\("${tableName}"\\)`, 'g');

  return Array.from(body.matchAll(queryPattern)).map((match) => {
    const startIndex = match.index ?? 0;
    const rest = body.slice(startIndex);
    const endIndex = rest.indexOf(';');

    return endIndex === -1 ? rest : rest.slice(0, endIndex + 1);
  });
};

export const repoTextExtensions = new Set(['.js', '.jsx', '.json', '.md', '.mjs', '.ts', '.tsx', '.zsh']);
export const ignoredRepoPathPrefixes = [
  '.git/',
  '.agent/',
  // A git worktree is a second checkout of this same repo. Scanning it reports
  // every finding twice against a path nobody edits, and the copy may sit on an
  // older commit — so this guardrail would fail on language already fixed here.
  '.claude/worktrees/',
  '.next/',
  'node_modules/',
  'package-lock.json',
  'playwright-report/',
  'public/models/',
  'tmp/',
  'tsconfig.tsbuildinfo',
];

export const isIgnoredRepoFile = (filePath: string) => {
  const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

  return ignoredRepoPathPrefixes.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(prefix));
};

export const walkRepoFiles = (dir: string, extensions: ReadonlySet<string>): string[] => {
  if (!fs.existsSync(dir) || isIgnoredRepoFile(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (isIgnoredRepoFile(fullPath)) {
      return [];
    }

    if (entry.isDirectory()) {
      return walkRepoFiles(fullPath, extensions);
    }

    return extensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
};
