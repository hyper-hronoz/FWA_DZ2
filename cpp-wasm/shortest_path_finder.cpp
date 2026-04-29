#include "shortest_path_finder.h"

#include <limits>
#include <queue>
#include <utility>
#include <vector>

namespace {
constexpr double inf = std::numeric_limits<double>::infinity();
}

int shortest_path_finder::run(const graph &graph, std::uint32_t start, std::uint32_t target, result &result) const {
  if (!graph.is_valid()) {
    return 4;
  }

  using queue_entry = std::pair<double, std::uint32_t>;

  std::vector<double> distances(graph.node_count(), inf);
  std::vector<bool> visited(graph.node_count(), false);
  std::priority_queue<queue_entry, std::vector<queue_entry>, std::greater<>> queue;

  result = {};
  distances[start] = 0.0;
  queue.push({0.0, start});

  while (!queue.empty()) {
    const auto [current_cost, node] = queue.top();
    queue.pop();

    if (visited[node]) {
      continue;
    }

    visited[node] = true;
    result.visited_count += 1;

    if (node == target) {
      break;
    }

    if (current_cost > distances[node]) {
      continue;
    }

    for (const auto &[next_node, weight] : graph.neighbors(node)) {
      const double next_cost = current_cost + weight;
      if (next_cost >= distances[next_node]) {
        continue;
      }

      distances[next_node] = next_cost;
      queue.push({next_cost, next_node});
    }
  }

  if (distances[target] == inf) {
    return 0;
  }

  result.found = true;
  result.distance = distances[target];
  return 0;
}
