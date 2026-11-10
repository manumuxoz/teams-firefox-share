# Scripts

- `run-firefox-x11.sh`: lanza Firefox en XWayland/X11 para comparar con la ruta Wayland.
- `smoke-extension.sh`: carga la extensión en Firefox headless y espera el marcador de add-on temporal. Lo usa `make smoke` y el CI.
- `package.sh`: genera el zip de fuentes, `SHA256SUMS` y valida que el archivo incluya `extension/src/config-bridge.js`.

La instalación o compilación de `xdg-desktop-portal-hyprland` no se automatiza: depende de la distribución y de la versión de Hyprland. Usa el paquete de tu distro o compila desde la release oficial:

<https://github.com/hyprwm/xdg-desktop-portal-hyprland/releases>

Si tu distro no tiene 1.5.0+, el doctor puede aplicar `force_shm` como mitigación.
