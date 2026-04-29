#include "Graph.h"
#include "Shortest_Path_Finder.h"

#include <cstdint>

namespace {
constexpr std::uint32_t max_node_count = 100000;
constexpr std::uint32_t max_directed_edges = 2000000;
} // namespace

extern "C" {
int run_shortest_path(std::uint32_t node_count, std::uint32_t edge_count,
                      const std::uint32_t *from, const std::uint32_t *to,
                      const double *weights, std::uint32_t start,
                      std::uint32_t target, std::uint32_t *found,
                      double *distance, std::uint32_t *visited_count) {
  if (node_count == 0 || node_count > max_node_count) {
    return 1;
  }
  if (edge_count > max_directed_edges) {
    return 2;
  }
  if (start >= node_count || target >= node_count) {
    return 3;
  }

  const Graph graph_instance(node_count, edge_count, from, to, weights);
  const Shortest_Path_Finder finder;
  Shortest_Path_Finder::result result;
  const int error_code = finder.run(graph_instance, start, target, result);
  if (error_code != 0) {
    return error_code;
  }

  *found = result.found ? 1U : 0U;
  *distance = result.found ? result.distance : 0.0;
  *visited_count = result.visited_count;

  return 0;
}
}
