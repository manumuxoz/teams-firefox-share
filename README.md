# teams-firefox-share

[![CI](https://github.com/manumuxoz/teams-firefox-share/actions/workflows/ci.yml/badge.svg)](https://github.com/manumuxoz/teams-firefox-share/actions/workflows/ci.yml)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](LICENSE)

**Compartir pantalla de Microsoft Teams en Firefox sobre Linux — sin magia y sin promesas falsas.**

Este repositorio nace de un caso real: Firefox 153 ESR + Hyprland/Wayland + Teams for Web. El objetivo no es “hacer que Teams crea que Firefox es Chrome”, sino separar tres problemas que la mayoría de guías mezclan:

1. Lo que Teams ya soporta (reuniones en Firefox).
2. Lo que Mozilla ya parchea (los constraints de `getDisplayMedia`).
3. Lo que depende del portal Wayland/PipeWire y **no** se puede arreglar desde JavaScript.

El plan completo, con evidencia, diagnóstico y roadmap, está en **[PLAN.md](PLAN.md)**.

---

## Estado

- **Repositorio:** <https://github.com/manumuxoz/teams-firefox-share>
- **Release:** <https://github.com/manumuxoz/teams-firefox-share/releases/tag/v0.2.0>
- **Versión:** 0.2.0.
- **Fase:** MVP publicable / pruebas end-to-end pendientes en un tenant real.
- **Firefox objetivo:** 142+ (por `data_collection_permissions`); validado en 153.6.0esr.
- **Sistemas:** Linux. Wayland con `xdg-desktop-portal` + PipeWire; X11 también documentado.
- **Teams:** `teams.microsoft.com`, `teams.cloud.microsoft`, `teams.live.com`.
- **Licencia:** MPL-2.0.

> Proyecto no oficial. No está afiliado a Microsoft ni a Mozilla. No usa logos ni marcas de Teams.

---

## Inicio rápido

### 1. Diagnóstico del sistema

```bash
python3 tools/teams-ss-doctor
```

El doctor no modifica nada por defecto. Para ver el detalle:

```bash
python3 tools/teams-ss-doctor --verbose
python3 tools/teams-ss-doctor --json
```

Si detecta `xdg-desktop-portal-hyprland` 1.4.0/1.4.1, leer la sección “Wayland/Hyprland” de [PLAN.md](PLAN.md). El fix de congelación está en 1.5.0+.

### 2. Extensión (temporal)

1. Abre Firefox → `about:debugging#/runtime/this-firefox`.
2. “Cargar complemento temporal…”
3. Selecciona `extension/manifest.json`.
4. Abre o recarga Teams, entra en una **reunión** (no una llamada 1:1) y prueba a compartir.
5. Pulsa el icono de la extensión → “Analizar pestaña”.

La extensión es un shim de compatibilidad y un panel de diagnóstico. No envía datos a ningún sitio.

### 3. Pipeline

```bash
make ci
```

Ejecuta `deps → lint → test → build → smoke → package` y deja los artefactos en `dist/`. Ver [docs/PIPELINE.md](docs/PIPELINE.md).

---

## Requisitos

- Firefox **142+** (el manifest usa `data_collection_permissions`).
- Linux con Wayland/PipeWire o X11. En Wayland se necesita `xdg-desktop-portal` y un backend ScreenCast.
- Teams for Web en una **reunión**; las llamadas 1:1 no están soportadas por Microsoft en Firefox.
- Para el doctor: Python 3.13+; `gdbus` y `journalctl` son opcionales.
- Para desarrollar: Node.js 20+.

## Instalación permanente (AMO)

El `.xpi` que produce `make build` **no está firmado**. Firefox release solo lo instalará en modo desarrollador (`about:debugging`) o con una firma de AMO.

Para una instalación permanente:

1. Publica o firma la extensión en AMO (`docs/AMO.md` y `docs/GITHUB.md`).
2. Instala el `.xpi` firmado desde la ficha de AMO o desde `dist/signed/` si usas `web-ext sign`.
3. No presentes el `.xpi` sin firmar de GitHub Releases como instalable permanente.

## Compilar desde fuente

```bash
npm ci
make ci
```

El artefacto queda en:

```text
dist/teams-screenshare-fix-0.2.0.xpi
```

Para cargarlo temporalmente: `about:debugging#/runtime/this-firefox` → “Cargar complemento temporal” → `extension/manifest.json`.

La integración real opcional requiere Selenium y geckodriver:

```bash
python3 -m pip install selenium
GECKODRIVER=/ruta/geckodriver make integration
```

## Qué hace la extensión

- Elimina `resizeMode: "none"` cuando Teams lo combina con topes de resolución/fps, replicando y complementando la intervención WebCompat 2000906 de Mozilla.
- Mapea peticiones legacy `getUserMedia({video:{mandatory:{chromeMediaSource:"desktop"}}})` a `getDisplayMedia`, para que no enciendan la cámara.
- Ofrece un **safe clamp** opcional a 1920×1080@15 antes de entregar el track a Teams.
- Configuración persistente desde el popup: activar/desactivar shim, sanitizar constraints, safe clamp, mapeo legacy y log de depuración.
- Registra constraints, settings del track, codecs, errores y eventos `ended`.
- Expone un informe local que el popup puede copiar.

## Qué **no** hace

- No arregla un portal Wayland que destruye el stream.
- No captura audio de sistema/pestaña.
- No evita el OOM de OpenH264 en reuniones largas.
- No habilita sharing en llamadas 1:1: Microsoft no lo soporta en Firefox.
- No hace UA spoof.

---

## Estructura

```text
extension/        Extensión Firefox MV3 (shim, config bridge y diagnóstico)
tools/            Doctor CLI en Python 3 (solo stdlib)
docs/             Diagnóstico, investigación, límites y pipeline
tests/            Tests JS y Python, más fixture de getDisplayMedia
profile/          Perfil dedicado y prefs seguras
scripts/          Smoke test, empaquetado y lanzador X11
PLAN.md           Plan completo, evidencia y roadmap
Makefile          Pipeline fijo: make ci
```

## Documentación

- [PLAN.md](PLAN.md) — viabilidad, arquitectura, fases, riesgos, fuentes.
- [docs/DIAGNOSIS.md](docs/DIAGNOSIS.md) — árbol de decisión y comandos.
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — lo que no se puede arreglar.
- [docs/RESEARCH.md](docs/RESEARCH.md) — evidencia externa y enlaces.
- [docs/PIPELINE.md](docs/PIPELINE.md) — pipeline local/CI, release y AMO.
- [docs/AUDIO.md](docs/AUDIO.md) — límite de audio de Firefox y workaround con PipeWire.
- [docs/AMO.md](docs/AMO.md) — permisos, privacidad y revisión.
- [docs/GITHUB.md](docs/GITHUB.md) — publicación, metadatos y checklist de GitHub.
- [docs/PRIVACY.md](docs/PRIVACY.md) — qué datos toca (y qué no) la extensión y el doctor.
- [CONTRIBUTING.md](CONTRIBUTING.md) — cómo contribuir y qué reglas sigue el shim.
- [SECURITY.md](SECURITY.md) — reporte privado de vulnerabilidades.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — normas de convivencia del proyecto.

## Tests

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
```

Actualmente: 49 tests JS y 34 tests Python.

## Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Para vulnerabilidades, usa [SECURITY.md](SECURITY.md), no un issue público.

Antes de abrir un issue, adjunta:

- Salida de `python3 tools/teams-ss-doctor --json`.
- Versión de Firefox (`firefox --version`).
- Sesión (`echo $XDG_SESSION_TYPE`), escritorio y compositor.
- Si es posible, informe del popup de la extensión.

No incluyas tokens, cookies, correos ni contenido de reuniones.

## Licencia

MPL-2.0. Ver [LICENSE](LICENSE).
