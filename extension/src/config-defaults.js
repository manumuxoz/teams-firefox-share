/*
 * Shared configuration defaults and validation.
 *
 * Loaded in both the MAIN world and the isolated world, and by the popup.
 * Keep this file dependency-free and side-effect-free apart from exposing the
 * API on the global object.
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
    root.__teamsShareConfig = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    enabled: true,
    sanitizeDisplay: true,
    safeClamp: false,
    mapLegacyDesktop: true,
    debug: false,
  });

  const BOOLEAN_KEYS = Object.freeze(Object.keys(DEFAULTS));

  /**
   * Return a fresh config object with only known boolean keys.
   * Unknown keys and non-boolean values are ignored, so a postMessage payload
   * cannot pollute the prototype or smuggle a string into a boolean flag.
   */
  function normalizeConfig(input) {
    const out = { ...DEFAULTS };

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return out;
    }

    for (const key of BOOLEAN_KEYS) {
      if (typeof input[key] === "boolean") {
        out[key] = input[key];
      }
    }

    return out;
  }

  return {
    DEFAULTS,
    BOOLEAN_KEYS,
    normalizeConfig,
  };
});
