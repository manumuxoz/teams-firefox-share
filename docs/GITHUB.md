# Publicar en GitHub

El repositorio está preparado para subirse tal cual. No hay remoto configurado y `gh` no está autenticado en este entorno.

## 1. Autenticación

```bash
gh auth login
```

Elige GitHub.com, HTTPS y autenticación por navegador o token.

## 2. Crear el repositorio y subir `main`

Desde la raíz del proyecto:

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
```

**Settings:**

- Issues: activados.
- Discussions: opcional.
- Actions: permitir workflows; el release necesita `contents: write`.
- Secret scanning y Dependabot alerts: activados.
- Private vulnerability reporting: activado (ver `SECURITY.md`).
- Pages: no necesario.

## 4. Badges del README

Cuando exista el remoto, añade al principio de `README.md`:

```md
[![CI](https://github.com/manumuxoz/teams-firefox-share/actions/workflows/ci.yml/badge.svg)](https://github.com/manumuxoz/teams-firefox-share/actions/workflows/ci.yml)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](LICENSE)
```

Si tu usuario no es `manumuxoz`, sustituye el propietario en `package.json`, `docs/GITHUB.md`, `SECURITY.md` y las badges.

## 5. Primer release

```bash
# Asegura que package.json, extension/manifest.json y shim.js tienen la misma versión
make ci

git add .
git commit -m "Release 0.2.0"
git tag v0.2.0
git push origin main --tags
```

El workflow `release.yml` verifica que el tag coincida con `package.json`, ejecuta `make ci` y publica:

- `teams-screenshare-fix-0.2.0.xpi`
- `teams-firefox-share-0.2.0-sources.zip`
- `SHA256SUMS`

## 6. AMO

La firma es manual. Configura los secretos del repositorio:

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

Después ejecuta el workflow **AMO Sign** con el canal `unlisted` o `listed`.

Antes de publicar en AMO, cambia el ID de la extensión en `extension/manifest.json`:

```json
"id": "teams-screenshare-fix@manumuxoz.github.io"
```

El ID `@local` es válido para desarrollo, pero no es apropiado para una publicación permanente. Cambiarlo después de publicar obliga a crear otra extensión.

## 7. Privacidad del correo en Git

Los commits actuales usan un correo personal como autor. GitHub puede ocultarlo en la interfaz si activas “Keep my email addresses private”, pero el correo sigue estando en el objeto del commit.

Antes de publicar, elige una de estas opciones:

### Opción A — reescribir el historial local (recomendada si el repo aún no es público)

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

## 8. Checklist antes del push

- [ ] `make ci` en verde.
- [ ] `git status` limpio.
- [ ] Sin secretos ni correos personales en el árbol de trabajo.
- [ ] `package.json`, `extension/manifest.json` y `shim.js` con la misma versión.
- [ ] `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md` y `CODE_OF_CONDUCT.md` presentes.
- [ ] Topics y descripción configurados.
- [ ] Private vulnerability reporting activado.
- [ ] Tag `v0.2.0` solo después de que `main` esté en GitHub.
