# Contribuir

Gracias por querer mejorar el proyecto. La regla principal es no convertir un fallo de portal Wayland en una promesa que la extensión no puede cumplir.

## Requisitos

- Node.js 20+
- Python 3.13+
- Firefox 142+ (para cargar la extensión)
- `make`, `git`, `zip`, `unzip`, `sha256sum` y `setsid` (Linux)
- Opcional: `geckodriver` + `selenium` para `make integration`

## Puesta en marcha

```bash
git clone https://github.com/manumuxoz/teams-firefox-share.git
cd teams-firefox-share
npm ci
make ci
```

`make ci` ejecuta el pipeline completo: dependencias, lint, tests, build, smoke headless y empaquetado.

## Dónde tocar

| Área | Archivos |
|---|---|
| Shim de captura | `extension/src/shim.js`, `extension/src/lib/constraints.js` |
| Configuración | `extension/src/config-defaults.js`, `extension/src/config-bridge.js` |
| Popup | `extension/popup/` |
| Doctor | `tools/teams-ss-doctor` |
| Tests | `tests/` |
| Documentación | `docs/`, `README.md`, `PLAN.md` |

## Reglas para cambios de captura

1. Parchea APIs estándar (`getDisplayMedia`, `applyConstraints`, `getUserMedia`), no selectores DOM de Teams.
2. Mantén la llamada nativa síncrona dentro del gesto del usuario. No añadas `await` antes de `getDisplayMedia`.
3. Compón con la intervención WebCompat 2000906; no la reemplaces.
4. Añade un test en `tests/shim.test.mjs` para cada cambio de constraints.
5. Documenta si el cambio depende de una versión de Firefox, XDPH o Teams.

## Reglas para cambios del doctor

1. No modifiques el sistema por defecto. Los fixes son opt-in y con backup.
2. Distingue `FAIL` (evidencia dura), `WARN` (sospechoso) e `INFO` (contexto).
3. No cuentes `Session destroyed` o `selection -1` como fallo duro: son eventos normales de cancelación.
4. Añade tests en `tests/test_doctor.py` para cada parser o heurística nueva.

## Commits

- Mensajes en imperativo y en inglés o español, consistentes con el historial.
- Un commit por cambio lógico.
- No incluyas secretos, correos personales, tokens, IDs de reunión ni capturas de pantalla de reuniones.

## Pull requests

Antes de abrir una PR:

```bash
make ci
```

La PR debe incluir:

- Resumen del problema y del cambio.
- Tests nuevos o actualizados.
- Notas de compatibilidad (Firefox, XDPH, Teams).
- Confirmación de que no se han añadido datos personales.

Usa la plantilla de PR del repositorio.
