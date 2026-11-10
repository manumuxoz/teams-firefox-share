import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => fs.readFileSync(resolve(here, path), "utf8");

const configSource = read("../extension/src/config-defaults.js");
const bridgeSource = read("../extension/src/config-bridge.js");

function createHarness({ origin = "https://teams.microsoft.com", stored } = {}) {
  const messages = [];
  const listeners = {};
  const storageListeners = [];

  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.location = { origin };
  sandbox.console = { debug() {}, warn() {}, log() {} };
  sandbox.postMessage = (data, targetOrigin) => {
    messages.push({ data, targetOrigin });
  };
  sandbox.addEventListener = (type, listener) => {
    listeners[type] = listener;
  };
  sandbox.browser = {
    storage: {
      local: {
        get: async () => stored || {},
      },
      onChanged: {
        addListener: (listener) => storageListeners.push(listener),
      },
    },
  };

  vm.createContext(sandbox);
  const insideWindow = vm.runInContext("window", sandbox);
  vm.runInContext(configSource, sandbox, { filename: "config-defaults.js" });
  vm.runInContext(bridgeSource, sandbox, { filename: "config-bridge.js" });

  return { sandbox, insideWindow, messages, listeners, storageListeners };
}

test("bridge posts the stored config to the page", async () => {
  const { messages } = createHarness({
    stored: { config: { enabled: false, safeClamp: true } },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(messages.length, 1);
  assert.equal(messages[0].data.type, "teams-share-fix:config");
  assert.equal(messages[0].data.config.enabled, false);
  assert.equal(messages[0].data.config.safeClamp, true);
  assert.equal(messages[0].targetOrigin, "https://teams.microsoft.com");
  assert.ok(messages[0].data.rev >= 1);
});

test("bridge replies to a config request from the same window", async () => {
  const { insideWindow, messages, listeners } = createHarness();

  await new Promise((resolve) => setImmediate(resolve));
  const before = messages.length;

  listeners.message({
    source: insideWindow,
    data: { type: "teams-share-fix:config-request" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(messages.length, before + 1);
});

test("bridge ignores requests from another window or wrong type", async () => {
  const { messages, listeners } = createHarness();

  await new Promise((resolve) => setImmediate(resolve));
  const before = messages.length;

  listeners.message({
    source: {},
    data: { type: "teams-share-fix:config-request" },
  });
  listeners.message({
    source: null,
    data: { type: "other" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(messages.length, before);
});

test("bridge forwards storage changes", async () => {
  const { messages, storageListeners } = createHarness();

  await new Promise((resolve) => setImmediate(resolve));
  const before = messages.length;

  storageListeners[0](
    { config: { newValue: { enabled: false, safeClamp: true } } },
    "local",
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(messages.length, before + 1);
  assert.equal(messages[before].data.config.enabled, false);
  assert.equal(messages[before].data.config.safeClamp, true);
});

test("bridge normalizes invalid stored config", async () => {
  const { messages } = createHarness({
    stored: { config: { enabled: "false", nope: true } },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(messages[0].data.config.enabled, true);
  assert.equal(messages[0].data.config.nope, undefined);
});

test("bridge uses * for opaque origins", async () => {
  const { messages } = createHarness({ origin: "null" });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(messages[0].targetOrigin, "*");
});
