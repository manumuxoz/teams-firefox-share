# Notas para la revisión de AMO

La extensión parchea APIs de captura en los dominios de Teams. Es un caso legítimo de compatibilidad, pero conviene explicarlo con claridad en la ficha y en la revisión.

## Identidad e iconos

- ID: `teams-screenshare-fix@manumuxoz.github.io`
- Iconos: `extension/icons/icon-{16,32,48,128}.png`, con fuente SVG en `extension/icons/icon.svg`.
- El ID no se puede cambiar después de la primera publicación en AMO.

## Permisos

| Permiso | Motivo |
|---|---|
| `storage` | Guardar los toggles del shim (`enabled`, `sanitizeDisplay`, `safeClamp`, `mapLegacyDesktop`, `debug`). |
| `scripting` | El popup lee el informe de diagnóstico del mundo de la página. |
| `host_permissions` de Teams | Inyectar el shim y el config bridge en `teams.microsoft.com`, `teams.cloud.microsoft` y `teams.live.com`. |

No se piden permisos de cámara, micrófono, historial, descargas, `activeTab` ni acceso a todos los sitios.

## Privacidad

- No hay telemetría.
- No hay peticiones de red.
- No se leen cookies, tokens ni contenido de reuniones.
- El informe se genera en memoria y se copia al portapapeles solo si el usuario lo pide.
- `data_collection_permissions: { "required": ["none"] }`.

Política completa: [PRIVACY.md](PRIVACY.md).

## Qué hace exactamente

1. En `document_start` y en el mundo MAIN, envuelve `getDisplayMedia`, `applyConstraints` y `getUserMedia`.
2. Elimina `resizeMode: "none"` cuando Teams lo combina con topes de resolución/fps. Es la misma corrección que la intervención WebCompat 2000906 de Mozilla, con composición idempotente.
3. Mapea peticiones legacy `chromeMediaSource` a `getDisplayMedia`.
4. Aplica un safe clamp opcional a 1920×1080@15 antes de devolver el track a Teams.
5. Un content script aislado lee `browser.storage.local` y envía la configuración al shim con `window.postMessage`; no se ejecuta código remoto.
6. Registra un buffer local de eventos para diagnóstico.

## Qué no hace

- No modifica el DOM de Teams.
- No inyecta HTML.
- No usa `eval` ni código remoto.
- No cambia el User-Agent.
- No accede a la red.
- No intenta saltarse permisos del portal ni del sistema.

## Justificación de compatibilidad

Teams for Web es un sitio que depende de `getDisplayMedia`. Firefox lo soporta, pero Teams envía una combinación de constraints que puede provocar que su SFU descarte el stream. Mozilla mantiene una intervención equivalente en Firefox; esta extensión añade diagnóstico y cubre versiones/forks donde la intervención no está disponible o está desactivada.

## Texto sugerido para la ficha

> Teams Screen Share Fix (Unofficial) applies a small, local compatibility shim to Microsoft Teams' screen-sharing constraints in Firefox. It does not collect data, does not contact any server, and only runs on the three Teams web domains. It is not affiliated with Microsoft or Mozilla.

## Canal listed

Para `--channel listed`, crea primero la ficha de la extensión en AMO. `web-ext sign` solo envía una versión nueva; no crea la ficha pública.

## Checklist antes de publicar

- [ ] `web-ext lint` sin errores.
- [ ] `npm test` y `python -m unittest` en verde.
- [ ] Probar con la intervención 2000906 activa y desactivada.
- [ ] Probar `getUserMedia` de cámara para asegurar que no se intercepta.
- [ ] Probar un iframe cross-origin con y sin `allow="display-capture"`.
- [ ] Revisar que el popup no muestra datos sensibles.
- [ ] Añadir capturas y una explicación del informe.
