export class Graph {
  constructor(node_count) {
    this.node_count = node_count;
    this.from = [];
    this.to = [];
    this.weights = [];
    this.seen = new Set();
  }

  add_edge(a, b, weight) {
    if (a === b) {
      return false;
    }

    const min_node = Math.min(a, b);
    const max_node = Math.max(a, b);
    const key = min_node * this.node_count + max_node;

    if (this.seen.has(key)) {
      return false;
    }

    this.seen.add(key);
    this.from.push(a, b);
    this.to.push(b, a);
    this.weights.push(weight, weight);
    return true;
  }

  build_compressed_sparse_row() {
    if (this.from.length !== this.to.length || this.to.length !== this.weights.length) {
      throw new Error("Массивы рёбер должны иметь одинаковую длину.");
    }

    const offsets = new Uint32Array(this.node_count + 1);
    for (let index = 0; index < this.from.length; index += 1) {
      offsets[this.from[index] + 1] += 1;
    }

    for (let index = 1; index < offsets.length; index += 1) {
      offsets[index] += offsets[index - 1];
    }

    const cursor = offsets.slice(0, this.node_count);
    const neighbors = new Uint32Array(this.to.length);
    const costs = new Float64Array(this.weights.length);

    for (let index = 0; index < this.from.length; index += 1) {
      const source = this.from[index];
      const slot = cursor[source];
      neighbors[slot] = this.to[index];
      costs[slot] = this.weights[index];
      cursor[source] += 1;
    }

    return { offsets, neighbors, costs };
  }

  to_dataset({ seed, start, target }) {
    const from = Uint32Array.from(this.from);
    const to = Uint32Array.from(this.to);
    const weights = Float64Array.from(this.weights);

    return {
      node_count: this.node_count,
      seed,
      start,
      target,
      undirected_edge_count: this.seen.size,
      directed_edge_count: this.from.length,
      from,
      to,
      weights,
      csr: this.build_compressed_sparse_row()
    };
  }
}

export function build_compressed_sparse_row(node_count, from, to, weights) {
  const graph = new Graph(node_count);
  graph.from = Array.from(from);
  graph.to = Array.from(to);
  graph.weights = Array.from(weights);
  return graph.build_compressed_sparse_row();
}
