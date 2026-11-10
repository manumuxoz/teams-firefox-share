/*
 * Popup controller. Reads the MAIN-world diagnostics object through
 * scripting.executeScript and stores shim options in browser.storage.local.
 * No data leaves the browser.
 *
 * SPDX-License-Identifier: MPL-2.0
 */
"use strict";

const { DEFAULTS, normalizeConfig } = window.__teamsShareConfig;

const statusEl = document.getElementById("status");
const reportEl = document.getElementById("report");
const refreshButton = document.getElementById("refresh");
const copyButton = document.getElementById("copy");
const resetButton = document.getElementById("reset");
const configStatusEl = document.getElementById("config-status");

const controls = {
  enabled: document.getElementById("enabled"),
  sanitizeDisplay: document.getElementById("sanitizeDisplay"),
  safeClamp: document.getElementById("safeClamp"),
  mapLegacyDesktop: document.getElementById("mapLegacyDesktop"),
  debug: document.getElementById("debug"),
};

let lastReportText = "";

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

function setConfigStatus(text) {
  configStatusEl.textContent = text;
}

function isTeamsUrl(url) {
  try {
    const host = new URL(url).hostname;
    return (
      host === "teams.microsoft.com" ||
      host === "teams.cloud.microsoft" ||
      host === "teams.live.com"
    );
  } catch (_) {
    return false;
  }
}

function renderConfig(config) {
  for (const [key, element] of Object.entries(controls)) {
    element.checked = Boolean(config[key]);
  }
}

function readConfigFromUi() {
  const next = {};
  for (const [key, element] of Object.entries(controls)) {
    next[key] = element.checked;
  }
  return normalizeConfig(next);
}

async function loadConfig() {
  try {
    const stored = await browser.storage.local.get("config");
    const config = normalizeConfig(stored && stored.config);
    renderConfig(config);
    return config;
  } catch (_) {
    renderConfig(DEFAULTS);
    return { ...DEFAULTS };
  }
}

async function saveConfig() {
  const config = readConfigFromUi();
  try {
    await browser.storage.local.set({ config });
    setConfigStatus("Guardado; se aplica en la próxima compartición.");
    window.setTimeout(() => setConfigStatus(""), 3000);
  } catch (error) {
    setConfigStatus(`No se pudo guardar: ${error.message}`);
  }
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

async function collectReport() {
  reportEl.textContent = "";
  lastReportText = "";
  setStatus("Analizando…");

  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    setStatus("No hay una pestaña activa.", "warn");
    return;
  }

  if (!isTeamsUrl(tab.url || "")) {
    setStatus(
      "La pestaña activa no es de Teams. Abre teams.microsoft.com, teams.cloud.microsoft o teams.live.com.",
      "warn"
    );
    return;
  }

  let results;
  try {
    results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => {
        if (typeof window.__teamsShareFixReport !== "function") {
          return null;
        }
        return window.__teamsShareFixReport();
      },
    });
  } catch (error) {
    setStatus(`No se pudo analizar la pestaña: ${error.message}`, "fail");
    return;
  }

  const report = results && results[0] ? results[0].result : null;
  if (!report) {
    setStatus(
      "El shim no está inyectado en esta pestaña. Recarga Teams después de instalar o actualizar la extensión.",
      "warn"
    );
    return;
  }

  lastReportText = JSON.stringify(report, null, 2);
  reportEl.textContent = lastReportText;

  const events = Array.isArray(report.events) ? report.events : [];
  const gdmCalls = events.filter((event) => event.type === "gdm:call").length;
  const gdmErrors = events.filter((event) => event.type === "gdm:error").length;
  const ended = events.filter((event) => event.type === "track:ended").length;
  const clampErrors = events.filter((event) => event.type === "safeClamp:error").length;

  if (gdmErrors > 0 || ended > 0 || clampErrors > 0) {
    setStatus(
      `Shim activo. ${gdmCalls} llamada(s) a getDisplayMedia, ${gdmErrors} error(es), ${ended} track(s) terminado(s), ${clampErrors} error(es) de clamp.`,
      "warn"
    );
  } else if (gdmCalls > 0) {
    setStatus(
      `Shim activo. ${gdmCalls} llamada(s) a getDisplayMedia registradas.`,
      "pass"
    );
  } else {
    setStatus(
      "Shim activo, pero aún no se ha intentado compartir pantalla en esta pestaña.",
      ""
    );
  }
}

async function copyReport() {
  if (!lastReportText) {
    setStatus("No hay informe que copiar. Pulsa “Analizar pestaña” primero.", "warn");
    return;
  }

  try {
    await navigator.clipboard.writeText(lastReportText);
    setStatus("Informe copiado al portapapeles.", "pass");
  } catch (error) {
    setStatus(`No se pudo copiar: ${error.message}`, "fail");
  }
}

for (const element of Object.values(controls)) {
  element.addEventListener("change", () => {
    saveConfig().catch((error) => {
      setConfigStatus(`Error inesperado: ${error.message}`);
    });
  });
}

resetButton.addEventListener("click", async () => {
  renderConfig(DEFAULTS);
  await saveConfig();
});

refreshButton.addEventListener("click", () => {
  collectReport().catch((error) => {
    setStatus(`Error inesperado: ${error.message}`, "fail");
  });
});

copyButton.addEventListener("click", () => {
  copyReport().catch((error) => {
    setStatus(`Error inesperado: ${error.message}`, "fail");
  });
});

loadConfig()
  .then(() => collectReport())
  .catch((error) => {
    setStatus(`Error inesperado: ${error.message}`, "fail");
  });
