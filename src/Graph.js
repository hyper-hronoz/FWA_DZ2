export class Graph {
  constructor(node_count) {
    this.node_count = node_count;
    this.from = [];
    this.to = [];
    this.weights = [];
    this.edge_ids = new Set();
  }

  add_edge(a, b, weight) {
    if (a === b) {
      return false;
    }

    const min_node = Math.min(a, b);
    const max_node = Math.max(a, b);
    const id = min_node * this.node_count + max_node;

    if (this.edge_ids.has(id)) {
      return false;
    }

    this.edge_ids.add(id);
    this.from.push(a, b);
    this.to.push(b, a);
    this.weights.push(weight, weight);
    return true;
  }

  build_compressed_sparse_row() {
    if (this.from.length !== this.to.length || this.to.length !== this.weights.length) {
      throw new Error("Массивы рёбер должны иметь одинаковую длину.");
    }

    const row_ptr = new Uint32Array(this.node_count + 1);
    for (let index = 0; index < this.from.length; index += 1) {
      row_ptr[this.from[index] + 1] += 1;
    }

    for (let index = 1; index < row_ptr.length; index += 1) {
      row_ptr[index] += row_ptr[index - 1];
    }

    const cursor = row_ptr.slice(0, this.node_count);
    const neighbors = new Uint32Array(this.to.length);
    const costs = new Float64Array(this.weights.length);

    for (let index = 0; index < this.from.length; index += 1) {
      const source = this.from[index];
      const slot = cursor[source];
      neighbors[slot] = this.to[index];
      costs[slot] = this.weights[index];
      cursor[source] += 1;
    }

    return { offsets: row_ptr, neighbors, costs };
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
      undirected_edge_count: this.edge_ids.size,
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
