/*
 * Teams screen-share compatibility shim.
 *
 * Runs in the page's MAIN world at document_start (Firefox 128+), before
 * Teams' bundles. It composes with Mozilla's WebCompat intervention 2000906
 * instead of replacing it.
 *
 * SPDX-License-Identifier: MPL-2.0
 */
(() => {
  "use strict";

  const W = window;

  if (W.__teamsShareFixInstalled) {
    return;
  }
  W.__teamsShareFixInstalled = true;

  const C = W.__teamsShareConstraints;
  if (!C) {
    console.warn("[teams-share-fix] constraint helpers were not loaded");
    return;
  }

  const state = {
    version: "0.1.0",
    installedAt: new Date().toISOString(),
    config: {
      enabled: true,
      sanitizeDisplay: true,
      mapLegacyDesktop: true,
      debug: false,
    },
    events: [],
  };

  W.__teamsShareFix = state;

  const MAX_EVENTS = 200;

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
        label: value.label || "",
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

  function getEnvironment() {
    const md = navigator.mediaDevices;
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      href: location.href,
      isSecureContext: Boolean(W.isSecureContext),
      hasMediaDevices: Boolean(md),
      hasGetDisplayMedia: Boolean(md && typeof md.getDisplayMedia === "function"),
      hasGetUserMedia: Boolean(md && typeof md.getUserMedia === "function"),
      webcompat: getWebCompatMarkers(),
      codecs: getCodecs(),
      shim: { ...state.config },
    };
  }

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
    });
    return;
  }

  let nativeGetDisplayMedia = null;

  if (typeof md.getDisplayMedia === "function") {
    nativeGetDisplayMedia = md.getDisplayMedia;

    const wrappedGetDisplayMedia = function getDisplayMedia(constraints) {
      const receiver = mediaDevicesReceiver(this);
      if (!state.config.enabled || !state.config.sanitizeDisplay) {
        return nativeGetDisplayMedia.call(receiver, constraints);
      }

      const sanitized = C.sanitizeDisplayConstraints(constraints);
      record("gdm:call", {
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

      Promise.resolve(result).then(
        (stream) => {
          const tracks = stream && typeof stream.getTracks === "function"
            ? stream.getTracks()
            : [];
          const videoTrack = stream && typeof stream.getVideoTracks === "function"
            ? stream.getVideoTracks()[0] || null
            : null;

          record("gdm:success", {
            tracks: tracks.map((track) => ({
              kind: track.kind,
              label: track.label || "",
              readyState: track.readyState,
            })),
            settings: trackSettings(videoTrack),
            constraints: trackConstraints(videoTrack),
          });

          if (videoTrack && typeof videoTrack.addEventListener === "function") {
            videoTrack.addEventListener("ended", () => {
              record("track:ended", {
                label: videoTrack.label || "",
                settings: trackSettings(videoTrack),
              });
            });
          }
        },
        (error) => {
          record("gdm:error", errorInfo(error));
        }
      );

      return result;
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
      W.MediaStreamTrack.prototype.applyConstraints = wrappedApplyConstraints;
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
      record("gum:legacy-desktop", {
        original: safeClone(constraints),
        mapped: safeClone(mapped),
      });

      return nativeGetDisplayMedia.call(md, mapped);
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
        });
      }
    } catch (error) {
      record("patch:gum-prototype-failed", errorInfo(error));
    }
  }

  W.__teamsShareFixReport = () => ({
    environment: getEnvironment(),
    events: state.events.slice(),
  });

  W.__teamsShareFixSetConfig = (patch) => {
    if (patch && typeof patch === "object") {
      Object.assign(state.config, patch);
      record("config:update", { ...state.config });
    }
    return { ...state.config };
  };

  record("shim:installed", { version: state.version });
})();
