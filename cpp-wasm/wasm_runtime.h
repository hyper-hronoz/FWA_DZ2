#ifndef __WASM_RUNTIME_H__
#define __WASM_RUNTIME_H__

#include <cstdint>

extern "C" {
std::uint32_t alloc_bytes(std::uint32_t byte_count);
void reset_allocator();
}

#endif
