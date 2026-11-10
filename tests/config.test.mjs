import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DEFAULTS, BOOLEAN_KEYS, normalizeConfig } = require(
  "../extension/src/config-defaults.js",
);

test("defaults are the expected boolean flags", () => {
  assert.deepEqual(DEFAULTS, {
    enabled: true,
    sanitizeDisplay: true,
    safeClamp: false,
    mapLegacyDesktop: true,
    debug: false,
  });
  assert.deepEqual([...BOOLEAN_KEYS].sort(), Object.keys(DEFAULTS).sort());
});

test("normalizeConfig fills defaults for missing input", () => {
  assert.deepEqual(normalizeConfig(null), { ...DEFAULTS });
  assert.deepEqual(normalizeConfig(undefined), { ...DEFAULTS });
  assert.deepEqual(normalizeConfig("nope"), { ...DEFAULTS });
});

test("normalizeConfig accepts only known boolean keys", () => {
  const config = normalizeConfig({
    enabled: false,
    safeClamp: true,
    sanitizeDisplay: "false",
    nope: true,
  });

  assert.equal(config.enabled, false);
  assert.equal(config.safeClamp, true);
  assert.equal(config.sanitizeDisplay, true);
  assert.equal(config.nope, undefined);
});

test("normalizeConfig ignores __proto__ payloads", () => {
  const payload = JSON.parse('{"__proto__":{"polluted":true},"debug":true}');
  const config = normalizeConfig(payload);

  assert.equal(config.debug, true);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test("defaults are frozen", () => {
  assert.equal(Object.isFrozen(DEFAULTS), true);
});
