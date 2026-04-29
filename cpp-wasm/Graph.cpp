#include "Graph.h"

Graph::Graph(std::uint32_t node_count, std::uint32_t edge_count,
             const std::uint32_t *from, const std::uint32_t *to,
             const double *weights)
    : node_count_(node_count), adjacency_(node_count) {

  for (std::uint32_t edge_index = 0; edge_index < edge_count; edge_index += 1) {
    const std::uint32_t source = from[edge_index];
    const std::uint32_t destination = to[edge_index];
    if (source >= node_count_ || destination >= node_count_) {
      is_valid_ = false;
      adjacency_.clear();
      return;
    }

    adjacency_[source].push_back({destination, weights[edge_index]});
  }
}

std::uint32_t Graph::node_count() const { return node_count_; }

bool Graph::is_valid() const { return is_valid_; }

const std::vector<Graph::edge> &Graph::neighbors(std::uint32_t node) const {
  return adjacency_[node];
}
