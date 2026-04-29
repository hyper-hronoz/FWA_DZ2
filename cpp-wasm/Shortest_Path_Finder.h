#ifndef __SHORTES_PATH_FINDNER_H__
#define __SHORTES_PATH_FINDNER_H__

#include <cstdint>

#include "Graph.h"

class Shortest_Path_Finder {
public:
  struct result {
    bool found = false;
    double distance = 0.0;
    std::uint32_t visited_count = 0;
  };

  int run(const Graph &graph, std::uint32_t start, std::uint32_t target,
          result &result) const;
};

#endif
