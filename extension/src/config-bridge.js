/*
 * Isolated-world bridge between browser.storage.local and the MAIN-world shim.
 *
 * The MAIN world has no access to browser.* APIs. This script reads the
 * stored config and forwards it with window.postMessage. The shim requests the
 * config on install, so a lost initial message cannot leave it stuck on
 * defaults.
 *
 * SPDX-License-Identifier: MPL-2.0
 */
(() => {
  "use strict";

  const api = globalThis.__teamsShareConfig;
  if (!api) {
    return;
  }

  const { normalizeConfig } = api;
  const CONFIG_TYPE = "teams-share-fix:config";
  const REQUEST_TYPE = "teams-share-fix:config-request";
  let revision = 0;

  function targetOrigin() {
    return location.origin === "null" ? "*" : location.origin;
  }

  async function readConfig() {
    try {
      const stored = await browser.storage.local.get("config");
      return normalizeConfig(stored && stored.config);
    } catch (_) {
      return normalizeConfig(null);
    }
  }

  async function sendConfig(value) {
    const config = value === undefined ? await readConfig() : normalizeConfig(value);
    revision += 1;
    window.postMessage(
      {
        type: CONFIG_TYPE,
        rev: revision,
        config,
      },
      targetOrigin()
    );
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }
    if (!event.data || event.data.type !== REQUEST_TYPE) {
      return;
    }
    sendConfig();
  });

  if (browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.config) {
        sendConfig(changes.config.newValue);
      }
    });
  }

  sendConfig();
})();
