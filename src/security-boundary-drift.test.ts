import { describe, expect, test } from "vitest";

import { readRepoFile, relativePath, repoRoot, walkFiles } from "./test/driftUtils";

describe("security boundary drift", () => {
  test("third-party GitHub Actions are pinned to immutable commits", () => {
    const workflows = walkFiles(`${repoRoot}/.github/workflows`, new Set([".yml", ".yaml"]))
      .map(relativePath);
    expect(workflows.length).toBeGreaterThan(0);
    const unpinned = workflows.flatMap((file) => {
      const source = readRepoFile(file);
      return [...source.matchAll(/^\s*uses:\s*([^\s#]+)/gm)]
        .map((match) => match[1])
        .filter((action) => !action.startsWith("./"))
        .filter((action) => !/@[0-9a-f]{40}$/.test(action))
        .map((action) => `${file}: ${action}`);
    });

    expect(unpinned, `Pin these Actions to full commit SHAs:\n${unpinned.join("\n")}`).toEqual([]);
  });

  test("CI dependency tools are lockfile-backed and exactly pinned", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      devDependencies?: Record<string, string>;
    };
    const packageLock = JSON.parse(readRepoFile("package-lock.json")) as {
      packages?: Record<string, { version?: string }>;
    };
    const workflows = walkFiles(`${repoRoot}/.github/workflows`, new Set([".yml", ".yaml"]))
      .map(relativePath)
      .map(readRepoFile)
      .join("\n");

    const socketPackage = JSON.parse(readRepoFile("tools/socket-ci/package.json")) as {
      dependencies?: Record<string, string>;
    };
    const socketLock = JSON.parse(readRepoFile("tools/socket-ci/package-lock.json")) as {
      packages?: Record<string, { version?: string; integrity?: string }>;
    };
    expect(packageJson.devDependencies?.socket).toBeUndefined();
    expect(packageLock.packages?.["node_modules/socket"]).toBeUndefined();
    expect(socketPackage.dependencies?.socket).toBe("1.1.158");
    expect(socketLock.packages?.["node_modules/socket"]?.version).toBe("1.1.158");
    expect(socketLock.packages?.["node_modules/socket"]?.integrity).toMatch(/^sha512-/);
    expect(workflows).not.toMatch(/\bnpx\s+[^\n]*\bsocket(?:@|\s)/);
    expect(workflows).toContain("npm ci --prefix tools/socket-ci --omit=optional --ignore-scripts");
    expect(workflows).toContain("./tools/socket-ci/node_modules/.bin/socket ci");

    const lockedRollup = packageLock.packages?.["node_modules/@rollup/rollup-linux-x64-gnu"]?.version;
    expect(lockedRollup).toBeTruthy();
    const rollupInstalls = [...workflows.matchAll(
      /npm install @rollup\/rollup-linux-x64-gnu@([^\s]+) --no-save --ignore-scripts/g,
    )].map((match) => match[1]);
    expect(rollupInstalls.length).toBeGreaterThan(0);
    expect(new Set(rollupInstalls)).toEqual(new Set([lockedRollup]));
  });

  test("local-only authentication and seed doors require an explicit local label", () => {
    expect(readRepoFile("convex/localTestAuth.ts")).toContain(
      'process.env.LOCAL_TEST_AUTH_ENVIRONMENT !== "local"',
    );
    expect(readRepoFile("convex/localDemoSeed.ts")).toContain(
      'process.env.LOCAL_DEMO_SEED_ENVIRONMENT !== "local"',
    );
    const e2eGate = readRepoFile("src/lib/e2eAuthEnvironment.ts");
    expect(e2eGate).toContain('environment.E2E_AUTH_ENVIRONMENT === "local"');
    expect(e2eGate).toContain('environment.NODE_ENV !== "production"');
  });

  test("bespoke provisioning keeps secrets off argv and separates deployment from runtime", () => {
    const master = readRepoFile("bespoke-installation/master-setup.zsh");
    const github = readRepoFile("bespoke-installation/provision-github.zsh");
    const gcp = readRepoFile("bespoke-installation/provision-gcp.zsh");
    const ci = readRepoFile(".github/workflows/ci.yml");

    expect(master).toContain('mktemp -d "${TMPDIR:-/tmp}/hakken-provision.XXXXXX"');
    expect(master).toContain('DEPLOY_KEY_TARGET=${DEPLOY_KEY_PREFIX#*:}');
    expect(master).toContain('"$DEPLOY_KEY_TARGET" != "$CONVEX_DEPLOYMENT"');
    expect(master).toContain("npx convex env set \"$name\" --prod");
    expect(github).not.toContain("--body");
    expect(github).toContain('--repo "$GITHUB_REPOSITORY"');
    expect(ci).not.toContain('npx convex env set LOCAL_TEST_AUTH_SECRET "$LOCAL_TEST_AUTH_SECRET"');
    expect(ci).toContain("printf '%s' \"$LOCAL_TEST_AUTH_SECRET\" | npx convex env set LOCAL_TEST_AUTH_SECRET");
    expect(gcp).toContain('DEPLOYER_ACCOUNT_NAME="github-deployer"');
    expect(gcp).toContain('RUNTIME_ACCOUNT_NAME="hakken-runtime"');
    const deployerRoles = gcp.match(/ROLES=\(([\s\S]*?)\)/)?.[1] ?? "";
    expect(deployerRoles).not.toContain("roles/aiplatform.user");
    expect(gcp).not.toContain("roles/storage.admin");
  });
});
