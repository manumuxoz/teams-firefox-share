SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

VERSION := $(shell node -p "require('./package.json').version")
DIST := dist

.PHONY: ci deps lint lint-js lint-ext test test-js test-py build smoke integration package clean

# Fixed pipeline: no stage may be skipped.
ci: deps lint test build smoke package

deps:
	npm ci

lint: lint-js lint-ext

lint-js:
	node --check extension/src/config-defaults.js
	node --check extension/src/lib/constraints.js
	node --check extension/src/config-bridge.js
	node --check extension/src/shim.js
	node --check extension/popup/popup.js
	python3 -m py_compile tools/teams-ss-doctor

lint-ext:
	npx web-ext lint --source-dir extension --warnings-as-errors

test: test-js test-py

test-js:
	npm test

test-py:
	python3 -m unittest discover -s tests -p 'test_*.py'

build:
	rm -rf $(DIST)
	npx web-ext build \
		--source-dir extension \
		--artifacts-dir $(DIST) \
		--overwrite-dest \
		--filename 'teams-screenshare-fix-$(VERSION).xpi'

smoke:
	scripts/smoke-extension.sh

# Optional: real Teams page + geckodriver + selenium. Not part of `make ci`.
integration: build
	python3 tests/integration/test_extension.py

package:
	@test -f dist/teams-screenshare-fix-$(VERSION).xpi || $(MAKE) build
	scripts/package.sh

clean:
	rm -rf $(DIST) tests/__pycache__ tools/__pycache__ node_modules/.cache
