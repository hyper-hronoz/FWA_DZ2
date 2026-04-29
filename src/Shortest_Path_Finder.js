import { build_compressed_sparse_row } from "./Graph.js";

class Emu_Priority_Queue {
  constructor() {
    this.items = [];
  }

  push(node, cost) {
    this.items.push({ node, cost });
    this.#bubble_up(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) {
      return null;
    }

    const top = this.items[0];
    const last = this.items.pop();

    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.#bubble_down(0);
    }

    return top;
  }

  get size() {
    return this.items.length;
  }

  #bubble_up(index) {
    let current_index = index;
    while (current_index > 0) {
      const parent_index = Math.floor((current_index - 1) / 2);
      if (this.#compare(this.items[parent_index], this.items[current_index]) <= 0) {
        break;
      }

      [this.items[parent_index], this.items[current_index]] = [this.items[current_index], this.items[parent_index]];
      current_index = parent_index;
    }
  }

  #bubble_down(index) {
    let current_index = index;

    while (true) {
      const left_child = current_index * 2 + 1;
      const right_child = left_child + 1;
      let smallest = current_index;

      if (left_child < this.items.length && this.#compare(this.items[left_child], this.items[smallest]) < 0) {
        smallest = left_child;
      }

      if (right_child < this.items.length && this.#compare(this.items[right_child], this.items[smallest]) < 0) {
        smallest = right_child;
      }

      if (smallest === current_index) {
        break;
      }

      [this.items[current_index], this.items[smallest]] = [this.items[smallest], this.items[current_index]];
      current_index = smallest;
    }
  }

  #compare(left, right) {
    if (left.cost !== right.cost) {
      return left.cost - right.cost;
    }

    return left.node - right.node;
  }
}

export class Shortest_Path_Finder {
  find_shortest_path(graph, start, target, prebuilt_csr) {
    if (start < 0 || start >= graph.node_count || target < 0 || target >= graph.node_count) {
      throw new Error("Некорректные вершины старта или финиша.");
    }

    const build_started = performance.now();
    const { offsets: row_ptrs, neighbors, costs } =
      prebuilt_csr ?? build_compressed_sparse_row(graph.node_count, graph.from, graph.to, graph.weights);
    const build_time = performance.now() - build_started;

    const distances = new Float64Array(graph.node_count);
    distances.fill(Number.POSITIVE_INFINITY);

    const visited = new Uint8Array(graph.node_count);
    const heap = new Emu_Priority_Queue();
    let visited_count = 0;

    const compute_started = performance.now();
    distances[start] = 0;
    heap.push(start, 0);

    while (heap.size > 0) {
      const state = heap.pop();
      if (!state) {
        break;
      }

      const { node, cost } = state;
      if (visited[node]) {
        continue;
      }

      visited[node] = 1;
      visited_count += 1;

      if (node === target) {
        break;
      }

      if (cost > distances[node]) {
        continue;
      }

      for (let edge_index = row_ptrs[node]; edge_index < row_ptrs[node + 1]; edge_index += 1) {
        const next_node = neighbors[edge_index];
        const next_cost = cost + costs[edge_index];

        if (next_cost < distances[next_node]) {
          distances[next_node] = next_cost;
          heap.push(next_node, next_cost);
        }
      }
    }

    const found = Number.isFinite(distances[target]);
    const compute_time = performance.now() - compute_started;
    return {
      found,
      distance: found ? distances[target] : null,
      visited_count,
      timings: {
        build: build_time,
        compute: compute_time
      }
    };
  }
}

export function shortest_path_js(node_count, from, to, weights, start, target, prebuilt_csr) {
  const graph = { node_count, from, to, weights };
  const finder = new Shortest_Path_Finder();
  return finder.find_shortest_path(graph, start, target, prebuilt_csr);
}
