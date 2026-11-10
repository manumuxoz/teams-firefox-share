import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => fs.readFileSync(resolve(here, path), "utf8");

const configSource = read("../extension/src/config-defaults.js");
const constraintsSource = read("../extension/src/lib/constraints.js");
const shimSource = read("../extension/src/shim.js");

function createHarness() {
  const captured = {
    gdm: null,
    gum: null,
    apply: null,
    stream: null,
    gdmCalls: 0,
    gdmImpl: null,
    applyImpl: null,
  };

  const listeners = {};
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = { debug() {}, warn() {}, log() {} };
  sandbox.addEventListener = (type, listener) => {
    listeners[type] = listener;
  };
  sandbox.postMessage = () => {};
  sandbox.location = { href: "https://teams.microsoft.com/v2/", origin: "https://teams.microsoft.com" };
  sandbox.isSecureContext = true;
  sandbox.RTCRtpSender = { getCapabilities: () => ({ codecs: [] }) };
  sandbox.MediaStreamTrack = function MediaStreamTrack() {};
  sandbox.MediaDevices = function MediaDevices() {};

  const track = new sandbox.MediaStreamTrack();
  track.kind = "video";
  track.label = "fake-screen";
  track.readyState = "live";
  track.getSettings = () => ({ width: 1920, height: 1080, frameRate: 15 });
  track.getConstraints = () => ({});
  track.addEventListener = () => {};

  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };

  captured.stream = stream;
  captured.gdmImpl = () => Promise.resolve(stream);
  captured.applyImpl = () => Promise.resolve();

  sandbox.MediaDevices.prototype.getDisplayMedia = function (constraints) {
    captured.gdm = constraints;
    captured.gdmCalls += 1;
    return captured.gdmImpl(constraints);
  };

  sandbox.MediaDevices.prototype.getUserMedia = function (constraints) {
    captured.gum = constraints;
    return Promise.resolve({ kind: "camera" });
  };

  sandbox.MediaStreamTrack.prototype.applyConstraints = function (constraints) {
    captured.apply = constraints;
    return captured.applyImpl(constraints);
  };

  const mediaDevices = new sandbox.MediaDevices();
  sandbox.navigator = {
    mediaDevices,
    userAgent: "Firefox/153.0",
    platform: "Linux x86_64",
  };

  vm.createContext(sandbox);
  const insideWindow = vm.runInContext("window", sandbox);
  vm.runInContext(configSource, sandbox, { filename: "config-defaults.js" });
  vm.runInContext(constraintsSource, sandbox, { filename: "constraints.js" });
  vm.runInContext(shimSource, sandbox, { filename: "shim.js" });

  return { sandbox, insideWindow, listeners, mediaDevices, captured, track };
}

function reportTypes(sandbox) {
  return sandbox.__teamsShareFixReport().events.map((event) => event.type);
}

test("shim sanitizes getDisplayMedia before calling the native API", async () => {
  const { mediaDevices, captured } = createHarness();

  await mediaDevices.getDisplayMedia({
    video: {
      resizeMode: "none",
      width: { max: 1920 },
      height: { max: 1080 },
      frameRate: { max: 15 },
    },
  });

  assert.equal(captured.gdm.video.resizeMode, undefined);
  assert.deepEqual(captured.gdm.video.width, { max: 1920 });
});

test("shim also sanitizes when called through the prototype", async () => {
  const { sandbox, mediaDevices, captured } = createHarness();

  await sandbox.MediaDevices.prototype.getDisplayMedia.call(mediaDevices, {
    video: { resizeMode: "none", width: { max: 1280 } },
  });

  assert.equal(captured.gdm.video.resizeMode, undefined);
  assert.deepEqual(captured.gdm.video.width, { max: 1280 });
});

test("shim is idempotent when injected twice", async () => {
  const { sandbox, mediaDevices, captured } = createHarness();

  vm.runInContext(shimSource, sandbox, { filename: "shim.js" });
  await mediaDevices.getDisplayMedia({
    video: { resizeMode: "none", width: { max: 1920 } },
  });

  assert.equal(captured.gdmCalls, 1);
  assert.equal(
    sandbox.__teamsShareFixReport().events.filter((event) => event.type === "gdm:call").length,
    1,
  );
});

test("shim records gdm call and success diagnostics", async () => {
  const { mediaDevices, sandbox } = createHarness();

  await mediaDevices.getDisplayMedia({
    video: { resizeMode: "none", width: { max: 1920 } },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const types = reportTypes(sandbox);
  assert.ok(types.includes("gdm:call"));
  assert.ok(types.includes("gdm:success"));
  assert.equal(sandbox.__teamsShareFixReport().environment.hasGetDisplayMedia, true);
});

test("enabled:false passes the original constraints and records a disabled call", async () => {
  const { sandbox, mediaDevices, captured } = createHarness();
  sandbox.__teamsShareFixSetConfig({ enabled: false });

  const input = {
    video: { resizeMode: "none", width: { max: 1920 } },
  };
  await mediaDevices.getDisplayMedia(input);

  assert.deepEqual(captured.gdm, input);
  assert.equal(captured.apply, null);

  const call = sandbox
    .__teamsShareFixReport()
    .events.find((event) => event.type === "gdm:call");
  assert.equal(call.data.disabled, true);
});

test("sanitizeDisplay:false passes the original constraints", async () => {
  const { sandbox, mediaDevices, captured } = createHarness();
  sandbox.__teamsShareFixSetConfig({ sanitizeDisplay: false });

  const input = {
    video: { resizeMode: "none", width: { max: 1920 } },
  };
  await mediaDevices.getDisplayMedia(input);

  assert.deepEqual(captured.gdm, input);
});

test("safeClamp applies constraints before the returned promise resolves", async () => {
  const { sandbox, mediaDevices, captured } = createHarness();
  sandbox.__teamsShareFixSetConfig({ safeClamp: true });

  const stream = await mediaDevices.getDisplayMedia({
    video: { resizeMode: "none", width: { max: 1920 } },
  });

  assert.equal(stream, captured.stream);
  assert.deepEqual(JSON.parse(JSON.stringify(captured.apply)), {
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { max: 15 },
  });

  const types = reportTypes(sandbox);
  assert.ok(types.includes("safeClamp:start"));
  assert.ok(types.includes("safeClamp:ok"));
});

test("safeClamp failure still returns the original stream", async () => {
  const { sandbox, mediaDevices, captured } = createHarness();
  sandbox.__teamsShareFixSetConfig({ safeClamp: true });
  captured.applyImpl = () => Promise.reject(new Error("OverconstrainedError"));

  const stream = await mediaDevices.getDisplayMedia({
    video: { resizeMode: "none", width: { max: 1920 } },
  });

  assert.equal(stream, captured.stream);
  assert.ok(reportTypes(sandbox).includes("safeClamp:error"));
});

test("native gDM rejection propagates and is recorded", async () => {
  const { sandbox, mediaDevices, captured } = createHarness();
  const expected = new Error("NotAllowedError");
  captured.gdmImpl = () => Promise.reject(expected);

  await assert.rejects(
    mediaDevices.getDisplayMedia({ video: true }),
    (error) => error === expected,
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(reportTypes(sandbox).includes("gdm:error"));
  assert.equal(captured.apply, null);
});

test("shim sanitizes applyConstraints on a gDM-like track", async () => {
  const { track, captured } = createHarness();

  await track.applyConstraints({
    resizeMode: "none",
    width: 1663,
    height: 1080,
  });

  assert.equal(captured.apply.resizeMode, undefined);
  assert.equal(captured.apply.width, 1663);
});

test("shim maps legacy chromeMediaSource getUserMedia to getDisplayMedia", async () => {
  const { mediaDevices, captured } = createHarness();

  await mediaDevices.getUserMedia({
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 15,
      },
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(captured.gdm)), {
    video: {
      width: { max: 1920 },
      height: { max: 1080 },
      frameRate: { max: 15 },
    },
  });
  assert.equal(captured.gum, null);
  assert.equal(captured.gdmCalls, 1);
});

test("shim does not intercept a normal camera request", async () => {
  const { mediaDevices, captured } = createHarness();

  await mediaDevices.getUserMedia({
    video: { width: { max: 1280 } },
  });

  assert.deepEqual(captured.gum, { video: { width: { max: 1280 } } });
  assert.equal(captured.gdm, null);
});

test("config updates ignore unknown keys, non-booleans and __proto__", () => {
  const { sandbox } = createHarness();
  const patch = JSON.parse(
    '{"__proto__":{"polluted":true},"enabled":"false","safeClamp":true,"nope":1}',
  );

  const config = sandbox.__teamsShareFixSetConfig(patch);

  assert.equal(config.enabled, true);
  assert.equal(config.safeClamp, true);
  assert.equal(config.nope, undefined);
  assert.equal({}.polluted, undefined);
});

test("patched methods stay enumerable on the prototype", () => {
  const { sandbox } = createHarness();
  const keys = Object.keys(sandbox.MediaDevices.prototype);

  assert.ok(keys.includes("getDisplayMedia"));
  assert.ok(keys.includes("getUserMedia"));
  assert.ok(Object.keys(sandbox.MediaStreamTrack.prototype).includes("applyConstraints"));
});

test("config messages validate revision and ignore stale updates", () => {
  const { sandbox, insideWindow, listeners } = createHarness();
  const origin = "https://teams.microsoft.com";

  listeners.message({
    source: insideWindow,
    origin,
    data: {
      type: "teams-share-fix:config",
      rev: Number.NaN,
      config: { enabled: false },
    },
  });
  assert.equal(sandbox.__teamsShareFixReport().config.enabled, true);

  listeners.message({
    source: insideWindow,
    origin,
    data: {
      type: "teams-share-fix:config",
      rev: 5,
      config: { enabled: false },
    },
  });
  assert.equal(sandbox.__teamsShareFixReport().config.enabled, false);

  listeners.message({
    source: insideWindow,
    origin,
    data: {
      type: "teams-share-fix:config",
      rev: 4,
      config: { enabled: true },
    },
  });
  assert.equal(sandbox.__teamsShareFixReport().config.enabled, false);
});
