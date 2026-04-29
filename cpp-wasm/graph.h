#pragma once

#include <cstdint>
#include <vector>

class graph {
public:
  struct edge {
    std::uint32_t to;
    double weight;
  };

  graph(
      std::uint32_t node_count,
      std::uint32_t edge_count,
      const std::uint32_t *from,
      const std::uint32_t *to,
      const double *weights);

  std::uint32_t node_count() const;
  bool is_valid() const;
  const std::vector<edge> &neighbors(std::uint32_t node) const;

private:
  std::uint32_t node_count_;
  bool is_valid_ = true;
  std::vector<std::vector<edge>> adjacency_;
};
