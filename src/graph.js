export function createMulberry32(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, maxExclusive) {
  return Math.floor(rng() * maxExclusive);
}

function randomWeight(rng) {
  return 1 + Math.floor(rng() * 90);
}

function addUndirectedRoad(nodeCount, from, to, weights, seen, a, b, weight) {
  if (a === b) {
    return false;
  }

  const minNode = Math.min(a, b);
  const maxNode = Math.max(a, b);
  const key = minNode * nodeCount + maxNode;

  if (seen.has(key)) {
    return false;
  }

  seen.add(key);
  from.push(a, b);
  to.push(b, a);
  weights.push(weight, weight);

  return true;
}

export function generateRoadGraph({ nodeCount, averageDegree, seed }) {
  const normalizedDegree = Math.max(2, Math.min(averageDegree, nodeCount - 1));
  const rng = createMulberry32(seed);
  const targetUndirectedEdges = Math.max(nodeCount - 1, Math.floor((nodeCount * normalizedDegree) / 2));
  const from = [];
  const to = [];
  const weights = [];
  const seen = new Set();

  for (let node = 1; node < nodeCount; node += 1) {
    addUndirectedRoad(nodeCount, from, to, weights, seen, node - 1, node, randomWeight(rng));
  }

  while (seen.size < targetUndirectedEdges) {
    const a = randomInt(rng, nodeCount);
    let b = randomInt(rng, nodeCount - 1);
    if (b >= a) {
      b += 1;
    }

    addUndirectedRoad(nodeCount, from, to, weights, seen, a, b, randomWeight(rng));
  }

  const start = randomInt(rng, nodeCount);
  let target = randomInt(rng, nodeCount - 1);
  if (target >= start) {
    target += 1;
  }

  const fromArray = Uint32Array.from(from);
  const toArray = Uint32Array.from(to);
  const weightsArray = Float64Array.from(weights);
  const compressedSparseRow = buildCompressedSparseRow(nodeCount, fromArray, toArray, weightsArray);

  return {
    nodeCount,
    seed,
    start,
    target,
    undirectedEdgeCount: seen.size,
    directedEdgeCount: from.length,
    from: fromArray,
    to: toArray,
    weights: weightsArray,
    csr: compressedSparseRow
  };
}

export function buildCompressedSparseRow(nodeCount, from, to, weights) {
  if (from.length !== to.length || to.length !== weights.length) {
    throw new Error("Массивы рёбер должны иметь одинаковую длину.");
  }

  const offsets = new Uint32Array(nodeCount + 1);
  for (let i = 0; i < from.length; i += 1) {
    offsets[from[i] + 1] += 1;
  }

  for (let i = 1; i < offsets.length; i += 1) {
    offsets[i] += offsets[i - 1];
  }

  const cursor = offsets.slice(0, nodeCount);
  const neighbors = new Uint32Array(to.length);
  const costs = new Float64Array(weights.length);

  for (let i = 0; i < from.length; i += 1) {
    const source = from[i];
    const slot = cursor[source];
    neighbors[slot] = to[i];
    costs[slot] = weights[i];
    cursor[source] += 1;
  }

  return { offsets, neighbors, costs };
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(node, cost) {
    this.items.push({ node, cost });
    this.#bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) {
      return null;
    }

    const top = this.items[0];
    const last = this.items.pop();

    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.#bubbleDown(0);
    }

    return top;
  }

  get size() {
    return this.items.length;
  }

  #bubbleUp(index) {
    let currentIndex = index;
    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (this.#compare(this.items[parentIndex], this.items[currentIndex]) <= 0) {
        break;
      }

      [this.items[parentIndex], this.items[currentIndex]] = [this.items[currentIndex], this.items[parentIndex]];
      currentIndex = parentIndex;
    }
  }

  #bubbleDown(index) {
    let currentIndex = index;

    while (true) {
      const leftChild = currentIndex * 2 + 1;
      const rightChild = leftChild + 1;
      let smallest = currentIndex;

      if (leftChild < this.items.length && this.#compare(this.items[leftChild], this.items[smallest]) < 0) {
        smallest = leftChild;
      }

      if (rightChild < this.items.length && this.#compare(this.items[rightChild], this.items[smallest]) < 0) {
        smallest = rightChild;
      }

      if (smallest === currentIndex) {
        break;
      }

      [this.items[currentIndex], this.items[smallest]] = [this.items[smallest], this.items[currentIndex]];
      currentIndex = smallest;
    }
  }

  #compare(left, right) {
    if (left.cost !== right.cost) {
      return left.cost - right.cost;
    }

    return left.node - right.node;
  }
}

function reconstructPathLength(previous, start, target) {
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

function reconstructPathNodes(previous, start, target) {
  if (target !== start && previous[target] === -1) {
    return [];
  }

  const reversedPath = [];
  let cursor = target;

  while (true) {
    reversedPath.push(cursor);
    if (cursor === start) {
      break;
    }

    cursor = previous[cursor];
    if (cursor === -1) {
      return [];
    }
  }

  reversedPath.reverse();
  return reversedPath;
}

function dijkstraWithCsr(nodeCount, offsets, neighbors, costs, start, target) {
  const distances = new Float64Array(nodeCount);
  distances.fill(Number.POSITIVE_INFINITY);

  const previous = new Int32Array(nodeCount);
  previous.fill(-1);

  const visited = new Uint8Array(nodeCount);
  const heap = new MinHeap();
  let visitedCount = 0;

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
    visitedCount += 1;

    if (node === target) {
      break;
    }

    if (cost > distances[node]) {
      continue;
    }

    for (let edgeIndex = offsets[node]; edgeIndex < offsets[node + 1]; edgeIndex += 1) {
      const nextNode = neighbors[edgeIndex];
      const nextCost = cost + costs[edgeIndex];

      if (nextCost < distances[nextNode]) {
        distances[nextNode] = nextCost;
        previous[nextNode] = node;
        heap.push(nextNode, nextCost);
      }
    }
  }

  const found = Number.isFinite(distances[target]);
  return {
    found,
    distance: found ? distances[target] : null,
    pathLength: found ? reconstructPathLength(previous, start, target) : 0,
    pathNodes: found ? reconstructPathNodes(previous, start, target) : [],
    visitedCount
  };
}

export function shortestPathJs(nodeCount, from, to, weights, start, target, prebuiltCsr) {
  if (start < 0 || start >= nodeCount || target < 0 || target >= nodeCount) {
    throw new Error("Некорректные вершины старта или финиша.");
  }

  const { offsets, neighbors, costs } = prebuiltCsr ?? buildCompressedSparseRow(nodeCount, from, to, weights);
  return dijkstraWithCsr(nodeCount, offsets, neighbors, costs, start, target);
}
