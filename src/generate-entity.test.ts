import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

/**
 * Acceptance tests for `scripts/generate-entity.mjs`.
 *
 * A generator is only worth having if what it emits passes the gates the repo
 * already enforces. The parts most often skipped when an entity is added by
 * hand — the tenant guard, the second locale, the test — are exactly the parts
 * asserted here, because a generator that quietly omits one of them makes the
 * problem worse: it produces the omission at scale, with the appearance of
 * having been done properly.
 *
 * Runs against a throwaway copy of the files the generator writes to, so it
 * never touches the real `messages/*.json`.
 */

const repoRoot = process.cwd();
const generator = path.join(repoRoot, 'scripts', 'generate-entity.mjs');

let sandbox: string;

/** A minimal tree with the two locale files the generator edits in place. */
function createSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entity-gen-'));
  fs.mkdirSync(path.join(dir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
  for (const locale of ['en', 'it']) {
    fs.writeFileSync(
      path.join(dir, 'messages', `${locale}.json`),
      `${JSON.stringify({ admin: {} }, null, 4)}\n`,
    );
  }
  return dir;
}

function run(args: string[]) {
  return execFileSync('node', [generator, ...args], { cwd: sandbox, encoding: 'utf8' });
}

function readGenerated(relative: string) {
  return fs.readFileSync(path.join(sandbox, relative), 'utf8');
}

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('entity generator', () => {
  test('writes the Convex module, its test, and the admin page', () => {
    run(['supplier', '--field', 'name:string']);

    expect(fs.existsSync(path.join(sandbox, 'convex/suppliers.ts'))).toBe(true);
    expect(fs.existsSync(path.join(sandbox, 'convex/suppliers.test.ts'))).toBe(true);
    expect(fs.existsSync(path.join(sandbox, 'src/app/(dashboard)/admin/suppliers/page.tsx'))).toBe(true);
  });

  test('declares every function with a tenant builder', () => {
    // `authzEnforcement.test.ts` fails CI for a client-callable function using a
    // raw query/mutation, and its allowlist may only shrink. A generator that
    // emitted raw builders would break the build on first use — or, worse, get
    // itself added to the allowlist.
    run(['supplier', '--field', 'name:string']);

    const generatedModule = readGenerated('convex/suppliers.ts');

    expect(generatedModule).toContain('adminQuery({');
    expect(generatedModule).toContain('adminMutation({');
    expect(generatedModule).not.toMatch(/=\s*query\(/);
    expect(generatedModule).not.toMatch(/=\s*mutation\(/);
  });

  test('scopes reads to the caller company at the index', () => {
    // Filtering after the read is something a later edit can drop with nothing
    // failing; an index scope cannot be dropped without the query breaking.
    run(['supplier', '--field', 'name:string']);

    const generatedModule = readGenerated('convex/suppliers.ts');

    expect(generatedModule).toContain('withIndex("by_company"');
    expect(generatedModule).toContain('requireTenant(ctx)');
    expect(generatedModule).toContain('assertTenantAccess(ctx, record)');
  });

  test('every mutation checks tenancy before writing', () => {
    run(['supplier', '--field', 'name:string']);

    const generatedModule = readGenerated('convex/suppliers.ts');
    const mutations = generatedModule.split('adminMutation({').slice(1);

    expect(mutations.length).toBeGreaterThanOrEqual(3);
    for (const body of mutations) {
      // Create scopes by requiring a tenant; update and delete by asserting
      // access to the record they are about to touch.
      expect(body).toMatch(/requireTenant\(ctx\)|assertTenantAccess\(ctx, record\)/);
    }
  });

  test('generates a test that asserts the tenant boundary, not a placeholder', () => {
    // The assertion most worth having and the first one deferred by hand.
    run(['supplier', '--field', 'name:string']);

    const generatedTest = readGenerated('convex/suppliers.test.ts');

    expect(generatedTest).toContain("cannot read another's records");
    expect(generatedTest).toContain('rejects.toThrow()');
    expect(generatedTest).not.toContain('todo');
    expect(generatedTest).not.toContain('skip');
  });

  test('writes both locales, not just English', () => {
    // A key in one locale and missing from the other renders as the raw key to
    // whoever is reading in the other language.
    run(['supplier', '--field', 'name:string']);

    const en = JSON.parse(readGenerated('messages/en.json'));
    const it = JSON.parse(readGenerated('messages/it.json'));

    expect(Object.keys(en.admin.suppliers).sort()).toEqual(Object.keys(it.admin.suppliers).sort());
    expect(it.admin.suppliers.title).toBeDefined();
    // Italian is genuinely translated rather than English copied across.
    expect(it.admin.suppliers.actions.delete).not.toBe(en.admin.suppliers.actions.delete);
  });

  test('gives every declared field a column label in both locales', () => {
    run(['supplier', '--field', 'name:string', '--field', 'active:boolean']);

    for (const locale of ['en', 'it']) {
      const messages = JSON.parse(readGenerated(`messages/${locale}.json`));
      expect(Object.keys(messages.admin.suppliers.columns)).toEqual(
        expect.arrayContaining(['name', 'active', 'actions']),
      );
    }
  });

  test('refuses to overwrite existing files', () => {
    // Half-generating over someone's work is worse than refusing.
    run(['supplier', '--field', 'name:string']);
    const before = readGenerated('convex/suppliers.ts');

    expect(() => run(['supplier', '--field', 'name:string'])).toThrow();
    expect(readGenerated('convex/suppliers.ts')).toBe(before);
  });

  test('touches nothing on a dry run', () => {
    run(['supplier', '--field', 'name:string', '--dry-run']);

    expect(fs.existsSync(path.join(sandbox, 'convex/suppliers.ts'))).toBe(false);
    expect(JSON.parse(readGenerated('messages/en.json')).admin.suppliers).toBeUndefined();
  });

  test('rejects an unknown field type instead of emitting broken code', () => {
    expect(() => run(['supplier', '--field', 'name:datetime'])).toThrow();
    expect(fs.existsSync(path.join(sandbox, 'convex/suppliers.ts'))).toBe(false);
  });

  test('reports the table name it chose so a bad guess is obvious', () => {
    // Pluralisation is deliberately naive. Printing the result makes "supplys"
    // a one-character fix rather than a surprise discovered later in the schema.
    const output = run(['company-policy', '--field', 'name:string', '--dry-run']);
    expect(output).toContain('companyPolicies');
    expect(output).toContain('/admin/company-policies');
  });

  test('defaults to a name field when none is given', () => {
    // An entity with no columns produces a table with nothing to show.
    run(['supplier']);
    expect(readGenerated('convex/suppliers.ts')).toContain('name: v.string()');
  });
});
