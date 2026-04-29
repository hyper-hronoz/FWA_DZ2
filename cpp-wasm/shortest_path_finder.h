#pragma once

#include "graph.h"

#include <cstdint>
#include <vector>

class shortest_path_finder {
public:
  struct result {
    bool found = false;
    double distance = 0.0;
    std::uint32_t visited_count = 0;
    std::vector<std::uint32_t> path;
  };

  int run(const graph &graph, std::uint32_t start, std::uint32_t target, result &result) const;
};
