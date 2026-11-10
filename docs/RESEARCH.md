# Investigación y evidencia

Consulta: 2026-11-10. Este documento resume las fuentes que sostienen el plan. No es una tesis: es la evidencia mínima para decidir qué construir y qué no.

## 1. Microsoft: Firefox sí está soportado en reuniones

**Fuente:** [Limits and specifications for Microsoft Teams](https://learn.microsoft.com/en-us/microsoftteams/limits-specifications-teams) (actualizada 2026-07-16).

| Navegador | Calling (audio, vídeo, sharing) | Meetings (audio, vídeo, sharing) |
|---|---|---|
| Firefox, últimas 3 versiones | **Not supported** | **Fully supported** |
| Chrome, últimas 3 versiones | Fully supported | Fully supported |
| Edge Chromium, últimas 3 versiones | Fully supported | Fully supported |

Nota textual:

> “Users are required to have the OpenH264 plugin in Firefox for full support. Browsers without this plugin may see disruptions in the meeting, including in screen sharing activity.”

**Implicación:** si el fallo es en una llamada 1:1, no hay nada que arreglar en Firefox. Si es en una reunión, el soporte es oficial y el fallo es de implementación/entorno.

## 2. Mozilla: la regresión de `resizeMode` y la intervención 2000906

**Bug:** [2000906 — Sharing the entire screen on Teams fails](https://bugzilla.mozilla.org/show_bug.cgi?id=2000906) (ASSIGNED, `webcompat:sitepatch-applied`).

**Código:** [`disable_resizeMode_in_GDM.js`](https://github.com/mozilla-firefox/firefox/blob/main/browser/extensions/webcompat/injections/js/disable_resizeMode_in_GDM.js).

La intervención:

- envuelve `MediaDevices.prototype.getDisplayMedia`;
- envuelve `MediaStreamTrack.prototype.applyConstraints`;
- elimina `resizeMode: "none"` cuando hay `width`, `height` o `frameRate`;
- se aplica a `teams.microsoft.com`, `teams.cloud.microsoft` y `teams.live.com`;
- usa `all_frames: true`.

**Estado local verificado:** Firefox 153.6.0esr contiene la intervención en `/usr/lib/firefox-esr/browser/omni.ja`, y `extensions.webcompat.perform_injections=true`.

**Implicación:** el fallo clásico “el remoto ve negro pero el preview local se ve” ya está mitigado en 153. Una extensión que solo duplique esto no aporta mucho; el valor está en el diagnóstico y en los casos que Mozilla no cubre.

## 3. Firefox: `getDisplayMedia` y sus límites

**MDN / BCD:** [`MediaDevices.json`](https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json).

| Capacidad | Firefox |
|---|---|
| `getDisplayMedia()` | 66+ |
| Captura de audio (`audio: true`) | **No** |
| `controller` / `CaptureController` | No |
| `selfBrowserSurface` / `surfaceSwitching` | No |
| `monitorTypeSurfaces` / `preferCurrentTab` | No |
| `systemAudio` / `windowAudio` | No |

**Implicación:** “compartir audio del sistema” no es un bug de Teams; es una capacidad ausente en Firefox. No se puede arreglar con una extensión.

## 4. Wayland: portal, PipeWire y XDPH

**Fuentes:**

- [Hyprland Wiki — Screen sharing](https://wiki.hypr.land/Useful-Utilities/Screen-Sharing)
- [Hyprland Wiki — xdg-desktop-portal-hyprland](https://wiki.hypr.land/Hypr-Ecosystem/xdg-desktop-portal-hyprland)
- [XDPH issue #423](https://github.com/hyprwm/xdg-desktop-portal-hyprland/issues/423)
- [XDPH PR #424](https://github.com/hyprwm/xdg-desktop-portal-hyprland/pull/424)
- [XDPH v1.5.0](https://github.com/hyprwm/xdg-desktop-portal-hyprland/releases/tag/v1.5.0)
- [XDPH issue #392](https://github.com/hyprwm/xdg-desktop-portal-hyprland/issues/392)

Hechos:

- En Wayland, Firefox captura vía `xdg-desktop-portal` + PipeWire.
- El backend debe implementar `org.freedesktop.impl.portal.ScreenCast`. `xdg-desktop-portal-gtk` **no** lo implementa; `xdg-desktop-portal-hyprland` sí.
- XDPH 1.4.0/1.4.1 no incluye el fix de congelación por out-of-buffers; 1.5.0 sí (PR #424).
- XDPH 1.4.1 soporta `screencopy:force_shm` y `screencopy:custom_picker_binary`.
- `force_shm = true` evita DMA-BUF y usa SHM; más lento, pero mitiga fallos de negociación.
- El selector `hyprland-preview-share-picker` puede devolver `selection -1`; el selector legacy `hyprland-share-picker` es el workaround.

**Implicación:** en Hyprland, el primer sospechoso no es Firefox ni Teams, sino la versión del portal y la ruta DMA-BUF.

## 5. Proyectos existentes

| Proyecto | Qué hace | Por qué no basta |
|---|---|---|
| [Mozilla WebCompat 2000906](https://bugzilla.mozilla.org/show_bug.cgi?id=2000906) | Parchea constraints de Teams | No toca portal, OOM ni audio |
| [teams-for-linux](https://github.com/IsmaelMartinez/teams-for-linux) | Wrapper Electron | No es Firefox |
| [PWAsForFirefox](https://github.com/filips123/PWAsForFirefox) | SSB de Firefox con perfil propio | Es un harness, no un fix |
| Teams Phone Fix / UA switchers | Cambian User-Agent | Obsoleto y contraproducente |
| Extensiones de UI de Teams | Layout, atajos | No tocan captura |

**Hueco:** no hay una extensión de Firefox que combine shim + diagnóstico + workarounds de portal. Ese es el espacio del repo.

## 6. Lo que dice el cliente de Teams (inspección de bundle)

Inspección del bundle `calling-pluginless` (nov-2026):

- La comprobación de sharing es `!!navigator.mediaDevices?.getDisplayMedia`.
- No hay comprobación de marca de navegador.
- La tabla de plataformas incluye Firefox 96+.
- Teams llama a `getDisplayMedia` con `resizeMode:"none"`, `width.max`, `height.max`, `frameRate.max`.
- No usa `chromeMediaSource` en la ruta actual.

**Implicación:** el botón debería aparecer; si no aparece, es política/rol/1:1 o una versión vieja. Si aparece y falla, es captura/constraints/negociación.

## 7. Reportes de campo que muestran el patrón

- [Ask Ubuntu 1567512](https://askubuntu.com/questions/1567512/how-do-i-share-my-screen-with-teams-in-firefox-ubuntu-26-04-wayland) (jun-2026): Firefox 149 en Ubuntu 26.04 Wayland, el picker aparece y el stream muere; Chrome funciona; X11 funciona.
- [Microsoft Q&A 5918672](https://learn.microsoft.com/en-au/answers/questions/5918672/microsoft-teams-with-firefox-on-linux) (jun-2026): el stream termina a los 1–2 frames; también ocurre en Chromium/Edge en algunas máquinas; logs con `412 / 6302 Property Sequence Number doesn't match`.
- [Arch BBS 305866](https://bbs.archlinux.org/viewtopic.php?id=305866) (may-2025): Teams web en KDE Wayland; el test page funciona, Teams no; se sospecha de la integración de Plasma.
- [Omarchy #3997](https://github.com/basecamp/omarchy/discussions/3997) (dic-2025): el picker nuevo devuelve `-1`; el legacy funciona.

**Implicación:** no hay una causa única. El doctor tiene que distinguir portal, constraints y Teams.

## 8. Estado de la máquina analizada

| Elemento | Valor |
|---|---|
| Firefox | 153.6.0esr |
| Sesión | Wayland / Hyprland |
| Portal | xdg-desktop-portal 1.20.3 |
| Backend | xdg-desktop-portal-hyprland 1.4.1 |
| ScreenCast | D-Bus v5 |
| PipeWire | 1.4.2 + WirePlumber 0.5.12 |
| OpenH264 | 2.6.0 |
| WebCompat 2000906 | Presente, 3 dominios |
| GPU | Intel Iris Xe |

**Conclusión:** el stack está bien; el punto débil es XDPH 1.4.1 + DMA-BUF. El plan prioriza actualizar a 1.5.0 o probar `force_shm` antes de escribir más código.

## 9. Preguntas abiertas

1. ¿El fallo ocurre en reunión o en llamada 1:1?
2. ¿Falla también el test page fuera de Teams?
3. ¿Qué dice `about:webrtc` sobre `framesEncoded`?
4. ¿XDPH 1.5.0 está disponible en Debian backports o hay que compilar?
5. ¿`force_shm` elimina el fallo en esta GPU?
6. ¿Teams en Chromium/Edge funciona en la misma máquina? (control)
7. ¿La política de reunión permite compartir pantalla/ventana?

Las respuestas a estas preguntas determinan si el repo debe priorizar la extensión, el doctor o los workarounds de portal.
