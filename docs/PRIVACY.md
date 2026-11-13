# Privacidad

## Extensión

La extensión:

- No recopila telemetría.
- No envía datos a ningún servidor.
- No lee cookies, tokens ni contenido de reuniones.
- Solo se ejecuta en `teams.microsoft.com`, `teams.cloud.microsoft` y `teams.live.com`.
- Guarda únicamente las opciones del shim en `browser.storage.local` del navegador.
- Genera el informe de diagnóstico en memoria; solo se copia si el usuario pulsa “Copiar informe”.

El informe saneado:

- Reduce la URL a origen + primer segmento de ruta; no incluye query strings ni IDs de reunión.
- De los tracks solo registra `kind`, `readyState` y la longitud de la etiqueta, no el título de la ventana.
- No incluye audio, vídeo, capturas ni contenido de la reunión.

## Doctor

`tools/teams-ss-doctor` se ejecuta en local y lee:

- Variables de entorno de la sesión.
- Versiones de Firefox, portal, PipeWire y XDPH.
- Preferencias de perfiles de Firefox.
- Logs recientes del portal.
- Endpoints públicos de Teams (solo comprobación HTTP; se puede omitir con `--no-network`).

No envía el informe a ningún sitio. El usuario decide si lo copia en un issue.

## Issues y PRs

Los informes que se publican en GitHub son voluntarios. No incluyas:

- Tokens, cookies o credenciales.
- IDs de reunión, tenant o enlaces de join.
- Contenido de reuniones.
- Datos personales de terceros.

## Contacto

Para asuntos de privacidad o seguridad, usa el reporte privado descrito en [SECURITY.md](../SECURITY.md).
