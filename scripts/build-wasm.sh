#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build/wasm"
TOOLCHAIN_FILE="${ROOT_DIR}/cmake/wasi-sdk-toolchain.cmake"

if [[ -n "${WASI_SDK_DIR:-}" ]]; then
  SDK_DIR="${WASI_SDK_DIR}"
else
  SDK_DIR="$(find "${ROOT_DIR}/.tools" -maxdepth 1 -type d -name 'wasi-sdk-*' | sort -V | tail -n 1)"
fi

if [[ -z "${SDK_DIR}" || ! -x "${SDK_DIR}/bin/clang++" ]]; then
  echo "wasi-sdk not found. Set WASI_SDK_DIR or unpack wasi-sdk into ${ROOT_DIR}/.tools." >&2
  exit 1
fi

cmake -S "${ROOT_DIR}" -B "${BUILD_DIR}" --fresh \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE="${TOOLCHAIN_FILE}" \
  -DWASI_SDK_DIR="${SDK_DIR}"

cmake --build "${BUILD_DIR}" --target path_finder_wasm
