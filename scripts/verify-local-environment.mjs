import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedNode = { major: 24, min: "24.18.0", range: ">=24.18.0 <25" };

function parseVersion(version) {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  return { major, minor, patch };
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  return 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const failures = [];
const nodeVersion = process.versions.node;
const parsedNode = parseVersion(nodeVersion);

if (parsedNode.major !== expectedNode.major || compareVersions(nodeVersion, expectedNode.min) < 0) {
  failures.push(`Node is ${nodeVersion}; expected ${expectedNode.range}.`);
}

const lock = readJson(path.join(repoRoot, "package-lock.json"));
const rootPackage = lock.packages?.[""];
const directDependencies = {
  ...(rootPackage?.dependencies ?? {}),
  ...(rootPackage?.devDependencies ?? {}),
};

for (const packageName of Object.keys(directDependencies).sort()) {
  const lockEntry = lock.packages?.[`node_modules/${packageName}`];
  const installedPackagePath = path.join(repoRoot, "node_modules", packageName, "package.json");

  if (!lockEntry?.version) {
    failures.push(`${packageName} is listed in package-lock root dependencies but has no lockfile package entry.`);
    continue;
  }

  if (!fs.existsSync(installedPackagePath)) {
    failures.push(`${packageName} is locked at ${lockEntry.version} but is not installed.`);
    continue;
  }

  const installed = readJson(installedPackagePath);
  if (installed.version !== lockEntry.version) {
    failures.push(`${packageName} is installed at ${installed.version}; package-lock expects ${lockEntry.version}.`);
  }
}

if (failures.length > 0) {
  console.error("Local environment does not match the CI baseline:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("");
  console.error(`Use Node ${expectedNode.min}, then run \`npm ci\` before trusting local verification.`);
  process.exit(1);
}

console.log(`Local environment matches CI baseline: Node ${nodeVersion}, ${Object.keys(directDependencies).length} locked direct dependencies verified.`);
