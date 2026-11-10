/*
 * Teams screen-share compatibility shim.
 *
 * Runs in the page's MAIN world at document_start (Firefox 142+), before
 * Teams' bundles. It composes with Mozilla's WebCompat intervention 2000906
 * instead of replacing it.
 *
 * SPDX-License-Identifier: MPL-2.0
 */
(() => {
  "use strict";

  const W = window;
  const MARKER = "__teamsShareFixInstalled_v2";

  if (W[MARKER]) {
    return;
  }

  try {
    Object.defineProperty(W, MARKER, {
      value: true,
      configurable: false,
      writable: false,
    });
  } catch (_) {
    return;
  }

  const configApi = W.__teamsShareConfig;
  const constraintsApi = W.__teamsShareConstraints;

  if (!configApi || !constraintsApi) {
    console.warn("[teams-share-fix] shared helpers were not loaded");
    return;
  }

  const { normalizeConfig } = configApi;
  const C = constraintsApi;

  const state = {
    version: "0.2.0",
    installedAt: new Date().toISOString(),
    config: normalizeConfig(null),
    configRev: -1,
    events: [],
  };

  const MAX_EVENTS = 200;
  const SAFE_CLAMP = Object.freeze({
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { max: 15 },
  });

  // Do not expose the mutable state object to page scripts.
  try {
    Object.defineProperty(W, "__teamsShareFix", {
      value: Object.freeze({
        version: state.version,
        installedAt: state.installedAt,
      }),
      configurable: false,
      writable: false,
      enumerable: false,
    });
  } catch (_) {
    // A page-defined property must not prevent the shim from loading.
  }

  function errorInfo(error) {
    return {
      name: error && error.name ? String(error.name) : null,
      message: error && error.message ? String(error.message) : String(error),
    };
  }

  function safeClone(value, depth = 0, seen = new WeakSet()) {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (depth > 4) {
      return "[max-depth]";
    }
    if (seen.has(value)) {
      return "[circular]";
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => safeClone(item, depth + 1, seen));
    }

    if (typeof value.kind === "string" && typeof value.readyState === "string") {
      return {
        kind: value.kind,
        labelLength: (value.label || "").length,
        readyState: value.readyState,
      };
    }

    const out = {};
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (typeof item === "function") {
        continue;
      }
      out[key] = safeClone(item, depth + 1, seen);
    }
    return out;
  }

  function record(type, data) {
    const event = {
      t: new Date().toISOString(),
      type,
      data: safeClone(data),
    };
    state.events.push(event);
    if (state.events.length > MAX_EVENTS) {
      state.events.shift();
    }
    if (state.config.debug) {
      console.debug("[teams-share-fix]", type, event.data);
    }
  }

  function trackSettings(track) {
    try {
      return track && typeof track.getSettings === "function"
        ? safeClone(track.getSettings())
        : null;
    } catch (error) {
      return { error: errorInfo(error) };
    }
  }

  function trackConstraints(track) {
    try {
      return track && typeof track.getConstraints === "function"
        ? safeClone(track.getConstraints())
        : null;
    } catch (error) {
      return { error: errorInfo(error) };
    }
  }

  function getCodecs() {
    try {
      const caps = W.RTCRtpSender && typeof W.RTCRtpSender.getCapabilities === "function"
        ? W.RTCRtpSender.getCapabilities("video")
        : null;
      if (!caps || !Array.isArray(caps.codecs)) {
        return null;
      }
      return caps.codecs.map((codec) => ({
        mimeType: codec.mimeType,
        clockRate: codec.clockRate,
        channels: codec.channels,
      }));
    } catch (_) {
      return null;
    }
  }

  function getWebCompatMarkers() {
    try {
      return Array.from(W.__webcompat || []);
    } catch (_) {
      return [];
    }
  }

  function safeHref() {
    try {
      const url = new URL(location.href);
      const first = url.pathname.split("/").filter(Boolean)[0] || "";
      return first ? `${url.origin}/${first}/` : `${url.origin}/`;
    } catch (_) {
      return "";
    }
  }

  function getEnvironment() {
    const md = navigator.mediaDevices;
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      href: safeHref(),
      isSecureContext: Boolean(W.isSecureContext),
      hasMediaDevices: Boolean(md),
      hasGetDisplayMedia: Boolean(md && typeof md.getDisplayMedia === "function"),
      hasGetUserMedia: Boolean(md && typeof md.getUserMedia === "function"),
      webcompat: getWebCompatMarkers(),
      codecs: getCodecs(),
      config: { ...state.config },
      configRev: state.configRev,
    };
  }

  function applyConfig(next, rev) {
    if (typeof rev === "number") {
      if (!Number.isInteger(rev) || rev < 0 || rev < state.configRev) {
        return;
      }
      state.configRev = rev;
    }

    try {
      state.config = normalizeConfig({
        ...state.config,
        ...(next && typeof next === "object" ? next : {}),
      });
    } catch (error) {
      record("config:error", errorInfo(error));
      return;
    }

    record("config:update", {
      ...state.config,
      rev: state.configRev,
    });
  }

  function isSameWindowMessage(event) {
    if (event.source !== W) {
      return false;
    }
    if (event.origin === location.origin) {
      return true;
    }
    return location.origin === "null" && event.origin === "null";
  }

  W.addEventListener("message", (event) => {
    if (!isSameWindowMessage(event)) {
      return;
    }
    const data = event.data;
    if (!data || data.type !== "teams-share-fix:config") {
      return;
    }
    applyConfig(data.config, data.rev);
  });

  const requestOrigin = location.origin === "null" ? "*" : location.origin;
  W.postMessage({ type: "teams-share-fix:config-request" }, requestOrigin);

  const md = navigator.mediaDevices;

  function mediaDevicesReceiver(candidate) {
    try {
      if (W.MediaDevices && candidate instanceof W.MediaDevices) {
        return candidate;
      }
    } catch (_) {
      // fall through
    }
    return md;
  }

  if (!md) {
    record("env:no-mediaDevices", {});
    W.__teamsShareFixReport = () => ({
      environment: getEnvironment(),
      events: state.events.slice(),
      config: { ...state.config },
      shim: { version: state.version, installedAt: state.installedAt },
    });
    return;
  }

  let nativeGetDisplayMedia = null;

  function attachStreamDiagnostics(stream) {
    const tracks = stream && typeof stream.getTracks === "function"
      ? stream.getTracks()
      : [];
    const videoTrack = stream && typeof stream.getVideoTracks === "function"
      ? stream.getVideoTracks()[0] || null
      : null;

    record("gdm:success", {
      tracks: tracks.map((track) => ({
        kind: track.kind,
        labelLength: (track.label || "").length,
        readyState: track.readyState,
      })),
      settings: trackSettings(videoTrack),
      constraints: trackConstraints(videoTrack),
    });

    if (videoTrack && typeof videoTrack.addEventListener === "function") {
      videoTrack.addEventListener("ended", () => {
        record("track:ended", {
          labelLength: (videoTrack.label || "").length,
          settings: trackSettings(videoTrack),
        });
      });
    }
  }

  function clampStream(stream) {
    const videoTrack = stream && typeof stream.getVideoTracks === "function"
      ? stream.getVideoTracks()[0] || null
      : null;

    if (!videoTrack || typeof videoTrack.applyConstraints !== "function") {
      record("safeClamp:skip", { reason: "no-video-track" });
      return Promise.resolve(stream);
    }

    record("safeClamp:start", { constraints: SAFE_CLAMP });

    return Promise.resolve(videoTrack.applyConstraints(SAFE_CLAMP)).then(
      () => {
        record("safeClamp:ok", { settings: trackSettings(videoTrack) });
        return stream;
      },
      (error) => {
        record("safeClamp:error", errorInfo(error));
        return stream;
      }
    );
  }

  function startDisplayCapture(constraints, receiver, source) {
    const sanitized = state.config.sanitizeDisplay
      ? C.sanitizeDisplayConstraints(constraints)
      : constraints;

    record(source === "gum" ? "gum:legacy-desktop" : "gdm:call", {
      original: safeClone(constraints),
      sanitized: safeClone(sanitized),
    });

    let result;
    try {
      result = nativeGetDisplayMedia.call(receiver, sanitized);
    } catch (error) {
      record("gdm:throw", errorInfo(error));
      throw error;
    }

    const promise = Promise.resolve(result);
    promise.then(attachStreamDiagnostics, (error) => {
      record("gdm:error", errorInfo(error));
    });

    if (!state.config.safeClamp) {
      return result;
    }

    return promise.then((stream) => clampStream(stream));
  }

  if (typeof md.getDisplayMedia === "function") {
    nativeGetDisplayMedia = md.getDisplayMedia;

    const wrappedGetDisplayMedia = function getDisplayMedia(constraints) {
      const receiver = mediaDevicesReceiver(this);

      if (!state.config.enabled) {
        record("gdm:call", {
          disabled: true,
          original: safeClone(constraints),
        });
        return nativeGetDisplayMedia.call(receiver, constraints);
      }

      return startDisplayCapture(constraints, receiver, "gdm");
    };

    Object.defineProperty(wrappedGetDisplayMedia, "__teamsShareFix", {
      value: true,
      configurable: false,
    });

    try {
      Object.defineProperty(md, "getDisplayMedia", {
        value: wrappedGetDisplayMedia,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    } catch (error) {
      record("patch:gdm-instance-failed", errorInfo(error));
    }

    try {
      if (W.MediaDevices && W.MediaDevices.prototype) {
        Object.defineProperty(W.MediaDevices.prototype, "getDisplayMedia", {
          value: wrappedGetDisplayMedia,
          configurable: true,
          writable: true,
          enumerable: true,
        });
      }
    } catch (error) {
      record("patch:gdm-prototype-failed", errorInfo(error));
    }
  } else {
    record("env:no-getDisplayMedia", {});
  }

  if (
    W.MediaStreamTrack &&
    W.MediaStreamTrack.prototype &&
    typeof W.MediaStreamTrack.prototype.applyConstraints === "function"
  ) {
    const nativeApplyConstraints = W.MediaStreamTrack.prototype.applyConstraints;

    const wrappedApplyConstraints = function applyConstraints(constraints) {
      if (!state.config.enabled || !state.config.sanitizeDisplay) {
        return nativeApplyConstraints.call(this, constraints);
      }

      const sanitized = C.sanitizeApplyConstraints(this, constraints);
      record("applyConstraints:call", {
        original: safeClone(constraints),
        sanitized: safeClone(sanitized),
      });
      return nativeApplyConstraints.call(this, sanitized);
    };

    Object.defineProperty(wrappedApplyConstraints, "__teamsShareFix", {
      value: true,
      configurable: false,
    });

    try {
      Object.defineProperty(W.MediaStreamTrack.prototype, "applyConstraints", {
        value: wrappedApplyConstraints,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    } catch (error) {
      record("patch:applyConstraints-failed", errorInfo(error));
    }
  }

  if (typeof md.getUserMedia === "function") {
    const nativeGetUserMedia = md.getUserMedia;

    const wrappedGetUserMedia = function getUserMedia(constraints) {
      const receiver = mediaDevicesReceiver(this);

      if (
        !state.config.enabled ||
        !state.config.mapLegacyDesktop ||
        !nativeGetDisplayMedia
      ) {
        return nativeGetUserMedia.call(receiver, constraints);
      }

      const legacySource = C.getLegacyDesktopSource(constraints);
      if (!legacySource) {
        return nativeGetUserMedia.call(receiver, constraints);
      }

      const mapped = C.mapLegacyDesktopConstraints(legacySource);
      return startDisplayCapture(mapped, receiver, "gum");
    };

    Object.defineProperty(wrappedGetUserMedia, "__teamsShareFix", {
      value: true,
      configurable: false,
    });

    try {
      Object.defineProperty(md, "getUserMedia", {
        value: wrappedGetUserMedia,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    } catch (error) {
      record("patch:gum-instance-failed", errorInfo(error));
    }

    try {
      if (W.MediaDevices && W.MediaDevices.prototype) {
        Object.defineProperty(W.MediaDevices.prototype, "getUserMedia", {
          value: wrappedGetUserMedia,
          configurable: true,
          writable: true,
          enumerable: true,
        });
      }
    } catch (error) {
      record("patch:gum-prototype-failed", errorInfo(error));
    }
  }

  W.__teamsShareFixReport = () => ({
    environment: getEnvironment(),
    events: state.events.slice(),
    config: { ...state.config },
    shim: { version: state.version, installedAt: state.installedAt },
  });

  W.__teamsShareFixSetConfig = (patch) => {
    applyConfig(patch, undefined);
    return { ...state.config };
  };

  record("shim:installed", {
    version: state.version,
    config: { ...state.config },
  });
})();
