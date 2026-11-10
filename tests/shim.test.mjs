import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const constraintsSource = fs.readFileSync(
  resolve(here, "../extension/src/lib/constraints.js"),
  "utf8",
);
const shimSource = fs.readFileSync(
  resolve(here, "../extension/src/shim.js"),
  "utf8",
);

function createHarness() {
  const captured = {
    gdm: null,
    gum: null,
    apply: null,
    stream: null,
  };

  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = { debug() {}, warn() {}, log() {} };
  sandbox.location = { href: "https://teams.microsoft.com/v2/" };
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

  sandbox.MediaDevices.prototype.getDisplayMedia = function (constraints) {
    captured.gdm = constraints;
    return Promise.resolve(stream);
  };

  sandbox.MediaDevices.prototype.getUserMedia = function (constraints) {
    captured.gum = constraints;
    return Promise.resolve({ kind: "camera" });
  };

  sandbox.MediaStreamTrack.prototype.applyConstraints = function (constraints) {
    captured.apply = constraints;
    return Promise.resolve();
  };

  const mediaDevices = new sandbox.MediaDevices();
  sandbox.navigator = {
    mediaDevices,
    userAgent: "Firefox/153.0",
    platform: "Linux x86_64",
  };

  vm.createContext(sandbox);
  vm.runInContext(constraintsSource, sandbox, { filename: "constraints.js" });
  vm.runInContext(shimSource, sandbox, { filename: "shim.js" });

  return { sandbox, mediaDevices, captured, track };
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

test("shim records gdm call and success diagnostics", async () => {
  const { mediaDevices, sandbox } = createHarness();

  await mediaDevices.getDisplayMedia({
    video: { resizeMode: "none", width: { max: 1920 } },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const report = sandbox.__teamsShareFixReport();
  const types = report.events.map((event) => event.type);

  assert.ok(types.includes("gdm:call"));
  assert.ok(types.includes("gdm:success"));
  assert.equal(report.environment.hasGetDisplayMedia, true);
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
});

test("shim does not intercept a normal camera request", async () => {
  const { mediaDevices, captured } = createHarness();

  await mediaDevices.getUserMedia({
    video: { width: { max: 1280 } },
  });

  assert.deepEqual(captured.gum, { video: { width: { max: 1280 } } });
  assert.equal(captured.gdm, null);
});
