#include "wasm_runtime.h"

#include <cstdlib>
#include <vector>

namespace {
std::vector<void *> wasm_allocations;
}

extern "C" {
std::uint32_t alloc_bytes(std::uint32_t byte_count, std::uint32_t) {
  void *pointer = std::malloc(byte_count == 0 ? 1 : byte_count);
  if (pointer == nullptr) {
    return 0;
  }

  wasm_allocations.push_back(pointer);
  return static_cast<std::uint32_t>(reinterpret_cast<std::uintptr_t>(pointer));
}

void reset_allocator() {
  for (void *pointer : wasm_allocations) {
    std::free(pointer);
  }
  wasm_allocations.clear();
}
}
