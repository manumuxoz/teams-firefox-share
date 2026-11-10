---
name: Bug report
about: Reporta un fallo de compartir pantalla con el diagnóstico adjunto
title: "[Bug] "
labels: bug
assignees: ""
---

## Entorno

- Firefox: <!-- firefox --version -->
- Distribución:
- Sesión: <!-- echo $XDG_SESSION_TYPE -->
- Escritorio/compositor:
- Versión de xdg-desktop-portal:
- Backend ScreenCast:
- GPU/driver:

## Tipo de sesión de Teams

- [ ] Reunión de calendario/canal
- [ ] Llamada 1:1
- [ ] Meet now
- [ ] Otra:

## Diagnóstico

```text
<!-- Pega aquí la salida de: python3 tools/teams-ss-doctor --json -->
```

## Informe de la extensión

```json
<!-- Pega aquí el informe del popup: Analizar pestaña -> Copiar informe -->
```

## Pasos para reproducir

1.
2.
3.

## Resultado esperado

## Resultado actual

## Logs relevantes

```text
<!-- journalctl --user -u xdg-desktop-portal-hyprland -n 100 --no-pager -->
```

No incluyas tokens, cookies, correos ni contenido de reuniones.
