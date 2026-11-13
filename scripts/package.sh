#!/usr/bin/env bash
#
# Build the release artifacts: XPI, source archive and SHA256SUMS.
# The source archive must contain the same working tree that produced the XPI,
# not an older commit.
#
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail

cd "$(dirname "$0")/.."

version="$(node -p "require('./package.json').version")"
xpi="dist/teams-screenshare-fix-${version}.xpi"
sources="dist/teams-firefox-share-${version}-sources.zip"

if [[ ! -f "$xpi" ]]; then
  echo "No existe $xpi; ejecuta 'make build' primero." >&2
  exit 1
fi

rm -f "$sources"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ -z "$(git status --porcelain)" ]]; then
    git archive \
      --format=zip \
      --prefix="teams-firefox-share-${version}/" \
      -o "$sources" \
      HEAD
  else
    # Dirty tree: archive exactly what is on disk, excluding ignored files.
    git ls-files --cached --others --exclude-standard |
      zip -q -@ "$sources"
  fi
fi

if [[ ! -f "$sources" ]]; then
  echo "No se generó $sources; se necesita un checkout Git." >&2
  exit 1
fi

if ! unzip -l "$sources" | grep "extension/src/config-bridge.js" >/dev/null; then
  echo "El zip de fuentes no contiene extension/src/config-bridge.js; revisa package.sh." >&2
  exit 1
fi

(
  cd dist
  sha256sum *.xpi *-sources.zip >SHA256SUMS
  sha256sum -c SHA256SUMS
)

echo "Artefactos:"
cat dist/SHA256SUMS
