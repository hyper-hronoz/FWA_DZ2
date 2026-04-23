#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUSTUP_BIN="${HOME}/.cargo/bin/rustup"
WASM_BINDGEN_BIN="${HOME}/.cargo/bin/wasm-bindgen"
REQUIRED_WASM_BINDGEN_VERSION="0.2.118"

if [[ -x "${RUSTUP_BIN}" ]]; then
  "${RUSTUP_BIN}" target add wasm32-unknown-unknown >/dev/null
fi

if [[ ! -x "${WASM_BINDGEN_BIN}" ]] || [[ "$("${WASM_BINDGEN_BIN}" --version | awk '{print $2}')" != "${REQUIRED_WASM_BINDGEN_VERSION}" ]]; then
  "${HOME}/.cargo/bin/cargo" install wasm-bindgen-cli --version "${REQUIRED_WASM_BINDGEN_VERSION}" --force
fi

mkdir -p "${ROOT_DIR}/src/wasm"

"${HOME}/.cargo/bin/cargo" build \
  --manifest-path "${ROOT_DIR}/rust-wasm/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release

"${WASM_BINDGEN_BIN}" \
  --target web \
  --out-dir "${ROOT_DIR}/src/wasm" \
  "${ROOT_DIR}/rust-wasm/target/wasm32-unknown-unknown/release/path_finder_wasm.wasm"
