#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/src/wasm"

mkdir -p "${OUT_DIR}"

cargo build \
  --manifest-path "${ROOT_DIR}/rust-wasm/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release

wasm-bindgen \
  --target web \
  --out-dir "${OUT_DIR}" \
  "${ROOT_DIR}/rust-wasm/target/wasm32-unknown-unknown/release/path_finder_wasm.wasm"
