#pragma once

#include <cstdint>

extern "C" {
std::uint32_t alloc_bytes(std::uint32_t byte_count, std::uint32_t alignment);
void reset_allocator();
}
