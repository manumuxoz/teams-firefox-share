# teams-firefox-share

**Compartir pantalla de Microsoft Teams en Firefox sobre Linux — sin magia y sin promesas falsas.**

Este repositorio nace de un caso real: Firefox 153 ESR + Hyprland/Wayland + Teams for Web. El objetivo no es “hacer que Teams crea que Firefox es Chrome”, sino separar tres problemas que la mayoría de guías mezclan:

1. Lo que Teams ya soporta (reuniones en Firefox).
2. Lo que Mozilla ya parchea (los constraints de `getDisplayMedia`).
3. Lo que depende del portal Wayland/PipeWire y **no** se puede arreglar desde JavaScript.

El plan completo, con evidencia, diagnóstico y roadmap, está en **[PLAN.md](PLAN.md)**.

---

## Estado

- **Fase:** prototipo inicial / prueba de concepto.
- **Firefox objetivo:** 128+; validado en 153.6.0esr.
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

### 3. Tests

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
```

---

## Qué hace la extensión

- Elimina `resizeMode: "none"` cuando Teams lo combina con topes de resolución/fps, replicando y complementando la intervención WebCompat 2000906 de Mozilla.
- Mapea peticiones legacy `getUserMedia({video:{mandatory:{chromeMediaSource:"desktop"}}})` a `getDisplayMedia`, para que no enciendan la cámara.
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
extension/        Extensión Firefox MV3 (shim + diagnóstico)
tools/            Doctor CLI en Python 3 (solo stdlib)
docs/             Diagnóstico, investigación y límites
tests/            Tests de constraints y helpers del doctor
PLAN.md           Plan completo, evidencia y roadmap
```

## Documentación

- [PLAN.md](PLAN.md) — viabilidad, arquitectura, fases, riesgos, fuentes.
- [docs/DIAGNOSIS.md](docs/DIAGNOSIS.md) — árbol de decisión y comandos.
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — lo que no se puede arreglar.
- [docs/RESEARCH.md](docs/RESEARCH.md) — evidencia externa y enlaces.

## Contribuir

Antes de abrir un issue, adjunta:

- Salida de `python3 tools/teams-ss-doctor --json`.
- Versión de Firefox (`firefox --version`).
- Sesión (`echo $XDG_SESSION_TYPE`), escritorio y compositor.
- Si es posible, informe del popup de la extensión.

No incluyas tokens, cookies, correos ni contenido de reuniones.
