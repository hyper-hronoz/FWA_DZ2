use serde::Serialize;
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct PathResult {
    found: bool,
    distance: Option<f64>,
    path_length: usize,
    path_nodes: Vec<u32>,
    visited_count: usize,
}

#[derive(Copy, Clone)]
struct HeapState {
    node: usize,
    cost: f64,
}

impl PartialEq for HeapState {
    fn eq(&self, other: &Self) -> bool {
        self.node == other.node && self.cost == other.cost
    }
}

impl Eq for HeapState {}

impl Ord for HeapState {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .cost
            .total_cmp(&self.cost)
            .then_with(|| other.node.cmp(&self.node))
    }
}

impl PartialOrd for HeapState {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn build_csr(
    node_count: usize,
    from: &[u32],
    to: &[u32],
    weights: &[f64],
) -> Result<(Vec<usize>, Vec<u32>, Vec<f64>), JsValue> {
    if from.len() != to.len() || to.len() != weights.len() {
        return Err(JsValue::from_str(
            "Массивы рёбер должны иметь одинаковую длину.",
        ));
    }

    let mut offsets = vec![0usize; node_count + 1];
    for &source in from {
        let source = source as usize;
        if source >= node_count {
            return Err(JsValue::from_str("В массиве from есть вершина вне диапазона."));
        }
        offsets[source + 1] += 1;
    }

    for index in 1..offsets.len() {
        offsets[index] += offsets[index - 1];
    }

    let mut cursor = offsets[..node_count].to_vec();
    let mut neighbors = vec![0u32; to.len()];
    let mut costs = vec![0.0f64; weights.len()];

    for edge_index in 0..from.len() {
        let source = from[edge_index] as usize;
        let target = to[edge_index] as usize;
        if target >= node_count {
            return Err(JsValue::from_str("В массиве to есть вершина вне диапазона."));
        }

        let slot = cursor[source];
        neighbors[slot] = to[edge_index];
        costs[slot] = weights[edge_index];
        cursor[source] += 1;
    }

    Ok((offsets, neighbors, costs))
}

fn reconstruct_path(previous: &[i32], start: usize, target: usize) -> Vec<u32> {
    if target != start && previous[target] == -1 {
        return Vec::new();
    }

    let mut reversed = Vec::new();
    let mut cursor = target as i32;

    loop {
        reversed.push(cursor as u32);
        if cursor as usize == start {
            break;
        }

        cursor = previous[cursor as usize];
        if cursor == -1 {
            return Vec::new();
        }
    }

    reversed.reverse();
    reversed
}

fn shortest_path(
    node_count: usize,
    from: Vec<u32>,
    to: Vec<u32>,
    weights: Vec<f64>,
    start: usize,
    target: usize,
) -> Result<PathResult, JsValue> {
    if start >= node_count || target >= node_count {
        return Err(JsValue::from_str("Некорректные вершины старта или финиша."));
    }

    let (offsets, neighbors, costs) = build_csr(node_count, &from, &to, &weights)?;

    let mut distances = vec![f64::INFINITY; node_count];
    let mut previous = vec![-1i32; node_count];
    let mut visited = vec![false; node_count];
    let mut heap = BinaryHeap::new();
    let mut visited_count = 0usize;

    distances[start] = 0.0;
    heap.push(HeapState {
        node: start,
        cost: 0.0,
    });

    while let Some(HeapState { node, cost }) = heap.pop() {
        if visited[node] {
            continue;
        }

        visited[node] = true;
        visited_count += 1;

        if node == target {
            break;
        }

        if cost > distances[node] {
            continue;
        }

        for edge_index in offsets[node]..offsets[node + 1] {
            let next_node = neighbors[edge_index] as usize;
            let next_cost = cost + costs[edge_index];

            if next_cost < distances[next_node] {
                distances[next_node] = next_cost;
                previous[next_node] = node as i32;
                heap.push(HeapState {
                    node: next_node,
                    cost: next_cost,
                });
            }
        }
    }

    let found = distances[target].is_finite();
    let path_nodes = if found {
        reconstruct_path(&previous, start, target)
    } else {
        Vec::new()
    };

    Ok(PathResult {
        found,
        distance: found.then_some(distances[target]),
        path_length: path_nodes.len(),
        path_nodes,
        visited_count,
    })
}

#[wasm_bindgen]
pub fn shortest_path_wasm(
    node_count: usize,
    from: Vec<u32>,
    to: Vec<u32>,
    weights: Vec<f64>,
    start: usize,
    target: usize,
) -> Result<JsValue, JsValue> {
    let result = shortest_path(node_count, from, to, weights, start, target)?;
    serde_wasm_bindgen::to_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Не удалось сериализовать результат: {error}")))
}
