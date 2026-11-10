import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../extension/src/lib/constraints.js");

test("removes resizeMode when max width/height/frameRate are present", () => {
  const input = {
    video: {
      resizeMode: "none",
      width: { max: 1920 },
      height: { max: 1080 },
      frameRate: { max: 15 },
    },
  };

  const output = C.sanitizeDisplayConstraints(input);

  assert.equal(output.video.resizeMode, undefined);
  assert.deepEqual(output.video.width, { max: 1920 });
  assert.deepEqual(output.video.height, { max: 1080 });
  assert.deepEqual(output.video.frameRate, { max: 15 });
});

test("keeps resizeMode when there is no scale cap", () => {
  const input = { video: { resizeMode: "none" } };
  const output = C.sanitizeDisplayConstraints(input);
  assert.equal(output.video.resizeMode, "none");
});

test("keeps resizeMode when it is not 'none'", () => {
  const input = {
    video: {
      resizeMode: "crop-and-scale",
      width: { max: 1280 },
    },
  };
  const output = C.sanitizeDisplayConstraints(input);
  assert.equal(output.video.resizeMode, "crop-and-scale");
});

test("does not mutate the original constraints", () => {
  const input = {
    video: {
      resizeMode: "none",
      width: { max: 1920 },
    },
  };
  const snapshot = structuredClone(input);

  C.sanitizeDisplayConstraints(input);

  assert.deepEqual(input, snapshot);
});

test("handles video: true, null and undefined", () => {
  assert.deepEqual(C.sanitizeDisplayConstraints({ video: true }), { video: true });
  assert.deepEqual(C.sanitizeDisplayConstraints(null), {});
  assert.deepEqual(C.sanitizeDisplayConstraints(undefined), {});
});

test("applyConstraints strips resizeMode when the track never had it", () => {
  const track = { getConstraints: () => ({ width: 1920 }) };
  const output = C.sanitizeApplyConstraints(track, {
    resizeMode: "none",
    width: 1663,
    height: 1080,
  });

  assert.equal(output.resizeMode, undefined);
  assert.equal(output.width, 1663);
});

test("applyConstraints preserves resizeMode when the track already had it", () => {
  const track = { getConstraints: () => ({ resizeMode: "none" }) };
  const input = { resizeMode: "none", width: 1663 };
  const output = C.sanitizeApplyConstraints(track, input);

  assert.equal(output, input);
});

test("detects legacy chromeMediaSource in mandatory", () => {
  const source = C.getLegacyDesktopSource({
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 15,
      },
    },
  });

  assert.ok(source);
  assert.equal(source.chromeMediaSource, "desktop");
});

test("detects legacy chromeMediaSource at the video level", () => {
  const source = C.getLegacyDesktopSource({
    video: { chromeMediaSource: "tab", maxWidth: 1280 },
  });

  assert.ok(source);
  assert.equal(source.chromeMediaSource, "tab");
});

test("does not intercept a normal camera request", () => {
  const source = C.getLegacyDesktopSource({
    video: { width: { max: 1280 }, facingMode: "user" },
  });

  assert.equal(source, null);
});

test("maps legacy caps to getDisplayMedia constraints", () => {
  const mapped = C.mapLegacyDesktopConstraints({
    chromeMediaSource: "desktop",
    maxWidth: 1920,
    maxHeight: 1080,
    maxFrameRate: 15,
  });

  assert.deepEqual(mapped, {
    video: {
      width: { max: 1920 },
      height: { max: 1080 },
      frameRate: { max: 15 },
    },
  });
});

test("maps legacy request without caps to video: true", () => {
  const mapped = C.mapLegacyDesktopConstraints({
    chromeMediaSource: "desktop",
  });

  assert.deepEqual(mapped, { video: true });
});
