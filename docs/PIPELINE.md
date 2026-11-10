# Pipeline fijado

El proyecto usa un único punto de entrada, `make ci`, tanto en local como en GitHub Actions. El orden es fijo y ninguna etapa se salta.

```text
deps → lint → test → build → smoke → package
```

## Etapas

| Etapa | Comando | Qué valida |
|---|---|---|
| `deps` | `npm ci` | Dependencias reproducibles desde `package-lock.json` |
| `lint` | `npm run lint` | Sintaxis JS, compilación Python, `web-ext lint --warnings-as-errors` |
| `test` | `npm test` + `python3 -m unittest` | 45 tests JS y 34 tests Python |
| `build` | `npm run build` | Genera `dist/teams-screenshare-fix-<version>.xpi` |
| `smoke` | `scripts/smoke-extension.sh` | Carga la extensión en Firefox headless y detecta el add-on temporal |
| `package` | `scripts/package.sh` | Genera `SHA256SUMS` y el zip de fuentes |

## Local

```bash
make ci
```

Si solo quieres una etapa:

```bash
make lint
make test
make build
make smoke
make package
```

`make smoke` requiere Firefox en `PATH` o la variable `FIREFOX_BIN`:

```bash
FIREFOX_BIN=/usr/lib/firefox-esr/firefox-esr make smoke
```

## Integración real (opcional)

`make integration` instala el `.xpi` en Firefox headless con geckodriver, abre `teams.microsoft.com/v2` y comprueba que:

- el shim está en el mundo MAIN;
- `getDisplayMedia` existe;
- el config bridge entregó la configuración (`configRev >= 1`).

No forma parte de `make ci` porque requiere Selenium, geckodriver y red. Dependencias:

```bash
python3 -m pip install selenium
# geckodriver en PATH o GECKODRIVER=/ruta/geckodriver
make integration
```

## CI

`.github/workflows/ci.yml`:

1. Instala Node 22, Python 3.13 y Firefox ESR.
2. Ejecuta `make ci`.
3. Sube el `.xpi`, el zip de fuentes y `SHA256SUMS` como artefactos.

El smoke test se ejecuta con `MOZ_HEADLESS=1` y `--args=--headless`. El script espera la línea exacta:

```text
Installed ... as a temporary add-on
```

Si no aparece en 60 segundos, falla y muestra el log.

## Release

`.github/workflows/release.yml` se dispara con tags `v*.*.*`:

1. Verifica que el tag coincida con `package.json` (`v0.2.0` ↔ `0.2.0`).
2. Ejecuta `make ci`.
3. Crea un GitHub Release con:
   - `dist/teams-screenshare-fix-<version>.xpi`
   - `dist/teams-firefox-share-<version>-sources.zip`
   - `dist/SHA256SUMS`
4. Marca `v0.*` como prerelease.

### Cómo publicar una versión

```bash
# 1. Subir versión en package.json y extension/manifest.json
# 2. Actualizar CHANGELOG.md
make ci
git add .
git commit -m "Release 0.2.0"
git tag v0.2.0
git push origin main --tags
```

## AMO

La firma con AMO es manual y opcional. El workflow `AMO Sign` usa los secretos:

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

También se puede hacer en local:

```bash
npx web-ext sign \
  --source-dir extension \
  --artifacts-dir dist/signed \
  --channel unlisted \
  --api-key "$AMO_JWT_ISSUER" \
  --api-secret "$AMO_JWT_SECRET"
```

No publiques el `.xpi` sin firmar como si fuera instalable permanentemente: Firefox solo instala add-ons firmados fuera de modo desarrollador.

## Versionado

- `package.json` y `extension/manifest.json` deben tener la misma versión.
- `tests/manifest.test.mjs` falla si se desincronizan.
- El tag debe ser `v` + la versión exacta.

## Limpieza

```bash
make clean
```

Elimina `dist/`, `__pycache__` y cachés locales. No toca perfiles de Firefox ni configuración del sistema.
