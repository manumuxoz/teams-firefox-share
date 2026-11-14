# PLAN — Teams screen sharing en Firefox (Linux/Wayland)

**Repositorio propuesto:** `teams-firefox-share`
**Estado:** plan de viabilidad + MVP inicial
**Fecha:** 2026-11-10
**Entorno objetivo principal:** Debian 13, Hyprland/Wayland, Firefox 153.6.0esr, PipeWire + xdg-desktop-portal-hyprland.

---

## 0. Resumen ejecutivo

**Veredicto: GO acotado.** Sí es posible crear un repositorio útil, pero no existe una extensión de Firefox que arregle el 100 % de los fallos de compartir pantalla en Teams. El problema ya no es el bloqueo histórico de Microsoft: Teams for Web soporta Firefox en reuniones y el cliente actual solo comprueba que exista `navigator.mediaDevices.getDisplayMedia`. Quedan dos familias de fallos distintas:

1. **Constraints/SFU de Teams:** Teams pide `resizeMode: "none"` junto con topes de resolución/fps; Firefox los interpreta de forma que envía vídeo a resolución nativa y el SFU de Teams lo descarta. Mozilla ya lo parchea con la intervención WebCompat 2000906, presente en Firefox 153.
2. **Captura Wayland/PipeWire:** el selector del portal aparece, pero el stream muere a los pocos frames, se congela o sale negro. Esto ocurre por debajo de la API web; una extensión no puede arreglarlo. En tu equipo el sospechoso principal es `xdg-desktop-portal-hyprland` 1.4.1, que no incluye el fix de congelación publicado en 1.5.0, y la ruta DMA-BUF.

**Qué puede hacer el repositorio:**

- Extensión Firefox MV3 con un shim de compatibilidad para `getDisplayMedia`, `applyConstraints` y peticiones legacy `chromeMediaSource`.
- Diagnóstico en página: constraints reales, settings del track, codecs, eventos `ended`, errores.
- Doctor CLI para el sistema: sesión, portal, backend ScreenCast, PipeWire, OpenH264, intervención WebCompat, prefs, versión de XDPH y logs.
- Workarounds opt-in para el portal (forzar SHM, selector legacy, reiniciar servicios) con backup.
- Perfil dedicado / lanzador X11 y plantilla para PWAsForFirefox.
- Documentación honesta de lo que no se puede arreglar: muerte del portal, OOM de OpenH264, audio de sistema y llamadas 1:1.

**Qué no puede hacer:**

- Resucitar un stream que el portal/compositor destruye.
- Evitar el OOM de OpenH264 en reuniones largas (bug 2081652).
- Capturar audio de sistema/pestaña (`getDisplayMedia({audio:true})` no está implementado en Firefox; bug 1541425).
- Convertir una llamada 1:1 en una reunión: Microsoft documenta “Calling: Not supported” en Firefox.

**Recomendación inmediata:** antes de escribir la extensión, ejecutar la Fase 0 de este plan. En tu máquina concreta, actualizar XDPH a 1.5.0 o probar `force_shm = true` es más probable que arregle el fallo que cualquier parche JavaScript.

### 0.1 Estado de implementación (2026-11-14)

Implementado en este repositorio:

- [x] Fase 1 — MVP: extensión MV3, shim de constraints, popup de diagnóstico, doctor read-only, tests y documentación.
- [x] Fase 2 — configuración persistente, config bridge aislado, safe clamp opcional, toggles, CI, empaquetado `.xpi`.
- [x] Fase 3 parcial — fixes opt-in del doctor (`force_shm`, picker legacy, reinicio del portal), perfil dedicado y lanzador X11.
- [x] Preparación para GitHub — comunidad, seguridad, privacidad, Dependabot, iconos, ID estable y guía de publicación.
- [x] Push a GitHub — <https://github.com/manumuxoz/teams-firefox-share>.
- [x] Release `v0.2.0` publicado con XPI, fuentes y `SHA256SUMS`.
- [x] CI en `main` en verde y branch protection configurada.
- [ ] Validación end-to-end en un tenant real de Teams (requiere cuenta y reunión).
- [ ] Firma y publicación en AMO (requiere credenciales).
- [ ] Actualización de XDPH a 1.5.0 en la máquina de referencia (decisión del operador).

Pipeline fijo: `make ci` → `deps → lint → test → build → smoke → package`. Ver `docs/PIPELINE.md`.

---

## 1. Contexto: qué cambió y qué se rompe ahora

### 1.1 Historial relevante

| Fecha | Cambio | Efecto |
|---|---|---|
| 2019–2022 | Teams usaba UA sniffing y SDP Plan B, exclusivo de Chromium | Firefox quedaba fuera; el botón de compartir no funcionaba |
| Oct 2022 | Microsoft habilita outgoing screen share en Teams clásico para Firefox | Primer cambio real |
| Abr 2024 | New Teams for Web GA en Firefox (Windows/macOS/Linux) | Teams deja de bloquear Firefox a nivel de producto |
| Firefox 144/145 (2025) | Firefox implementa `resizeMode` en `getDisplayMedia` | Regresión: Teams pide `resizeMode:"none"` + topes; el SFU descarta el vídeo |
| Nov 2025 | Mozilla crea la intervención WebCompat 2000906 | Elimina `resizeMode` cuando hay topes de resolución/fps |
| Jun 2026 | La intervención se amplía a `teams.cloud.microsoft` | El fix vuelve a aplicar tras la migración de dominio |
| 2026 | XDPH 1.5.0 corrige congelaciones por DMA-BUF/out-of-buffers | Relevante para Wayland/Hyprland |

### 1.2 Lo que dice Microsoft hoy

Documentación vigente de Microsoft Learn (`limits-specifications-teams`, actualizada 2026-07-16):

- **Firefox, últimas tres versiones:** *Meetings: Fully supported. Video: Fully supported. Sharing: Fully supported.*
- **Firefox, llamadas:** *Calling (audio, video, sharing): Not supported.*
- **Nota explícita:** se requiere el plugin **OpenH264** para soporte completo; sin él puede haber “disrupciones en la reunión, incluida la actividad de compartir pantalla”.

Esto tiene dos consecuencias prácticas:

1. Si el fallo ocurre en una **reunión** programada o en un canal, Firefox es oficialmente soportado.
2. Si ocurre en una **llamada 1:1** desde el chat, Microsoft no soporta sharing en Firefox. Ninguna extensión puede cambiar esa política del producto; la salida es Edge/Chrome o la app de escritorio.

### 1.3 Lo que hace el cliente de Teams (inspección de bundle, nov-2026)

El bundle de `calling-pluginless` usa una comprobación de capacidad muy simple:

```js
static isSupported() {
  return !!window.navigator.mediaDevices?.getDisplayMedia;
}
```

No hay comprobación de marca de navegador, no hay `chromeMediaSource` y la tabla de plataformas incluye Firefox 96+. Por tanto:

- **El botón debería aparecer** en Firefox 153.
- Si no aparece: política de reunión, rol de asistente, versión vieja o build endurecido.
- Si aparece y falla: captura, constraints o negociación, no un bloqueo de marca.

La llamada típica de Teams es:

```js
getDisplayMedia({
  video: {
    resizeMode: "none",
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { max: 15 }
  }
})
```

y después clona el track y aplica constraints con `resizeMode:"none"` y `width:1663, height:1080, frameRate:15`. Ese es el patrón que la intervención de Mozilla corrige.

### 1.4 Estado de la máquina inspeccionada

| Elemento | Valor observado | Estado |
|---|---|---|
| Firefox | 153.6.0esr (Debian, `/usr/lib/firefox-esr`) | Correcto |
| Sesión | Wayland, Hyprland, `XDG_SESSION_TYPE=wayland` | Correcto |
| `MOZ_ENABLE_WAYLAND` | `1` en la config de Hyprland | Correcto |
| Portal | `xdg-desktop-portal` 1.20.3, servicio activo | Correcto |
| Backend | `xdg-desktop-portal-hyprland` 1.4.1, `ScreenCast` presente | **Sospechoso** |
| ScreenCast | versión D-Bus 5 | Correcto |
| PipeWire | 1.4.2 + WirePlumber 0.5.12, activos | Correcto |
| OpenH264 | GMP 2.6.0 instalado en el perfil | Correcto |
| WebCompat | `extensions.webcompat.perform_injections=true`; intervención 2000906 presente en `browser/omni.ja`; cubre `teams.microsoft.com`, `teams.cloud.microsoft`, `teams.live.com` | Correcto |
| GPU | Intel Iris Xe (Raptor Lake-P), sin NVIDIA | Reduce pero no elimina el riesgo DMA-BUF |
| `~/.config/hypr/xdph.conf` | No existe; se usa el selector y la ruta DMA-BUF por defecto | **Sospechoso** |

**Conclusión local:** el stack está bien montado y el parche de constraints de Mozilla ya está presente. Lo que queda es la ruta de captura del portal. XDPH 1.4.1 es anterior a la corrección de congelación de 1.5.0; además, sin `force_shm`, la negociación DMA-BUF puede fallar o congelarse. Es el primer sitio donde mirar.

---

## 2. Diagnóstico: los cinco modos de fallo

### Modo A — Llamada 1:1 o política/rol

**Síntoma:** no hay opción de compartir, o aparece deshabilitada.
**Causa:** Microsoft no soporta sharing en llamadas 1:1 desde Firefox; o la política de reunión limita el sharing a “Single Application” y elimina las opciones de pantalla/ventana; o el usuario es asistente sin permiso de presentador.
**Cómo confirmar:** probar en una reunión de calendario/canal, no en un chat 1:1. Revisar Teams Admin Center → Meeting policies → Content sharing.
**Solución:** usar reunión, cambiar política o usar Edge/Chrome/app de escritorio. **No es arreglable por extensión.**

### Modo B — Constraints/SFU: el vídeo local se ve, el remoto ve negro o congelado

**Síntoma:** el preview local funciona; los demás ven negro, congelado o solo el primer frame. Puede ocurrir en reuniones de grupo.
**Causa:** `resizeMode:"none"` hace que Firefox ignore los topes y envíe resolución nativa/fps alto; el SFU de Teams descarta el stream. También puede faltar OpenH264 y no negociar un códec que Teams acepte.
**Cómo confirmar:** `about:webrtc` → `framesEncoded`; consola con el shim; `getSettings()` del track; comparar con la intervención de Mozilla activa en `about:compat`.
**Solución:** intervención 2000906 (ya presente en 153), extensión con shim, verificar OpenH264, probar “safe clamp” a 1080p15.

### Modo C — Portal Wayland: el selector aparece y el stream muere

**Síntoma:** se abre el picker, se elige pantalla/ventana, el indicador de compartir aparece un instante y desaparece; consola con `NotAllowedError`, `AbortError` o `Attempt to postMessage on disconnected port`; el test de WebRTC fuera de Teams también falla.
**Causa:** portal/compositor/PipeWire. En Hyprland: bugs de DMA-BUF, out-of-buffers, congelación de XDPH 1.4.0/1.4.1, selector custom que devuelve `-1`, o variables de entorno incompletas.
**Cómo confirmar:** probar `https://mozilla.github.io/webrtc-landing/gum_test.html` en Firefox. Si falla ahí, no es Teams.
**Solución:** actualizar XDPH a 1.5.0+, `force_shm=true`, selector legacy, revisar `XDG_SESSION_TYPE`/`WAYLAND_DISPLAY`, probar XWayland/X11. **No es arreglable por extensión.**

### Modo D — OOM en reuniones largas

**Síntoma:** tras 30–50 minutos compartiendo, Firefox se queda sin memoria o se cierra; el uso de shared memory del proceso GMP crece.
**Causa:** bug 2081652 (abierto, oct-2026), relacionado con OpenH264/GMP y screen sharing.
**Solución:** por ahora, cortar y reiniciar la compartición, usar Chromium/Edge para sesiones largas, seguir el bug. **No es arreglable por extensión.**

### Modo E — Audio de sistema/pestaña

**Síntoma:** “compartir audio del sistema” no funciona o el otro lado no oye nada.
**Causa:** Firefox no implementa captura de audio en `getDisplayMedia` (bug 1541425).
**Solución:** workaround con PipeWire (`module-remap-source` del monitor del sink como micrófono virtual) o usar Chromium/Edge. **No es arreglable por extensión.**

### Árbol de decisión

```text
¿Es una reunión o una llamada 1:1?
├─ 1:1 / chat → no soportado en Firefox. Usa Edge/Chrome/app. FIN.
└─ Reunión
   ├─ ¿No aparece el botón de compartir?
   │  ├─ Política "Single Application" o rol sin permiso → revisar tenant. FIN.
   │  └─ Versión/build rara → actualizar Firefox; comprobar getDisplayMedia. 
   └─ ¿Aparece el botón?
      ├─ ¿Falla también el test page fuera de Teams?
      │  └─ Portal/compositor. Ver Modo C: XDPH, force_shm, X11. FIN.
      └─ ¿Solo falla en Teams?
         ├─ Preview local OK + remoto negro → constraints/SFU. Ver Modo B.
         ├─ Falla tras 30–50 min → OOM. Ver Modo D.
         └─ No hay audio → Modo E.
```

---

## 3. Soluciones existentes y hueco real

| Solución | Qué es | Estado 2026 | Limitación |
|---|---|---|---|
| **Mozilla WebCompat 2000906** | Intervención privilegiada incluida en Firefox | Activa en 153; cubre los tres dominios | Solo corrige `resizeMode`; no toca portal, OOM ni audio |
| **teams-for-linux** | Wrapper Electron de Teams | Mantenido; usa Chromium | No es Firefox |
| **PWAsForFirefox** | SSB de Firefox con perfil propio | Mantenido | Es un harness, no un fix; Teams requiere instalar con manifest parsing desactivado |
| **UA spoof** (Teams Phone Fix, switchers) | Extensión que cambia User-Agent | Obsoleto | Teams ya soporta Firefox; el spoof puede forzar rutas Chromium y romper más |
| **Extensions de UI de Teams** | Refined Teams, enhancer | Irrelevantes | No tocan captura |
| **Guías de portal** (Arch Wiki, Hyprland Wiki) | Configuración de PipeWire/portal | Válidas | No empaquetan diagnóstico ni workarounds |

**Hueco:** no existe una extensión de Firefox enfocada a diagnosticar y compatibilizar la captura de Teams, ni una herramienta que una extensión + doctor de portal + workarounds. Ese es el espacio del repo.

**Advertencia estratégica:** si el único problema fuera `resizeMode`, la intervención de Mozilla ya lo resuelve y una extensión nueva sería redundante. El valor del repo debe ser el diagnóstico, la compatibilidad con forks/versiones viejas, el “safe clamp” y los workarounds de portal. Si eso no aporta, lo correcto es contribuir a WebCompat, no publicar otra extensión.

---

## 4. Propuesta de repositorio

### 4.1 Nombre y posicionamiento

- **Repo:** `teams-firefox-share`
- **Extensión:** “Teams Screen Share Fix (Unofficial)”
- **Licencia:** MPL-2.0 (compatible con el ecosistema Firefox y con el código de la intervención de Mozilla).
- **Marca:** dejar claro “Unofficial”; no usar logos de Microsoft/Teams.

### 4.2 Objetivos

1. Que una persona con Firefox + Teams + Linux pueda saber **en menos de 5 minutos** si su fallo es de Teams, de constraints, del portal o del hardware.
2. Aplicar automáticamente los workarounds seguros de la capa web.
3. Ofrecer workarounds opt-in para el portal, con backup y reversión.
4. Documentar con honestidad lo que no se puede arreglar.

### 4.3 No objetivos

- No prometer que “todos los casos” funcionarán.
- No implementar un proxy local que reescriba el JS de Teams.
- No usar un helper nativo para inyectar un `MediaStream` falso.
- No hacer UA spoof.
- No capturar audio de sistema por medios artificiales dentro de la extensión.

### 4.4 Arquitectura

```text
┌──────────────────────────────────────────────────────────────┐
│ Firefox 142+ / 153 ESR                                       │
│                                                              │
│  Teams Web (teams.microsoft.com / cloud / live)              │
│    │                                                         │
│    │  getDisplayMedia / applyConstraints / getUserMedia      │
│    ▼                                                         │
│  shim.js  (MAIN world, document_start, all_frames)           │
│    ├─ sanitize resizeMode + caps                             │
│    ├─ map legacy chromeMediaSource → getDisplayMedia         │
│    ├─ diagnostics ring buffer                                │
│    └─ composition with Mozilla WebCompat 2000906             │
│                                                              │
│  popup  ── scripting.executeScript(world:"MAIN") ──► report  │
└──────────────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────┐
│ Sistema                                                      │
│  teams-ss-doctor (Python 3, stdlib)                          │
│    ├─ sesión / Wayland / X11                                 │
│    ├─ portal + backend ScreenCast                            │
│    ├─ PipeWire / WirePlumber                                 │
│    ├─ XDPH versión + xdph.conf + logs                        │
│    ├─ OpenH264 / prefs / WebCompat intervention              │
│    ├─ Teams endpoints                                        │
│    └─ --fix opt-in con backup                                │
└──────────────────────────────────────────────────────────────┘
```

### 4.5 Estructura propuesta

```text
teams-firefox-share/
├── PLAN.md
├── README.md
├── LICENSE
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── Makefile
├── package.json
├── .editorconfig
├── .gitattributes
├── .gitignore
├── extension/
│   ├── manifest.json
│   ├── icons/
│   ├── src/
│   │   ├── config-defaults.js
│   │   ├── config-bridge.js
│   │   ├── lib/constraints.js
│   │   └── shim.js
│   └── popup/
│       ├── popup.html
│       ├── popup.js
│       └── popup.css
├── tools/
│   └── teams-ss-doctor
├── profile/
│   ├── user.js
│   └── README.md
├── scripts/
│   ├── README.md
│   ├── run-firefox-x11.sh
│   ├── smoke-extension.sh
│   └── package.sh
├── tests/
│   ├── config.test.mjs
│   ├── config-bridge.test.mjs
│   ├── constraints.test.mjs
│   ├── manifest.test.mjs
│   ├── shim.test.mjs
│   ├── version.test.mjs
│   ├── test_doctor.py
│   ├── fixtures/gdm.html
│   └── integration/test_extension.py
├── docs/
│   ├── DIAGNOSIS.md
│   ├── RESEARCH.md
│   ├── LIMITATIONS.md
│   ├── AUDIO.md
│   ├── PIPELINE.md
│   ├── AMO.md
│   ├── PRIVACY.md
│   └── GITHUB.md
└── .github/
    ├── workflows/ci.yml
    ├── workflows/release.yml
    ├── workflows/amo-sign.yml
    ├── dependabot.yml
    ├── pull_request_template.md
    └── ISSUE_TEMPLATE/
        ├── bug_report.md
        ├── feature_request.md
        └── config.yml
```

---

## 5. Diseño técnico de la extensión

### 5.1 Manifest (MV3)

El manifest real está en `extension/manifest.json`. Resumen:

```json
{
  "manifest_version": 3,
  "version": "0.2.0",
  "browser_specific_settings": {
    "gecko": {
      "strict_min_version": "142.0",
      "data_collection_permissions": { "required": ["none"] }
    }
  },
  "permissions": ["storage", "scripting"],
  "host_permissions": [
    "https://teams.microsoft.com/*",
    "https://teams.cloud.microsoft/*",
    "https://teams.live.com/*"
  ],
  "content_scripts": [
    {
      "run_at": "document_start",
      "all_frames": true,
      "match_about_blank": true,
      "match_origin_as_fallback": true,
      "world": "MAIN",
      "js": ["src/config-defaults.js", "src/lib/constraints.js", "src/shim.js"]
    },
    {
      "run_at": "document_start",
      "all_frames": true,
      "match_about_blank": true,
      "match_origin_as_fallback": true,
      "js": ["src/config-defaults.js", "src/config-bridge.js"]
    }
  ]
}
```

Notas:

- `world: "MAIN"` requiere Firefox 128+. El manifest fija `strict_min_version: 142.0` para poder usar `data_collection_permissions` (AMO lo exige desde 2025-11). Es la vía recomendada; evita Xray y CSP.
- El segundo content script corre en el mundo aislado y hace de puente entre `browser.storage.local` y el shim.
- `all_frames: true` cubre iframes same-origin y cross-origin donde Teams pueda llamar a la captura.
- No se usa `<script src="moz-extension://...">` porque la CSP de Teams lo bloquea.
- No se usa `exportFunction` en el MVP; se documenta como fallback para forks antiguos.

### 5.2 Shim de constraints

`src/lib/constraints.js` expone funciones puras y testeables:

```js
function sanitizeDisplayConstraints(constraints) {
  const input = constraints && typeof constraints === "object" ? constraints : {};
  const out = { ...input };
  if (out.video && typeof out.video === "object") {
    out.video = sanitizeVideo(out.video);
  }
  return out;
}

function sanitizeVideo(video) {
  const out = { ...video };
  if (out.resizeMode === "none" &&
      (out.width != null || out.height != null || out.frameRate != null)) {
    delete out.resizeMode;
  }
  return out;
}
```

Reglas:

- Si `resizeMode === "none"` y hay `width`, `height` o `frameRate`, se elimina `resizeMode`.
- Si solo hay `resizeMode:"none"` sin topes, se respeta.
- No se muta el objeto original.
- No se tocan `audio`, `advanced`, `min`/`exact` salvo que se añada un modo “strict” en fase 2.
- `applyConstraints` replica la lógica de Mozilla: solo elimina `resizeMode` si el track no lo tenía desde el inicio.

### 5.3 Shim de `getUserMedia` legacy

Algunas versiones de Teams/Electron usan:

```js
getUserMedia({
  video: {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: "screen:0:0"
    }
  }
})
```

Firefox ignora `mandatory` y devuelve la **cámara**. El shim detecta `chromeMediaSource: "desktop" | "tab"` y lo mapea a `getDisplayMedia`, dejando que el usuario elija la superficie:

```js
if (legacyDesktop) {
  return nativeGetDisplayMedia.call(navigator.mediaDevices, {
    video: mapCaps(source)
  });
}
```

Limitaciones:

- `chromeMediaSourceId` no se puede honrar en Firefox; el picker del sistema decide.
- La llamada debe ser síncrona dentro del gesto del usuario; el shim no hace `await` antes de llamar.
- Es una red de seguridad: el Teams actual no usa esta ruta.

### 5.4 Diagnóstico

El shim mantiene un buffer circular de eventos y una función global:

```js
window.__teamsShareFixReport = () => ({
  environment: {
    userAgent: navigator.userAgent,
    href: location.href,
    secureContext: window.isSecureContext,
    hasGetDisplayMedia: typeof navigator.mediaDevices?.getDisplayMedia === "function",
    codecs: RTCRtpSender.getCapabilities?.("video")?.codecs ?? null,
    webcompat: Array.from(window.__webcompat ?? [])
  },
  events: state.events
});
```

Eventos:

- `gdm:call` con constraints originales y saneados.
- `gdm:success` con `getSettings()`, `getConstraints()`, tracks y `readyState`.
- `gdm:error` con `name`/`message`.
- `track:ended`.
- `applyConstraints:call`.
- `gum:legacy-desktop`.

El popup ejecuta `browser.scripting.executeScript({world:"MAIN"})` para leer el informe. No se envía nada a ningún servidor.

### 5.5 Composición con Mozilla WebCompat

La intervención 2000906 ya envuelve `MediaDevices.prototype.getDisplayMedia` y `MediaStreamTrack.prototype.applyConstraints`. Nuestro shim debe:

- Guardar la función nativa **antes** de reemplazar.
- Marcar su wrapper con una propiedad (`__teamsShareFix`) para idempotencia.
- Llamar siempre al wrapper previo, no al nativo absoluto, para no romper la composición.
- No borrar `window.__webcompat`.

Esto permite que ambos parches convivan: si Mozilla ya eliminó `resizeMode`, el nuestro no encuentra nada que borrar y pasa de largo.

### 5.6 Por qué no UA spoof

- Teams ya detecta Firefox como plataforma soportada.
- `navigator.userAgentData`, `MediaStreamTrackProcessor`, `window.chrome` y otras APIs de Chromium no existen en Firefox.
- Un UA de Chrome puede hacer que Teams tome la ruta legacy `chromeMediaSource` y encienda la cámara en lugar de compartir.
- Rompe la autenticación condicional y el fingerprint del navegador.

**Decisión:** no implementar UA spoof.

### 5.7 Permisos y privacidad

- Solo `storage` y `scripting`; `activeTab` no es necesario porque hay host permissions explícitos.
- Host permissions limitados a los tres dominios de Teams.
- Sin telemetría, sin red, sin `eval`, sin código remoto.
- `data_collection_permissions: { required: ["none"] }`.
- El informe se copia manualmente al portapapeles; el usuario decide qué compartir.

### 5.8 Limitaciones de la extensión

- No puede arreglar el portal/compositor.
- No puede capturar audio de sistema.
- No puede evitar el OOM.
- No puede intervenir en un iframe cross-origin sin `allow="display-capture"`.
- No puede garantizar que Teams no cambie sus constraints mañana.

---

## 6. Diseño técnico del doctor

### 6.1 Objetivo

Dar un informe accionable, en texto o JSON, sin modificar nada por defecto. Los `--fix` son opt-in, con backup y confirmación.

### 6.2 Checks

| ID | Comprobación | Cómo | Resultado |
|---|---|---|---|
| `session` | `XDG_SESSION_TYPE`, `WAYLAND_DISPLAY`, `DISPLAY`, `MOZ_ENABLE_WAYLAND` | entorno | PASS/WARN/FAIL |
| `firefox` | versión, binario, `browser/omni.ja` | `firefox --version`, `zipfile` | PASS/WARN/FAIL |
| `webcompat` | intervención 2000906 y dominios | leer `omni.ja` | PASS/WARN |
| `prefs` | `media.webrtc.capture.allow-pipewire`, `media.navigator.video.resize_mode.enabled`, `media.gmp-gmpopenh264.enabled` | `prefs.js` | PASS/WARN |
| `openh264` | `libgmpopenh264.so` y versión | perfiles Firefox | PASS/WARN/FAIL |
| `portal` | servicio y versión ScreenCast | `gdbus` | PASS/WARN/FAIL/INFO |
| `backend` | `.portal` con `ScreenCast` y `UseIn` | `$XDG_DATA_HOME`/`$XDG_DATA_DIRS` + `/usr/share/...` | PASS/WARN/FAIL |
| `pipewire` | servicios y versión | `systemctl --user`, `pipewire --version` | PASS/WARN/INFO |
| `xdph` | versión y bug de freeze | `dpkg-query`/`rpm`/`pacman`/binario, release notes | WARN si 1.4.0/1.4.1 |
| `xdph-config` | `force_shm`, `custom_picker_binary` | `~/.config/hypr/xdph.conf` | INFO/WARN |
| `logs` | `Out of buffers` (duro); `Session destroyed`, `selection -1`, `DMA-BUF` (info) | `journalctl --user --since -24h` | INFO/WARN |
| `teams` | reachability de hosts | `urllib` con UA Firefox | PASS/WARN |
| `gpu` | NVIDIA / multi-GPU | `lspci`, `lsmod` | WARN/INFO |

### 6.3 Salida

```text
$ teams-ss-doctor
Teams screen share doctor — 2026-11-10
Session: wayland (Hyprland) ................ PASS
Firefox: 153.6.0esr ........................ PASS
WebCompat 2000906 .......................... PASS (teams.cloud.microsoft incluido)
OpenH264: 2.6.0 ............................ PASS
Portal ScreenCast: v5 ...................... PASS
Backend: xdg-desktop-portal-hyprland ....... PASS
XDPH: 1.4.1 ................................ WARN (freeze fix en 1.5.0; ver --fix xdph-force-shm)
PipeWire: 1.4.2 / WirePlumber 0.5.12 ....... PASS
xdph.conf: sin force_shm ................... INFO
Logs: sesiones cerradas, sin out-of-buffers .. INFO

Diagnóstico probable: portal Wayland (Modo C), no Teams.
Siguiente paso: probar force_shm o actualizar XDPH; si persiste, XWayland/X11.
```

### 6.4 Fixes opt-in

- `--fix xdph-force-shm`: añade `screencopy { force_shm = true }` a `~/.config/hypr/xdph.conf`, con backup `.bak.<timestamp>`.
- `--fix xdph-legacy-picker`: fija `custom_picker_binary = hyprland-share-picker`.
- `--fix restart-portal`: reinicia `xdg-desktop-portal-hyprland` y `xdg-desktop-portal`.
- `--fix x11-command`: imprime `MOZ_ENABLE_WAYLAND=0 firefox` para probar XWayland.
- `--json`: salida machine-readable para issues; no se combina con `--fix`.
- `--output FILE`: escribe el JSON en un archivo.
- `--dry-run`: muestra los cambios sin aplicarlos.
- `--force`: permite `force_shm` aunque XDPH sea >= 1.5.0.

**No** se automatiza la instalación de paquetes ni la compilación de XDPH; solo se documenta.

### 6.5 Detección de XDPH 1.4.x

El fix de congelación por out-of-buffers está en el PR #424, incluido en v1.5.0 (publicado 2026-10-28). Si el doctor detecta 1.4.0/1.4.1:

- WARN con enlace a la release y al issue.
- Recomendar actualizar a 1.5.0+.
- Si no hay paquete, probar `force_shm=true` como mitigación.
- Si el usuario tiene NVIDIA/multi-GPU, subir la prioridad del WARN.

---

## 7. Roadmap

### Fase 0 — Diagnóstico manual (30–60 min, sin código)

Objetivo: determinar si el fallo es de Teams, constraints o portal.

1. **Confirmar tipo de sesión:** ¿reunión de calendario/canal o llamada 1:1? Si es 1:1, no seguir; usar Edge/Chrome/app.
2. **`about:support`:** Window Protocol debe ser `wayland`; si es `x11`, revisar `MOZ_ENABLE_WAYLAND`.
3. **`about:compat`:** buscar `teams.microsoft.com`; debe aparecer la intervención 2000906. Si no aparece, probar `extensions.webcompat.perform_injections=true` y actualizar Firefox.
4. **`about:plugins`:** confirmar OpenH264 2.6.0 habilitado.
5. **Test page:** abrir `https://mozilla.github.io/webrtc-landing/gum_test.html` y compartir pantalla. Si falla, es portal (Modo C), no Teams.
6. **XDPH:** actualizar a 1.5.0 si el paquete existe; si no, crear `~/.config/hypr/xdph.conf`:
   ```ini
   screencopy {
       force_shm = true
   }
   ```
   y reiniciar:
   ```bash
   systemctl --user restart xdg-desktop-portal-hyprland xdg-desktop-portal
   ```
7. **Selector legacy:** si usas `hyprland-preview-share-picker`, probar `custom_picker_binary = hyprland-share-picker`.
8. **XWayland:** probar `MOZ_ENABLE_WAYLAND=0 firefox` en una instancia nueva. Si funciona, confirma portal vs X11.
9. **Control:** probar la misma reunión en Chromium/Edge. Si también falla, el problema es Teams/Linux o el portal, no Firefox.

**Criterio de salida:** saber si el fallo es A, B, C, D o E. Si es C, la extensión no es la solución; el repo debe centrarse en el doctor y los workarounds.

### Fase 1 — MVP del repositorio (1–2 días)

- [x] Crear scaffold del repo y `README.md`.
- [x] Extensión MV3 con `constraints.js` + `shim.js`.
- [x] Popup con informe y copia al portapapeles.
- [x] Doctor read-only con checks de sesión, portal, XDPH, OpenH264 y WebCompat.
- [x] Tests unitarios de constraints con Node.
- [x] `docs/DIAGNOSIS.md` y `docs/LIMITATIONS.md`.
- [x] Cargar la extensión temporalmente en Firefox 153 y verificar que el shim se instala antes que Teams.
- [x] Ejecutar el doctor en esta máquina y validar el informe.

**Criterio de aceptación:** en una página de prueba local, `getDisplayMedia({video:{resizeMode:"none",width:{max:1920},...}})` llega al nativo sin `resizeMode`; el popup muestra el informe; el doctor detecta XDPH 1.4.1 y OpenH264 2.6.0.

### Fase 2 — Producto mínimo publicable (1 semana)

- [x] Toggles en el popup: shim on/off, safe clamp, legacy mapping.
- [x] `safe clamp` opcional: tras adquirir el stream, aplicar `width:1920,height:1080,frameRate:15` al track antes de devolverlo.
- [x] Tests de `applyConstraints` y `getUserMedia` legacy.
- [x] `web-ext lint` y CI en GitHub Actions.
- [x] Empaquetado `.xpi`.
- [ ] Firma en AMO (unlisted); requiere credenciales.
- [x] `docs/AMO.md` con justificación de permisos y privacidad.
- [x] Plantilla de issue con salida del doctor.

**Criterio de aceptación:** `web-ext lint` sin errores; la extensión firmada se instala en Firefox 153; una reunión de prueba comparte pantalla durante 10 minutos sin regresión de cámara.

### Fase 3 — Workarounds de sistema y adopción (2–3 semanas)

- [x] `--fix xdph-force-shm` con backup y `--dry-run`.
- [x] `--fix xdph-legacy-picker`.
- [x] `scripts/run-firefox-x11.sh` y perfil dedicado.
- [x] Plantilla `profile/user.js` para PWAsForFirefox.
- [x] Detección de NVIDIA/multi-GPU y recomendación específica.
- [x] Documentar el workaround de audio con PipeWire.
- [ ] Release 1.0 y publicación listed en AMO (si la revisión lo permite).

**Criterio de aceptación:** un usuario con Hyprland 1.4.1 puede seguir el informe del doctor y resolver el Modo C sin editar archivos a mano.

---

## 8. Testing

### 8.1 Unitarios

- `sanitizeDisplayConstraints`:
  - elimina `resizeMode` con caps;
  - conserva `resizeMode` sin caps;
  - no muta el original;
  - soporta `video: true`, `undefined`, `null`.
- `sanitizeApplyConstraints`:
  - elimina `resizeMode` si el track no lo tenía;
  - lo conserva si el track ya lo tenía.
- `getLegacyDesktopSource` / `mapLegacyDesktopConstraints`:
  - detecta `mandatory.chromeMediaSource`;
  - detecta `chromeMediaSource` directo;
  - no intercepta una petición de cámara normal;
  - mapea `maxWidth`/`maxHeight`/`maxFrameRate`.

### 8.2 Integración en navegador

Página local `tests/fixtures/gdm.html`:

```js
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    resizeMode: "none",
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { max: 15 }
  }
});
console.log(stream.getVideoTracks()[0].getSettings());
```

Verificar:

- El shim se ejecuta antes del primer script de la página.
- `getSettings()` devuelve una resolución ≤1920×1080 y fps ≤15 (o la nativa si el usuario elige “sin límite”).
- `window.__teamsShareFixReport()` contiene `gdm:call` con `resizeMode` eliminado.
- No hay doble picker ni doble parche.

### 8.3 Matriz manual

| Firefox | Sesión | Portal | Teams | Resultado esperado |
|---|---|---|---|---|
| 153 ESR | Wayland | XDPH 1.5.0 | Reunión | Compartir OK |
| 153 ESR | Wayland | XDPH 1.4.1 + force_shm | Reunión | Compartir OK o diagnóstico claro |
| 153 ESR | XWayland/X11 | — | Reunión | Compartir OK |
| 159 release | Wayland | XDPH 1.5.0 | Reunión | Compartir OK |
| 153 ESR | Wayland | cualquiera | Llamada 1:1 | No soportado; el doctor lo dice |
| 153 ESR | Wayland | cualquiera | Reunión larga | Vigilar OOM |

### 8.4 CI

- `npm test` → Node test runner.
- `npx web-ext lint --source-dir extension --warnings-as-errors`.
- `python -m unittest discover -s tests`.
- `bash -n scripts/*.sh` y `python3 -m py_compile tools/teams-ss-doctor`.
- Validación JSON de `manifest.json`.
- Smoke test con Firefox headless (`scripts/smoke-extension.sh`).
- Empaquetado `.xpi` + `SHA256SUMS`.
- Sin secretos, sin red en tests unitarios.

---

## 9. Distribución y mantenimiento

### 9.1 Canales

1. **GitHub Releases:** `.xpi` sin firmar para desarrollo y `web-ext run`.
2. **AMO unlisted:** instalación permanente con firma, sin listado público.
3. **AMO listed:** cuando la extensión esté estable y la revisión acepte el parche a Teams.

### 9.2 Versionado

- SemVer: `0.x` durante el MVP, `1.0.0` tras la validación end-to-end.
- `CHANGELOG.md` con cambios de comportamiento y breaking changes.
- Cada release incluye SHA256 y notas de compatibilidad.

### 9.3 Vigilancia

- Bugzilla 2000906 (Teams + resizeMode), 2081652 (OOM), 1541425 (audio).
- Releases de `xdg-desktop-portal-hyprland` y `xdg-desktop-portal`.
- Cambios en el bundle de Teams (`calling-pluginless`) y en `teams.cloud.microsoft`.
- Notas de Firefox sobre `getDisplayMedia`, `resizeMode` y WebCompat.
- Issues de `teams-for-linux` y `PWAsForFirefox` como señales.

### 9.4 Política de privacidad

- No se recopila nada.
- El informe se genera localmente y se copia solo si el usuario lo pide.
- No se accede a cookies, credenciales ni contenido de reuniones.
- Solo se parchean APIs de captura en los dominios de Teams.

---

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Mozilla ya arregla el caso y la extensión es redundante | Alta | Medio | Posicionar como diagnóstico + compatibilidad; no duplicar sin valor |
| Teams cambia sus constraints o el bundle | Media | Alto | Parchear APIs estándar, no selectores DOM; tests con página local |
| El fallo real es el portal y la extensión no ayuda | Alta en Wayland | Alto | Doctor primero; workarounds XDPH/X11; ser honesto |
| AMO rechaza el parche a un sitio de Microsoft | Media | Medio | Permisos mínimos, sin código remoto, justificación clara, unlisted primero |
| El `safe clamp` rompe la cámara o el preview | Baja | Medio | Opt-in, tests, no tocar tracks que no sean de gDM |
| Doble parche con WebCompat | Media | Bajo | Idempotencia y composición; probar con intervención activa |
| Usuarios en llamadas 1:1 esperan que funcione | Alta | Medio | El doctor detecta el contexto y muestra el límite de Microsoft |
| OOM en reuniones largas | Media | Alto | Documentar; no prometer; recomendar Chromium/Edge para sesiones largas |
| Scripts de sistema rompen la config del usuario | Baja | Alto | `--dry-run`, backup, confirmación, reversión documentada |

---

## 11. Decisiones abiertas

1. **¿Extensión separada o contribuir a WebCompat?**
   - Corto plazo: extensión para diagnóstico y workarounds.
   - Largo plazo: upstream de cualquier mejora generalizable a Bugzilla 2000906.
2. **¿Incluir fixes de sistema en el repo o solo documentarlos?**
   - Recomendación: scripts opt-in con backup; el doctor solo lee por defecto.
3. **¿Soportar ESR <128?**
   - No en MVP. Documentar el fallback `exportFunction`/`wrappedJSObject` para quien lo necesite.
4. **¿Publicar en AMO listed o unlisted?**
   - Unlisted primero; listed cuando haya validación end-to-end y una política de privacidad clara.
5. **¿Nombre definitivo?**
   - `teams-firefox-share` es descriptivo y no usa la marca como nombre principal.
6. **¿Incluir un perfil PWAsForFirefox?**
   - Sí, en Fase 3, como plantilla opcional; no es necesario para el MVP.

---

## 12. Fuentes principales

Consultadas el 2026-11-10.

### Microsoft

- Teams for Web — overview and prerequisites: <https://learn.microsoft.com/en-us/microsoftteams/teams-client-web>
- Limits and specifications for Microsoft Teams: <https://learn.microsoft.com/en-us/microsoftteams/limits-specifications-teams>
- Microsoft Q&A 5918672 — Teams with Firefox on Linux (Wayland): <https://learn.microsoft.com/en-au/answers/questions/5918672/microsoft-teams-with-firefox-on-linux>

### Mozilla

- Bug 2000906 — Sharing the entire screen on Teams fails: <https://bugzilla.mozilla.org/show_bug.cgi?id=2000906>
- Bug 2081652 — OOM during long Teams meetings: <https://bugzilla.mozilla.org/show_bug.cgi?id=2081652>
- Bug 1541425 — getDisplayMedia audio capture: <https://bugzilla.mozilla.org/show_bug.cgi?id=1541425>
- Intervención `disable_resizeMode_in_GDM.js`: <https://github.com/mozilla-firefox/firefox/blob/main/browser/extensions/webcompat/injections/js/disable_resizeMode_in_GDM.js>
- MDN `getDisplayMedia`: <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia>
- MDN BCD `MediaDevices.json`: <https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json>

### Wayland / Hyprland

- Hyprland Wiki — Screen sharing: <https://wiki.hypr.land/Useful-Utilities/Screen-Sharing>
- Hyprland Wiki — xdg-desktop-portal-hyprland: <https://wiki.hypr.land/Hypr-Ecosystem/xdg-desktop-portal-hyprland>
- XDPH issue #423 — freeze after out-of-buffers: <https://github.com/hyprwm/xdg-desktop-portal-hyprland/issues/423>
- XDPH PR #424 — fix: <https://github.com/hyprwm/xdg-desktop-portal-hyprland/pull/424>
- XDPH release v1.5.0: <https://github.com/hyprwm/xdg-desktop-portal-hyprland/releases/tag/v1.5.0>
- XDPH issue #392 — DMA-BUF negotiation: <https://github.com/hyprwm/xdg-desktop-portal-hyprland/issues/392>
- XDPH issue #93 — freeze when preview inactive: <https://github.com/hyprwm/xdg-desktop-portal-hyprland/issues/93>
- Arch Wiki — PipeWire/WebRTC screen sharing: <https://wiki.archlinux.org/title/PipeWire#WebRTC_screen_sharing>

### Proyectos y reportes

- teams-for-linux: <https://github.com/IsmaelMartinez/teams-for-linux>
- teams-for-linux issue #2523 — constraints de Teams: <https://github.com/IsmaelMartinez/teams-for-linux/issues/2523>
- PWAsForFirefox: <https://github.com/filips123/PWAsForFirefox>
- PWAsForFirefox issue #815 — Teams: <https://github.com/filips123/PWAsForFirefox/issues/815>
- Ask Ubuntu 1567512 — Teams/Firefox/Ubuntu 26.04 Wayland: <https://askubuntu.com/questions/1567512/how-do-i-share-my-screen-with-teams-in-firefox-ubuntu-26-04-wayland>
- Arch BBS 305866 — Teams web on KDE Wayland: <https://bbs.archlinux.org/viewtopic.php?id=305866>
- Omarchy discussion #3997 — picker `-1`: <https://github.com/basecamp/omarchy/discussions/3997>

---

## 13. Anexo: comandos útiles para esta máquina

```bash
# Versión y protocolo de Firefox
firefox --version

# Portal y backend
gdbus call --session --dest org.freedesktop.portal.Desktop \
  --object-path /org/freedesktop/portal/desktop \
  --method org.freedesktop.DBus.Properties.Get \
  org.freedesktop.portal.ScreenCast version

grep -H '^Interfaces=' /usr/share/xdg-desktop-portal/portals/*.portal

# Servicios
systemctl --user status xdg-desktop-portal xdg-desktop-portal-hyprland pipewire wireplumber

# Logs del portal
journalctl --user -u xdg-desktop-portal-hyprland -u xdg-desktop-portal -f

# XDPH versión
dpkg-query -W -f='${Version}\n' xdg-desktop-portal-hyprland

# OpenH264
find ~/.mozilla/firefox -path '*gmp-gmpopenh264*' -name 'libgmpopenh264.so'

# Intervención WebCompat
unzip -l /usr/lib/firefox-esr/browser/omni.ja | grep 2000906

# Forzar SHM (si no hay XDPH 1.5.0)
mkdir -p ~/.config/hypr
cat > ~/.config/hypr/xdph.conf <<'EOF'
screencopy {
    force_shm = true
}
EOF
systemctl --user restart xdg-desktop-portal-hyprland xdg-desktop-portal

# Probar XWayland
MOZ_ENABLE_WAYLAND=0 firefox
```

---

## 14. Criterio final de éxito

El proyecto es un éxito si, para un usuario con Firefox 153 + Teams + Linux:

1. El doctor identifica correctamente la causa en menos de 5 minutos.
2. La extensión elimina la clase de fallo de constraints/SFU sin romper cámara ni preview.
3. Los workarounds de portal están documentados y son reversibles.
4. El repo no promete lo que no puede cumplir.

Si el fallo es el portal Wayland, el éxito no es “una extensión lo arregla”, sino “el usuario sabe exactamente qué actualizar o qué workaround aplicar”. Esa es la diferencia entre un producto honesto y otro que añade otra capa de frustración.
