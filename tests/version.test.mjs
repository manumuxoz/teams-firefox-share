import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const read = (path) => fs.readFileSync(resolve(root, path), "utf8");

const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const manifest = JSON.parse(read("extension/manifest.json"));
const shim = read("extension/src/shim.js");
const doctor = read("tools/teams-ss-doctor");
const changelog = read("CHANGELOG.md");
const readme = read("README.md");

test("package, lock and manifest versions match", () => {
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[""].version, packageJson.version);
  assert.equal(manifest.version, packageJson.version);
});

test("shim and doctor embed the package version", () => {
  assert.match(shim, new RegExp(`version: "${packageJson.version}"`));
  assert.match(doctor, new RegExp(`DOCTOR_VERSION = "${packageJson.version}"`));
});

test("changelog and README mention the current version", () => {
  assert.match(changelog, new RegExp(`^## ${packageJson.version.replaceAll(".", "\\.")}`, "m"));
  assert.match(
    readme,
    new RegExp(`\\*\\*Versión:\\*\\* ${packageJson.version.replaceAll(".", "\\.")}`),
  );
});
