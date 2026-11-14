# Publicar en GitHub

Repositorio publicado: <https://github.com/manumuxoz/teams-firefox-share>

Estado actual:

- Remoto `origin` configurado.
- `main` subido.
- CI en verde.
- Release `v0.2.0` publicado con XPI, fuentes y `SHA256SUMS`.
- Topics, descripción, branch protection, tag ruleset y ajustes de seguridad configurados.

Esta guía queda como referencia para recrear el repositorio o publicar futuras versiones.

## 1. Autenticación

En este entorno ya está autenticado como `manumuxoz`. En otra máquina:

```bash
gh auth login
```

Elige GitHub.com, HTTPS y autenticación por navegador o token.

## 2. Crear el repositorio y subir `main`

Ya existe. Para recrearlo desde cero:

```bash
gh repo create teams-firefox-share \
  --public \
  --source=. \
  --remote=origin \
  --push
```

Si prefieres crearlo desde la web:

1. Crea un repositorio vacío llamado `teams-firefox-share`.
2. No añadas README, LICENSE ni `.gitignore` (ya existen).
3. Ejecuta:

```bash
git remote add origin https://github.com/manumuxoz/teams-firefox-share.git
git branch -M main
git push -u origin main
```

## 3. Metadatos recomendados

**Descripción:**

> Unofficial Firefox extension and diagnostics for Microsoft Teams screen sharing on Linux (Wayland/PipeWire/Hyprland).

**Topics:**

```text
firefox
firefox-extension
microsoft-teams
webrtc
wayland
pipewire
hyprland
linux
screen-sharing
getdisplaymedia
webextensions
```

También puedes aplicarlos con `gh`:

```bash
gh repo edit manumuxoz/teams-firefox-share \
  --description "Unofficial Firefox extension and Linux diagnostics for Microsoft Teams screen sharing (Wayland/PipeWire/Hyprland)" \
  --add-topic firefox --add-topic firefox-extension --add-topic microsoft-teams \
  --add-topic webrtc --add-topic wayland --add-topic pipewire --add-topic hyprland \
  --add-topic linux --add-topic screen-sharing --add-topic getdisplaymedia \
  --add-topic webextensions
```

**Settings:**

- Issues: activados.
- Discussions: opcional.
- Actions: permitir workflows; el release necesita `contents: write`.
- Secret scanning y Dependabot alerts: activados.
- Private vulnerability reporting: activado (ver `SECURITY.md`).
- Branch protection en `main`: exigir el check `CI / ci`.
- Tag protection para `v*`.
- Actions: permisos por defecto de solo lectura; el workflow de release eleva `contents: write` solo en el job de publicación.
- Pages: no necesario.

## 4. Badges del README

Los badges ya están en `README.md`. Si cambias de propietario, actualízalos:

```md
[![CI](https://github.com/manumuxoz/teams-firefox-share/actions/workflows/ci.yml/badge.svg)](https://github.com/manumuxoz/teams-firefox-share/actions/workflows/ci.yml)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](LICENSE)
```

Si tu usuario no es `manumuxoz`, sustituye el propietario en `package.json`, `docs/GITHUB.md`, `SECURITY.md` y las badges.

## 5. Releases

`v0.2.0` ya está publicado. Para una versión nueva:

```bash
# Asegura que package.json, extension/manifest.json y shim.js tienen la misma versión
make ci

git add .
git commit -m "Release X.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

El workflow `release.yml` verifica que el tag coincida con `package.json`, ejecuta `make ci` y publica:

- `teams-screenshare-fix-X.Y.Z.xpi`
- `teams-firefox-share-X.Y.Z-sources.zip`
- `SHA256SUMS`

## 6. AMO

La firma es manual. Configura los secretos del repositorio:

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

Después ejecuta el workflow **AMO Sign** con el canal `unlisted` o `listed`.

El ID ya está fijado a `teams-screenshare-fix@manumuxoz.github.io`. Si tu usuario de GitHub no es `manumuxoz`, cámbialo antes de la primera publicación:

```json
"id": "teams-screenshare-fix@tu-usuario.github.io"
```

El ID no se puede cambiar después de publicar en AMO; cambiarlo obliga a crear otra extensión.

## 7. Privacidad del correo en Git

El historial actual usa `manumuxoz@users.noreply.github.com`. Si tu usuario de GitHub no es `manumuxoz`, o si añades commits con un correo personal, puedes reescribir el historial antes de publicar. GitHub también permite ocultar el correo en la interfaz con “Keep my email addresses private”, pero el correo seguiría estando en el objeto del commit.

### Opción A — reescribir el historial local (recomendada si el repo aún no es público)

Sustituye `old@example.com` por el correo que quieras eliminar:

```bash
git config user.name "manumuxoz"
git config user.email "manumuxoz@users.noreply.github.com"

git filter-branch --env-filter '
if [ "$GIT_AUTHOR_EMAIL" = "old@example.com" ]; then
  export GIT_AUTHOR_NAME="manumuxoz"
  export GIT_AUTHOR_EMAIL="manumuxoz@users.noreply.github.com"
fi
if [ "$GIT_COMMITTER_EMAIL" = "old@example.com" ]; then
  export GIT_COMMITTER_NAME="manumuxoz"
  export GIT_COMMITTER_EMAIL="manumuxoz@users.noreply.github.com"
fi
' -- --all

git for-each-ref --format='%(refname)' refs/original/ | xargs -r -n1 git update-ref -d
git reflog expire --expire=now --all
git gc --prune=now
```

### Opción B — dejar el historial como está

Solo hazlo si no te importa que el correo aparezca en el commit. En cualquier caso, configura el correo noreply para los commits futuros.

## 8. Checklist de publicación

- [x] `make ci` en verde.
- [x] `git status` limpio.
- [x] Sin secretos ni correos personales en el árbol de trabajo.
- [x] `package.json`, `extension/manifest.json` y `shim.js` con la misma versión.
- [x] `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` y `docs/PRIVACY.md` presentes.
- [x] Iconos en `extension/icons/` y declarados en el manifest.
- [x] ID de extensión estable (`teams-screenshare-fix@manumuxoz.github.io`).
- [x] Topics y descripción configurados.
- [x] Private vulnerability reporting, secret scanning y Dependabot activados.
- [x] Branch protection en `main` y tag ruleset para `v*`.
- [x] Tag `v0.2.0` publicado.
- [x] Recordatorio: el `.xpi` de GitHub Releases no está firmado; la instalación permanente va por AMO.
