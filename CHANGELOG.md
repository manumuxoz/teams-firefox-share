# Changelog

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
