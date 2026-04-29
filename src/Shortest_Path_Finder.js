import { build_compressed_sparse_row } from "./Graph.js";

class Min_Heap {
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

/* PATH_RECONSTRUCTION_DISABLED
function reconstruct_path_length(previous, start, target) {
  if (target !== start && previous[target] === -1) {
    return 0;
  }

  let length = 1;
  let cursor = target;

  while (cursor !== start) {
    cursor = previous[cursor];
    if (cursor === -1) {
      return 0;
    }

    length += 1;
  }

  return length;
}

function reconstruct_path_nodes(previous, start, target) {
  if (target !== start && previous[target] === -1) {
    return [];
  }

  const reversed_path = [];
  let cursor = target;

  while (true) {
    reversed_path.push(cursor);
    if (cursor === start) {
      break;
    }

    cursor = previous[cursor];
    if (cursor === -1) {
      return [];
    }
  }

  reversed_path.reverse();
  return reversed_path;
}
PATH_RECONSTRUCTION_DISABLED */

export class shortest_path_finder_js {
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

    /* PATH_RECONSTRUCTION_DISABLED
    const previous = new Int32Array(graph.node_count);
    previous.fill(-1);
    PATH_RECONSTRUCTION_DISABLED */

    const visited = new Uint8Array(graph.node_count);
    const heap = new Min_Heap();
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
          /* PATH_RECONSTRUCTION_DISABLED
          previous[next_node] = node;
          PATH_RECONSTRUCTION_DISABLED */
          heap.push(next_node, next_cost);
        }
      }
    }

    const found = Number.isFinite(distances[target]);
    const compute_time = performance.now() - compute_started;
    return {
      found,
      distance: found ? distances[target] : null,
      /* PATH_RECONSTRUCTION_DISABLED
      path_length: found ? reconstruct_path_length(previous, start, target) : 0,
      path_nodes: found ? reconstruct_path_nodes(previous, start, target) : [],
      PATH_RECONSTRUCTION_DISABLED */
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
  const finder = new shortest_path_finder_js();
  return finder.find_shortest_path(graph, start, target, prebuilt_csr);
}
