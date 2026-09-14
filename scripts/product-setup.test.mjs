import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { frameworkRoot, readProduct, validateProduct } from "./product-config.mjs";
import { requiredEnvironmentKeys, evaluateProviderRequirements } from "./provider-requirements.mjs";
import { evaluateSetup, loadSetupEnv } from "./validate-setup.mjs";
import { deploymentMain, evaluateDeployment, parseEnvListOutput } from "./verify-deployment-environment.mjs";
import { applyProduct, buildProductEnvironment, planProduct } from "./init-product.mjs";

const roots = [];
function temporary() { const root = fs.mkdtempSync(path.join(os.tmpdir(), "sonae-product-test-")); roots.push(root); return root; }
const targetFiles = [
  "src/no-client-specific-fallbacks.test.ts", "sonae.product.json", "package.json", "package-lock.json", "template.verticals.json", "AGENTS.md", "README.md",
  "scripts/strip-verticals.mjs", "src/app/layout.tsx", "src/app/(public)/_components/PublicNav.tsx",
  "src/app/(public)/_components/PublicFooter.tsx", "convex/settingsService.ts", ".github/workflows/deploy.yml",
];
function fixture() {
  const root = temporary();
  for (const relative of targetFiles) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(frameworkRoot, relative), target);
  }
  return root;
}
function product() {
  const config = structuredClone(readProduct());
  config.identity = { ...config.identity, name: "Acme & Co", slug: "acme", title: "Acme portal", description: "Customer workspace", tagline: "Help for every customer." };
  config.deployment = { ...config.deployment, repositoryUrl: "https://github.com/example/acme.git", appUrl: "https://app.acme.example", service: "acme-app", artifactRepository: "acme-repo" };
  config.bootstrap.adminEmail = "owner@acme.example";
  config.email = { senderName: "Acme", senderAddress: "hello@acme.example" };
  return config;
}
function minimal() {
  const config = product();
  config.providers = { auth: ["resend"], ai: ["openai"] };
  config.features = Object.fromEntries(Object.keys(config.features).map(key => [key, false]));
  return config;
}
function envFor(config) {
  return {
    ...Object.fromEntries(requiredEnvironmentKeys(config).map(key => [key, "fixture-only"])),
    CONVEX_DEPLOYMENT: "prod:fixture", NEXT_PUBLIC_CONVEX_URL: "https://fixture.convex.cloud",
    CONVEX_SITE_URL: "https://fixture.convex.site", NEXT_PUBLIC_APP_URL: config.deployment.appUrl,
    SITE_URL: config.deployment.appUrl, INITIAL_SUPER_ADMIN_EMAIL: "admin@acme.example",
    ...(requiredEnvironmentKeys(config).includes("RESEND_API_KEY") ? { RESEND_FROM_EMAIL: "Acme <hello@acme.example>" } : {}),
  };
}
function snapshot(root) {
  const result = {};
  const walk = (relative = "") => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(name);
      else result[name] = fs.readFileSync(path.join(root, name), "utf8");
    }
  };
  walk();
  return result;
}
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("product configuration", () => {
  it("accepts the framework's unchanged defaults", () => { expect(validateProduct(readProduct()).schemaVersion).toBe(1); });
  it.each([
    config => { config.providers.ai = ["unsupported"]; },
    config => { config.providers.auth = []; },
    config => { config.providers.auth = ["google", "google"]; },
    config => { config.identity.slug = "../../escape"; },
    config => { config.deployment.service = "x\nEVIL: true"; },
    config => { config.identity.logoUrlLight = "javascript:alert(1)"; },
    config => { config.deployment.appUrl = "https://user:pass@example.com"; },
    config => { config.deployment.appUrl = "https://example.com/path"; },
    config => { config.bootstrap.adminEmail = "broken"; },
    config => { config.email.senderAddress = "noreply@unconfigured.invalid"; },
    config => { config.features.knowledge = "false"; },
    config => { config.schemaVersion = 2; },
  ])("rejects invalid or unsafe configuration", mutate => { const config = product(); mutate(config); expect(() => validateProduct(config)).toThrow(); });
  it("does not print an unknown secret key or its value", () => {
    const config = product(); config.providers.PRIVATE_SECRET = "do-not-print-this";
    try { validateProduct(config); throw new Error("accepted"); }
    catch (error) { expect(error.message).toContain("unknown field"); expect(error.message).not.toMatch(/PRIVATE_SECRET|do-not-print-this/); }
  });
});

describe("shared setup requirements", () => {
  it.each(["openai", "anthropic", "openrouter", "vertex"])("supports %s without requiring Google sign-in", provider => {
    const config = minimal(); config.providers.ai = [provider]; const env = envFor(config);
    expect(evaluateSetup(env, config, { profile: "production" }).ok).toBe(true);
    expect(evaluateDeployment([], Object.keys(env), config).missingRequired).toEqual([]);
    expect(requiredEnvironmentKeys(config)).not.toContain("AUTH_GOOGLE_ID");
    if (provider !== "vertex") expect(requiredEnvironmentKeys(config)).not.toContain("GOOGLE_PRIVATE_KEY");
  });
  it("allows an explicitly non-AI product", () => { const config = minimal(); config.providers.ai = []; expect(requiredEnvironmentKeys(config)).not.toContain("OPENAI_API_KEY"); });
  it("supports Google-only sign-in without email credentials", () => {
    const config = minimal(); config.providers.auth = ["google"];
    const env = envFor(config);
    expect(evaluateSetup(env, config, { profile: "production" }).ok).toBe(true);
    expect(evaluateDeployment([], Object.keys(env), config).missingRequired).toEqual([]);
    expect(requiredEnvironmentKeys(config)).not.toContain("RESEND_API_KEY");
  });
  it("redacts a failed deployment CLI's output, using a stub instead of contacting Convex", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn(() => { const error = new Error("DO_NOT_PRINT"); error.stderr = "PRIVATE_VALUE"; throw error; });
    expect(deploymentMain([], run)).toBe(1);
    expect(run.mock.calls[0][1]).toEqual(["--no-install", "convex", "env", "list"]);
    expect(log.mock.calls.flat().join()).not.toMatch(/DO_NOT_PRINT|PRIVATE_VALUE/);
  });
  it("requires Vertex for knowledge even when text generation uses another provider", () => {
    const config = minimal(); config.features.knowledge = true;
    const result = evaluateDeployment([], Object.keys(envFor(minimal())), config);
    expect(result.missingRequired).toContain("GOOGLE_PRIVATE_KEY");
  });
  it("accepts the same existing sender and OpenAI aliases in both checkers", () => {
    const config = minimal(); const env = envFor(config);
    env.AUTH_EMAIL = env.RESEND_FROM_EMAIL; delete env.RESEND_FROM_EMAIL;
    env.OPEN_AI_API_KEY = env.OPENAI_API_KEY; delete env.OPENAI_API_KEY;
    expect(evaluateSetup(env, config, { profile: "production" }).ok).toBe(true);
    expect(evaluateDeployment([], Object.keys(env), config).missingRequired).toEqual([]);
  });
  it("catches a half-configured optional integration in both checkers", () => {
    const config = minimal(); const env = { ...envFor(config), CONNECTOR_GOOGLE_CLIENT_ID: "fixture" };
    expect(evaluateSetup(env, config, { profile: "production" }).failures.join()).toContain("CONNECTOR_GOOGLE_CLIENT_SECRET");
    expect(evaluateDeployment([], Object.keys(env), config).missingRequired).toContain("CONNECTOR_GOOGLE_CLIENT_SECRET");
  });
  it("requires SDK signing keys as well as the bootstrap admin", () => {
    const config = minimal(); const env = envFor(config); delete env.JWKS;
    expect(evaluateSetup(env, config, { profile: "production" }).failures.join()).toContain("JWKS");
    expect(evaluateDeployment([], Object.keys(env), config).missingRequired).toContain("JWKS");
  });
  it("preserves a credential-free local path, with strict warnings available", () => {
    const env = { NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210", CONVEX_DEPLOYMENT: "anonymous:fixture" };
    expect(evaluateSetup(env, product()).ok).toBe(true);
    expect(evaluateSetup(env, product(), { strict: true }).ok).toBe(false);
  });
  it.each(["http://example.com", "https://localhost", "https://127.0.0.2", "https://[::1]", "https://other.example"])("rejects wrong production app origin %s", url => {
    const config = minimal(); const env = { ...envFor(config), SITE_URL: url };
    expect(evaluateSetup(env, config, { profile: "production" }).ok).toBe(false);
  });
  it("reports newly introduced backend keys", () => { expect(evaluateDeployment(["NEW_KEY"], [], minimal()).unclassified).toEqual(["NEW_KEY"]); });
  it("does not count empty deployment values as present", () => { expect(parseEnvListOutput('EMPTY=\nSPACE=  \nQUOTED=""\nGOOD=fixture\n')).toEqual(["GOOD"]); });
  it("parses multiline PEM and dotenv comments with explicit override precedence", () => {
    const root = temporary(); fs.writeFileSync(path.join(root, ".env"), 'JWT_PRIVATE_KEY="first\nsecond"\nSITE_URL="https://file.example" # comment\n');
    fs.writeFileSync(path.join(root, ".env.local"), 'SITE_URL=https://local.example\n');
    const env = loadSetupEnv(root, { SITE_URL: "https://override.example" });
    expect(env.JWT_PRIVATE_KEY).toBe("first\nsecond"); expect(env.SITE_URL).toBe("https://override.example");
  });
  it("does not warn about disabled, wholly unconfigured features", () => { expect(evaluateProviderRequirements(minimal(), Object.keys(envFor(minimal()))).warnings).toEqual([]); });
});

describe("product initialiser on temporary clones", () => {
  it("previews without changing any file", () => { const root = fixture(); const before = snapshot(root); expect(planProduct(root, product()).changes.length).toBeGreaterThan(0); expect(snapshot(root)).toEqual(before); });
  it("applies a complete product and is idempotent", () => {
    const root = fixture(); const config = product(); const before = snapshot(root); applyProduct(planProduct(root, config));
    expect(readProduct(root)).toEqual(config);
    expect(planProduct(root, config).changes).toEqual([]);
    expect(fs.readFileSync(path.join(root, "convex/settingsService.ts"), "utf8")).toContain("platformName: productIdentity.name");
    expect(fs.readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf8")).toContain("SERVICE: acme-app");
    const publicModule = fs.readFileSync(path.join(root, "product.identity.ts"), "utf8");
    expect(publicModule).not.toMatch(/owner@|senderAddress|providers|repositoryUrl/);
    expect(publicModule).toContain(config.identity.title);
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain(config.deployment.repositoryUrl);
    const oldLock = JSON.parse(before["package-lock.json"]); const newLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    oldLock.name = config.identity.slug; oldLock.packages[""].name = config.identity.slug;
    expect(newLock).toEqual(oldLock);
    expect(fs.readFileSync(path.join(root, "template.verticals.json"), "utf8")).toBe(before["template.verticals.json"]);
    expect(fs.readFileSync(path.join(root, "src/app/(public)/_components/PublicFooter.tsx"), "utf8")).toContain("Powered by Ronins");
    expect(fs.existsSync(path.join(root, ".env.local"))).toBe(false);
  });
  it("updates an initialised product from a revised configuration", () => {
    const root = fixture(); const config = product(); applyProduct(planProduct(root, config));
    config.identity.name = "Next product"; config.identity.slug = "next-product";
    applyProduct(planProduct(root, config)); expect(planProduct(root, config).changes).toEqual([]);
  });
  it("preserves existing secrets and custom unrelated source changes", () => {
    const root = fixture(); fs.writeFileSync(path.join(root, ".env.local"), "DO_NOT_TOUCH=private\n");
    fs.appendFileSync(path.join(root, "convex/settingsService.ts"), "\n// Keep the product team's own work.\n");
    applyProduct(planProduct(root, product()));
    expect(fs.readFileSync(path.join(root, ".env.local"), "utf8")).toBe("DO_NOT_TOUCH=private\n");
    expect(fs.readFileSync(path.join(root, "convex/settingsService.ts"), "utf8")).toContain("product team's own work");
  });
  it("refuses drift before any writes", () => {
    const root = fixture(); const target = path.join(root, "src/app/layout.tsx"); fs.writeFileSync(target, fs.readFileSync(target, "utf8").replace(/title: (?:"Sonae - Protocol"|productIdentity.title)/, 'title: "Custom"'));
    const before = snapshot(root); expect(() => planProduct(root, product())).toThrow("expected template code"); expect(snapshot(root)).toEqual(before);
  });
  it.each([false, true])("refuses ambiguous bindings without writes (initialised=%s)", initialised => {
    const root = fixture(); const target = path.join(root, "src/app/layout.tsx");
    // The tests also ship in branded clones. Construct each state explicitly.
    if (initialised) applyProduct(planProduct(root, product()));
    else fs.writeFileSync(target, fs.readFileSync(target, "utf8")
      .replace('import { productIdentity } from "@/product.identity";\n', "")
      .replace("title: productIdentity.title,", 'title: "Sonae - Protocol",')
      .replace("description: productIdentity.description,", 'description: "Sonae Living Dossier",'));
    fs.appendFileSync(target, '\n// title: "Sonae - Protocol",\n// title: productIdentity.title,\n');
    const before = snapshot(root);
    expect(() => planProduct(root, product())).toThrow(initialised ? "expected template code" : "binding already exists");
    expect(snapshot(root)).toEqual(before);
  });
  it.each(['Support "Desk"', "Customer's Support", 'Support "Desk"\\n', 'Customer\'s "Desk" \\n #1'])("round-trips sender punctuation: %s", senderName => {
    const root = fixture(); const config = product(); config.email.senderName = senderName;
    validateProduct(config);
    applyProduct(planProduct(root, config));
    fs.copyFileSync(path.join(root, "product.env.example"), path.join(root, ".env"));
    expect(loadSetupEnv(root, {}).RESEND_FROM_EMAIL).toBe(senderName + " <" + config.email.senderAddress + ">");
  });
  it("rejects unrepresentable dotenv punctuation before writing", () => {
    const root = fixture(); const config = product(); config.email.senderName = 'Support # \'"`';
    const before = snapshot(root);
    expect(() => planProduct(root, config)).toThrow("cannot safely quote");
    expect(snapshot(root)).toEqual(before);
  });
  it("refuses stale plans", () => {
    const root = fixture(); const plan = planProduct(root, product()); fs.writeFileSync(path.join(root, "product.identity.ts"), "// Concurrent edit\n");
    expect(() => applyProduct(plan)).toThrow("Files changed"); expect(readProduct(root).identity.name).toBe(readProduct().identity.name);
  });
  it("refuses symlinked targets", () => {
    const root = fixture(); const target = path.join(root, "package.json"); fs.unlinkSync(target); fs.symlinkSync(path.join(frameworkRoot, "package.json"), target);
    expect(() => planProduct(root, product())).toThrow("symlink");
  });
  it("refuses to overwrite an unrelated branding module", () => {
    const root = fixture(); fs.writeFileSync(path.join(root, "product.identity.ts"), "export const custom = true;"); expect(() => planProduct(root, product())).toThrow("not owned");
  });
  it("rolls earlier writes back when a later replacement fails", () => {
    const root = fixture(); const before = snapshot(root); const plan = planProduct(root, product()); const rename = fs.renameSync;
    let count = 0; vi.spyOn(fs, "renameSync").mockImplementation((from, to) => { if (++count === 4) throw new Error("fixture write failure"); return rename(from, to); });
    expect(() => applyProduct(plan)).toThrow("fixture write failure"); expect(snapshot(root)).toEqual(before);
  });
  it("refuses the Sonae origin even with a different product configuration", () => {
    const root = fixture(); execFileSync("git", ["init", "--quiet", "--template=", root]); execFileSync("git", ["remote", "add", "origin", "https://github.com/roninsatwork/Sonae.git"], { cwd: root });
    expect(() => applyProduct(planProduct(root, product()))).toThrow("Sonae source");
  });
  it("writes credential placeholders only for the chosen capabilities", () => {
    const output = buildProductEnvironment(minimal()); expect(output).toContain("OPENAI_API_KEY=\n"); expect(output).not.toContain("GOOGLE_PRIVATE_KEY="); expect(output).not.toMatch(/AUTH_GOOGLE_ID=|APIFY_API_TOKEN=/);
  });
  it("defaults to preview from the actual CLI", () => {
    const root = fixture(); const input = path.join(root, "input.json"); fs.writeFileSync(input, JSON.stringify(product())); const before = snapshot(root);
    const result = spawnSync(process.execPath, [path.join(frameworkRoot, "scripts/init-product.mjs"), "--config", input, "--root", root, "--json"], { encoding: "utf8", env: { PATH: process.env.PATH } });
    expect(result.status, result.stderr).toBe(0); expect(JSON.parse(result.stdout).mode).toBe("preview"); expect(snapshot(root)).toEqual(before);
  });
});
