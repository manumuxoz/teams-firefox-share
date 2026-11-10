# Changelog

## 0.2.0 — 2026-11-10

- Configuración persistente del shim: `enabled`, `sanitizeDisplay`, `safeClamp`, `mapLegacyDesktop`, `debug`.
- Config bridge aislado (`browser.storage.local` → `window.postMessage`) con revisión monotónica y whitelist de claves.
- Safe clamp opcional a 1920×1080@15 aplicado antes de devolver el stream a Teams.
- Popup con toggles, reset y contador de errores/clamps.
- Endurecimiento del shim: marcador no configurable, idempotencia, métodos enumerables, compatibilidad con la intervención de Mozilla.
- Doctor 0.2.0: logs con ventana de 24 h, detección de prefs falsas, backends XDG, versiones con epoch, `--output`, `--force` y fixes atómicos.
- Pipeline fijo `make ci` con lint, tests, build, smoke headless y empaquetado.
- Workflows de CI, release por tag y firma manual en AMO.
- 45 tests JS y 34 tests Python.

## 0.1.0 — 2026-11-10

- Plan de viabilidad y arquitectura (`PLAN.md`).
- Prototipo de extensión MV3:
  - shim de `getDisplayMedia` para `resizeMode` + caps;
  - shim de `applyConstraints`;
  - mapeo legacy `chromeMediaSource` → `getDisplayMedia`;
  - diagnóstico local y popup.
- Doctor CLI en Python 3 (solo stdlib):
  - sesión, Firefox, WebCompat, prefs, OpenH264;
  - portal ScreenCast, backend, PipeWire, XDPH, logs, GPU;
  - fixes opt-in con backup.
- Tests de constraints y helpers del doctor.
- Documentación de diagnóstico, límites, investigación y revisión AMO.
