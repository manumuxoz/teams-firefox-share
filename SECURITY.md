# Seguridad

## Versiones soportadas

| Versión | Soporte |
|---|---|
| 0.2.x | Sí |
| 0.1.x | No |

## Cómo reportar una vulnerabilidad

No abras un issue público para vulnerabilidades. Usa **GitHub Private Vulnerability Reporting**:

<https://github.com/manumuxoz/teams-firefox-share/security/advisories/new>

Si esa opción no está disponible, abre un issue pidiendo contacto privado **sin incluir detalles explotables**.

Incluye:

- Versión de la extensión y de Firefox.
- Sistema y sesión (Wayland/X11).
- Descripción del impacto.
- Pasos de reproducción mínimos.
- Si aplica, parche sugerido.

No incluyas:

- Tokens, cookies o credenciales.
- IDs de reunión, tenant o enlaces de join.
- Contenido de reuniones.
- Datos personales de terceros.

## Alcance

Entran en alcance:

- Inyección o ejecución de código en la página de Teams.
- Evasión de las restricciones de `host_permissions`.
- Fugas de datos a través del config bridge o del informe del popup.
- Escritura arbitraria de archivos desde `tools/teams-ss-doctor`.
- Dependencias con vulnerabilidades explotables en el contexto de la extensión.

Quedan fuera de alcance:

- Fallos del portal Wayland, PipeWire o del compositor.
- Fallos de Microsoft Teams o de Firefox no causados por este proyecto.
- Limitaciones documentadas en `docs/LIMITATIONS.md`.
- Ataques que requieran control físico del equipo o una extensión maliciosa ya instalada.

## Divulgación

Se intentará responder en un plazo razonable y coordinar la divulgación después de publicar un fix. No se promete un SLA formal.
