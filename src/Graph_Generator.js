import { Graph } from "./Graph.js";

export class Graph_Generator {
  constructor(seed) {
    this.rng = Graph_Generator.create_mulberry_32(seed);
  }

  static create_mulberry_32(seed) {
    let state = seed >>> 0;

    // https://github.com/cprosche/mulberry32
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  random_int(max_ex) {
    return Math.floor(this.rng() * max_ex);
  }

  random_weight() {
    return 1 + Math.floor(this.rng() * 90);
  }

  generate_road_graph({ node_count, average_degree, seed }) {
    const normalized_degree = Math.max(2, Math.min(average_degree, node_count - 1));
    const target_undirected_edges = Math.max(node_count - 1, Math.floor((node_count * normalized_degree) / 2));
    const graph = new Graph(node_count);

    // гарантируем что граф будет связным
    for (let node = 1; node < node_count; node++) {
      graph.add_edge(node - 1, node, this.random_weight());
    }

    while (graph.edge_ids.size < target_undirected_edges) {
      const a = this.random_int(node_count);
      let b = this.random_int(node_count - 1);
      if (b >= a) {
        b += 1;
      }

      graph.add_edge(a, b, this.random_weight());
    }

    const start = this.random_int(node_count);
    let target = this.random_int(node_count - 1);
    if (target >= start) {
      target += 1;
    }

    return graph.to_dataset({ seed, start, target });
  }
}

export function generate_road_graph(config) {
  const generator = new Graph_Generator(config.seed);
  return generator.generate_road_graph(config);
}
