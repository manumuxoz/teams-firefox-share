#!/usr/bin/env bash
#
# Lanza una instancia nueva de Firefox forzando X11/XWayland.
# Útil para comprobar si el fallo está en la ruta Wayland/PipeWire.
#
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail

if [[ -z "${DISPLAY:-}" ]]; then
  echo "No hay DISPLAY. XWayland no está disponible en esta sesión." >&2
  echo "Prueba a iniciar una sesión X11 o revisa la configuración de Hyprland." >&2
  exit 1
fi

exec env MOZ_ENABLE_WAYLAND=0 firefox --new-instance "$@"
