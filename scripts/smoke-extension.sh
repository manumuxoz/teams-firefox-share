#!/usr/bin/env bash
#
# Smoke test: load the extension in a headless Firefox and wait for the
# temporary-add-on installation marker. This catches manifest/packaging errors
# that unit tests cannot see.
#
# SPDX-License-Identifier: MPL-2.0
set -euo pipefail

cd "$(dirname "$0")/.."

log="$(mktemp)"
pid=""
installed=0

cleanup() {
  if [[ -n "$pid" ]]; then
    kill -- "-$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -f "$log"
}
trap cleanup EXIT

extra_args=()
if [[ -n "${FIREFOX_BIN:-}" ]]; then
  extra_args+=(--firefox "$FIREFOX_BIN")
fi

setsid --wait env MOZ_HEADLESS=1 npx web-ext run \
  --source-dir extension \
  --start-url about:blank \
  --args=--headless \
  --no-reload \
  --no-input \
  --verbose \
  "${extra_args[@]}" >"$log" 2>&1 &
pid=$!

for _ in $(seq 1 60); do
  if grep -q "Installed .* as a temporary add-on" "$log"; then
    installed=1
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ "$installed" == "1" ]]; then
  echo "smoke: extensión instalada correctamente en Firefox headless"
  exit 0
fi

echo "smoke: no se detectó la instalación del add-on temporal" >&2
tail -80 "$log" >&2
exit 1
