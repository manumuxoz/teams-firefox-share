import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const extension = resolve(root, "extension");

const manifest = JSON.parse(
  fs.readFileSync(resolve(extension, "manifest.json"), "utf8"),
);
const packageJson = JSON.parse(
  fs.readFileSync(resolve(root, "package.json"), "utf8"),
);

test("manifest and package versions are in sync", () => {
  assert.equal(manifest.version, packageJson.version);
});

test("every content script path exists", () => {
  for (const entry of manifest.content_scripts) {
    for (const script of entry.js) {
      const path = resolve(extension, script);
      assert.equal(fs.existsSync(path), true, `missing ${script}`);
    }
  }
});

test("manifest has exactly one MAIN-world entry and one isolated entry", () => {
  const main = manifest.content_scripts.filter((entry) => entry.world === "MAIN");
  const isolated = manifest.content_scripts.filter((entry) => !entry.world);

  assert.equal(main.length, 1);
  assert.equal(isolated.length, 1);
  assert.ok(main[0].js.includes("src/shim.js"));
  assert.ok(isolated[0].js.includes("src/config-bridge.js"));
});

test("manifest matches all three Teams hosts", () => {
  const matches = new Set(manifest.content_scripts.flatMap((entry) => entry.matches));

  assert.ok(matches.has("*://teams.microsoft.com/*"));
  assert.ok(matches.has("*://teams.cloud.microsoft/*"));
  assert.ok(matches.has("*://teams.live.com/*"));
});

test("popup entry point exists", () => {
  assert.ok(fs.existsSync(resolve(extension, manifest.action.default_popup)));
});

test("shim version matches the manifest", () => {
  const shim = fs.readFileSync(resolve(extension, "src/shim.js"), "utf8");
  assert.match(shim, new RegExp(`version: "${manifest.version}"`));
});

test("manifest requires Firefox 142+ for data_collection_permissions", () => {
  const minimum = Number.parseFloat(
    manifest.browser_specific_settings.gecko.strict_min_version,
  );
  assert.ok(minimum >= 142);
  assert.ok(manifest.browser_specific_settings.gecko.data_collection_permissions);
});
