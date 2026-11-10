# Diagnóstico

Este documento asume Firefox en Linux y Teams for Web. El objetivo es separar el fallo de Teams, el de los constraints y el del portal Wayland antes de tocar nada.

## 1. Clasifica el síntoma

| Síntoma | Modo probable | Siguiente prueba |
|---|---|---|
| No aparece “Compartir pantalla”, o está deshabilitado | A — política/rol/1:1 | ¿Es una reunión o una llamada 1:1? ¿Qué política tiene el tenant? |
| Aparece el botón, el preview local se ve, pero el remoto ve negro/congelado | B — constraints/SFU | `about:webrtc`, consola, extensión |
| El selector aparece, eliges pantalla y el stream muere a los 1–2 frames | C — portal Wayland | Test page fuera de Teams, logs del portal |
| Funciona 30–50 min y Firefox se queda sin memoria | D — OOM | `about:memory`, bug 2081652 |
| El vídeo va, pero no hay audio de sistema/pestaña | E — audio no implementado | Bug 1541425 |

## 2. Prueba de control fuera de Teams

Abre en Firefox:

```text
https://mozilla.github.io/webrtc-landing/gum_test.html
```

Comparte pantalla. Si **también falla**, el problema es del portal/compositor, no de Teams. Si **funciona**, el problema está en la capa de Teams (constraints, SDP, política o extensión).

## 3. Comprobaciones en Firefox

### `about:support`

- **Window Protocol:** debe ser `wayland` si estás en Wayland. Si dice `x11`, Firefox está en XWayland o en X11.
- **Web Compatibility Interventions:** debe estar activo.
- **Media:** busca `OpenH264` y el estado de GMP.

### `about:compat`

Busca `teams.microsoft.com`. Debe aparecer la intervención `2000906` con los dominios:

- `teams.microsoft.com`
- `teams.cloud.microsoft`
- `teams.live.com`

Si no aparece, actualiza Firefox o revisa `extensions.webcompat.perform_injections`.

### `about:plugins`

Confirma que **OpenH264** está instalado y habilitado. Microsoft documenta que sin él puede fallar el sharing.

### `about:webrtc`

Durante una compartición:

- Busca la `m-line` de screen share.
- Mira `framesEncoded`: si se queda en 0, el problema es de encoder/codec.
- Si `framesEncoded` sube pero el remoto ve negro, el problema es de negociación/SFU.

### Consola del navegador

Abre la consola (Ctrl+Shift+K) y busca:

- `getDisplayMedia` / `NotAllowedError` / `InvalidStateError`.
- `AbortError: The fetching process for the media resource was aborted`.
- `Attempt to postMessage on disconnected port`.
- Errores de `resizeMode` o constraints.

## 4. Comprobaciones del portal (Wayland)

```bash
# Servicios
systemctl --user status xdg-desktop-portal xdg-desktop-portal-hyprland pipewire wireplumber

# ScreenCast por D-Bus
gdbus call --session --dest org.freedesktop.portal.Desktop \
  --object-path /org/freedesktop/portal/desktop \
  --method org.freedesktop.DBus.Properties.Get \
  org.freedesktop.portal.ScreenCast version

# Backend que implementa ScreenCast
grep -H '^Interfaces=' /usr/share/xdg-desktop-portal/portals/*.portal

# Logs en vivo
journalctl --user -u xdg-desktop-portal-hyprland -u xdg-desktop-portal -f
```

Señales de fallo:

- `Out of buffers`
- `selection -1`
- `Session destroyed` repetido en ráfaga
- `DMA-BUF` con errores de negociación

## 5. Wayland/Hyprland: XDPH 1.4.x

`xdg-desktop-portal-hyprland` 1.4.0/1.4.1 no incluye el fix de congelación por out-of-buffers (PR #424, incluido en 1.5.0). Si estás en 1.4.x:

### Opción A — actualizar

Actualiza a 1.5.0 o superior según tu distribución.

### Opción B — forzar SHM

Crea o edita `~/.config/hypr/xdph.conf`:

```ini
screencopy {
    force_shm = true
}
```

Reinicia:

```bash
systemctl --user restart xdg-desktop-portal-hyprland xdg-desktop-portal
```

SHM es más lento que DMA-BUF, pero evita fallos de negociación en GPUs/drivers problemáticos.

### Opción C — selector legacy

Si usas `hyprland-preview-share-picker` y el selector devuelve `-1`:

```ini
screencopy {
    custom_picker_binary = hyprland-share-picker
}
```

### Opción D — XWayland/X11

```bash
MOZ_ENABLE_WAYLAND=0 firefox --new-instance
```

Si así funciona, el fallo está en la ruta Wayland/PipeWire. Es un buen control, no una solución permanente.

## 6. Teams: reunión vs llamada 1:1

Microsoft documenta:

- **Meetings:** audio, vídeo y sharing **fully supported** en Firefox.
- **Calling (1:1):** **not supported** en Firefox.

Si el fallo ocurre en un chat 1:1, no es un bug de la extensión. Usa Edge/Chrome o la app de escritorio.

## 7. Política de reunión

En Teams Admin Center:

- Meetings → Meeting policies → Content sharing.
- Si está en **Single Application**, las opciones de pantalla/ventana pueden desaparecer.
- El rol de asistente sin permiso de presentador también impide compartir.

## 8. Doctor

```bash
python3 tools/teams-ss-doctor --verbose
python3 tools/teams-ss-doctor --json
```

El doctor no modifica nada por defecto. Los fixes son opt-in:

```bash
python3 tools/teams-ss-doctor --fix xdph-force-shm --dry-run
python3 tools/teams-ss-doctor --fix xdph-force-shm
python3 tools/teams-ss-doctor --fix restart-portal
python3 tools/teams-ss-doctor --fix x11-command
```

## 9. Qué adjuntar a un issue

- Salida de `python3 tools/teams-ss-doctor --json`.
- `firefox --version`.
- `echo $XDG_SESSION_TYPE`, `echo $XDG_CURRENT_DESKTOP`, `echo $WAYLAND_DISPLAY`.
- Versión de `xdg-desktop-portal-hyprland` (o backend equivalente).
- Informe del popup de la extensión.
- Captura de `about:support` (sección Media/WebRTC) si es posible.

No incluyas cookies, tokens, correos ni contenido de reuniones.
