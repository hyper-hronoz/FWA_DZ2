#include "graph.h"
#include "shortest_path_finder.h"

#include <cstdint>

namespace {
constexpr std::uint32_t max_node_count = 100000;
constexpr std::uint32_t max_directed_edges = 2000000;
}

extern "C" {
int run_shortest_path(
    std::uint32_t node_count,
    std::uint32_t edge_count,
    const std::uint32_t *from,
    const std::uint32_t *to,
    const double *weights,
    std::uint32_t start,
    std::uint32_t target,
    std::uint32_t *found,
    double *distance,
    std::uint32_t *visited_count,
    std::uint32_t *path_length,
    std::uint32_t *path_buffer) {
  if (node_count == 0 || node_count > max_node_count) {
    return 1;
  }
  if (edge_count > max_directed_edges) {
    return 2;
  }
  if (start >= node_count || target >= node_count) {
    return 3;
  }

  const graph graph_instance(node_count, edge_count, from, to, weights);
  const shortest_path_finder finder;
  shortest_path_finder::result result;
  const int error_code = finder.run(graph_instance, start, target, result);
  if (error_code != 0) {
    return error_code;
  }

  *found = result.found ? 1U : 0U;
  *distance = result.found ? result.distance : 0.0;
  *visited_count = result.visited_count;
  *path_length = static_cast<std::uint32_t>(result.path.size());

  for (std::uint32_t index = 0; index < *path_length; index += 1) {
    path_buffer[index] = result.path[index];
  }

  return 0;
}
}
