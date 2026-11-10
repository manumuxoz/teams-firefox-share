#!/usr/bin/env python3
"""
Optional real-browser integration check.

Requires:
  - selenium (pip install selenium)
  - geckodriver in PATH or GECKODRIVER=/path/to/geckodriver
  - a built XPI in dist/ (make build)
  - network access to teams.microsoft.com

This is intentionally not part of `make ci`: it needs a real Firefox + network
and takes longer. It verifies that the MAIN-world shim is present on the Teams
page and that the isolated config bridge delivered the stored config.

SPDX-License-Identifier: MPL-2.0
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import time
import warnings
from pathlib import Path

try:
    from selenium import webdriver
    from selenium.webdriver.firefox.options import Options
    from selenium.webdriver.firefox.service import Service
    from selenium.webdriver.support.ui import WebDriverWait
except ImportError:
    print("Falta selenium. Instala con: python3 -m pip install selenium", file=sys.stderr)
    raise SystemExit(2)


ROOT = Path(__file__).resolve().parents[2]
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
DEFAULT_XPI = ROOT / "dist" / f"teams-screenshare-fix-{VERSION}.xpi"


def main() -> int:
    xpi = Path(os.environ.get("XPI", DEFAULT_XPI))
    if not xpi.is_file():
        print(f"No existe {xpi}; ejecuta 'make build' primero.", file=sys.stderr)
        return 2

    geckodriver = os.environ.get("GECKODRIVER") or shutil.which("geckodriver")
    if not geckodriver:
        print("No se encontró geckodriver (usa GECKODRIVER=/ruta).", file=sys.stderr)
        return 2

    firefox = os.environ.get("FIREFOX_BIN") or shutil.which("firefox")
    if not firefox:
        print("No se encontró Firefox (usa FIREFOX_BIN=/ruta).", file=sys.stderr)
        return 2

    options = Options()
    options.add_argument("-headless")
    options.binary_location = firefox
    options.set_preference("xpinstall.signatures.required", False)

    service = Service(geckodriver, log_output=os.devnull)
    driver = webdriver.Firefox(service=service, options=options)

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            driver.install_addon(str(xpi), temporary=True)
        driver.get("https://teams.microsoft.com/v2/")

        def report(driver):
            return driver.execute_script(
                """
                if (!window.__teamsShareFixInstalled_v2) return null;
                if (typeof window.__teamsShareFixReport !== "function") return null;
                return window.__teamsShareFixReport();
                """
            )

        result = WebDriverWait(driver, 30).until(report)

        if not result:
            print("El shim no se inyectó en la página de Teams.", file=sys.stderr)
            return 1

        environment = result.get("environment", {})
        config = result.get("config", {})

        checks = {
            "installed": True,
            "version": (result.get("shim") or {}).get("version"),
            "href": environment.get("href"),
            "hasGetDisplayMedia": environment.get("hasGetDisplayMedia"),
            "configRev": environment.get("configRev"),
            "config": config,
            "eventTypes": sorted({event.get("type") for event in result.get("events", [])}),
        }
        print(json.dumps(checks, indent=2, ensure_ascii=False))

        if checks["version"] != VERSION:
            print(f"Versión inesperada: {checks['version']} != {VERSION}", file=sys.stderr)
            return 1
        if not checks["hasGetDisplayMedia"]:
            print("getDisplayMedia no está disponible en la página.", file=sys.stderr)
            return 1
        if not isinstance(checks["configRev"], int) or checks["configRev"] < 1:
            print("El config bridge no entregó la configuración.", file=sys.stderr)
            return 1

        print("integration: OK")
        return 0
    finally:
        time.sleep(1)
        driver.quit()


if __name__ == "__main__":
    raise SystemExit(main())
