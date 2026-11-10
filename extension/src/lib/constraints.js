/*
 * Pure constraint helpers shared by the Firefox content script and the Node tests.
 * This file is intentionally dependency-free and does not touch the DOM.
 *
 * SPDX-License-Identifier: MPL-2.0
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.__teamsShareConstraints = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isResizeModeNone(value) {
    if (value === "none") {
      return true;
    }
    return Array.isArray(value) && value.includes("none");
  }

  function hasScaleCap(video) {
    return (
      video.width !== undefined ||
      video.height !== undefined ||
      video.frameRate !== undefined
    );
  }

  /**
   * Teams sends `resizeMode: "none"` together with max width/height/frameRate.
   * Firefox honours `resizeMode: "none"` and then ignores the downscale caps,
   * which makes Teams' SFU drop the stream. Removing resizeMode when a cap is
   * present restores the intended 1080p/15fps behaviour.
   */
  function sanitizeVideo(video) {
    if (!isPlainObject(video)) {
      return video;
    }

    const out = { ...video };

    if (isResizeModeNone(out.resizeMode) && hasScaleCap(out)) {
      delete out.resizeMode;
    }

    return out;
  }

  function sanitizeDisplayConstraints(constraints) {
    if (!isPlainObject(constraints)) {
      return {};
    }

    const out = { ...constraints };

    if (isPlainObject(out.video)) {
      out.video = sanitizeVideo(out.video);
    }

    return out;
  }

  /**
   * Mirrors Mozilla's intervention: only remove resizeMode from a track that
   * never had it. A track that already negotiated resizeMode is left alone.
   */
  function sanitizeApplyConstraints(track, constraints) {
    if (!isPlainObject(constraints)) {
      return constraints;
    }

    let current = null;
    try {
      current = track && typeof track.getConstraints === "function"
        ? track.getConstraints()
        : null;
    } catch (_) {
      current = null;
    }

    if (current && current.resizeMode !== undefined) {
      return constraints;
    }

    return sanitizeVideo(constraints);
  }

  /**
   * Detect the legacy Chrome desktop-capture shape:
   *
   *   { video: { mandatory: { chromeMediaSource: "desktop", ... } } }
   *
   * Firefox ignores unknown dictionary members, so without this shim the
   * request silently falls back to the camera.
   */
  function getLegacyDesktopSource(constraints) {
    if (!isPlainObject(constraints) || !isPlainObject(constraints.video)) {
      return null;
    }

    const video = constraints.video;
    const mandatory = isPlainObject(video.mandatory) ? video.mandatory : null;
    const source = mandatory || video;
    const kind = source.chromeMediaSource;

    if (kind === "desktop" || kind === "tab" || kind === "screen") {
      return source;
    }

    return null;
  }

  function mapLegacyDesktopConstraints(source) {
    const input = isPlainObject(source) ? source : {};
    const video = {};

    if (Number.isFinite(input.maxWidth)) {
      video.width = { max: input.maxWidth };
    }
    if (Number.isFinite(input.maxHeight)) {
      video.height = { max: input.maxHeight };
    }

    const maxFrameRate = Number.isFinite(input.maxFrameRate)
      ? input.maxFrameRate
      : input.maxFramerate;

    if (Number.isFinite(maxFrameRate)) {
      video.frameRate = { max: maxFrameRate };
    }

    return {
      video: Object.keys(video).length > 0 ? video : true,
    };
  }

  return {
    isPlainObject,
    isResizeModeNone,
    sanitizeVideo,
    sanitizeDisplayConstraints,
    sanitizeApplyConstraints,
    getLegacyDesktopSource,
    mapLegacyDesktopConstraints,
  };
});
