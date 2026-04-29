cmake_minimum_required(VERSION 3.20)

project(path_finder_wasm LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(
  path_finder_wasm
  cpp-wasm/Graph.cpp
  cpp-wasm/Shortest_Path_Finder.cpp
  cpp-wasm/wasm_runtime.cpp
  cpp-wasm/Path_Finder.cpp
)

set_target_properties(path_finder_wasm PROPERTIES
  OUTPUT_NAME "path_finder_wasm"
  PREFIX ""
  SUFFIX ".wasm"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/src/wasm"
)

target_compile_options(path_finder_wasm PRIVATE
  -O3
  -fno-exceptions
  -fno-rtti
)

target_link_options(path_finder_wasm PRIVATE
  -Wl,--no-entry
  -Wl,--export-memory
  -Wl,--initial-memory=134217728
  -Wl,--max-memory=268435456
  -Wl,--export=alloc_bytes
  -Wl,--export=reset_allocator
  -Wl,--export=run_shortest_path
)
