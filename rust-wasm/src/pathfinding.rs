use serde::Serialize;
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use wasm_bindgen::prelude::*;

#[derive(Copy, Clone)]
struct State {
    cost: f64,
    node: usize,
}

impl Eq for State {}

impl PartialEq for State {
    fn eq(&self, other: &Self) -> bool {
        self.node == other.node && self.cost == other.cost
    }
}

impl Ord for State {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .cost
            .partial_cmp(&self.cost)
            .unwrap_or(Ordering::Equal)
            .then_with(|| other.node.cmp(&self.node))
    }
}

impl PartialOrd for State {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Serialize)]
struct PathResult {
    found: bool,
    distance: Option<f64>,
    path_length: usize,
    path_nodes: Vec<u32>,
    visited_count: usize,
}

fn build_csr(
    node_count: usize,
    from: &[u32],
    to: &[u32],
    weights: &[f64],
) -> Result<(Vec<usize>, Vec<u32>, Vec<f64>), JsValue> {
    if from.len() != to.len() || to.len() != weights.len() {
        return Err(JsValue::from_str(
            "Edge arrays must have the same length.",
        ));
    }

    let edge_count = from.len();
    let mut offsets = vec![0usize; node_count + 1];

    for &source in from {
        let index = source as usize;
        if index >= node_count {
            return Err(JsValue::from_str("Source vertex is out of range."));
        }
        offsets[index + 1] += 1;
    }

    for index in 1..offsets.len() {
        offsets[index] += offsets[index - 1];
    }

    let mut cursor = offsets[..node_count].to_vec();
    let mut neighbors = vec![0u32; edge_count];
    let mut costs = vec![0.0f64; edge_count];

    for edge_index in 0..edge_count {
        let source = from[edge_index] as usize;
        let target = to[edge_index] as usize;

        if target >= node_count {
            return Err(JsValue::from_str("Target vertex is out of range."));
        }

        let slot = cursor[source];
        neighbors[slot] = to[edge_index];
        costs[slot] = weights[edge_index];
        cursor[source] += 1;
    }

    Ok((offsets, neighbors, costs))
}

fn reconstruct_path_length(previous: &[i32], start: usize, target: usize) -> usize {
    if target != start && previous[target] == -1 {
        return 0;
    }

    let mut length = 1usize;
    let mut current = target;

    while current != start {
        let parent = previous[current];
        if parent < 0 {
            return 0;
        }

        current = parent as usize;
        length += 1;
    }

    length
}

fn reconstruct_path_nodes(previous: &[i32], start: usize, target: usize) -> Vec<u32> {
    if target != start && previous[target] == -1 {
        return Vec::new();
    }

    let mut reversed_path = Vec::new();
    let mut current = target;

    loop {
        reversed_path.push(current as u32);
        if current == start {
            break;
        }

        let parent = previous[current];
        if parent < 0 {
            return Vec::new();
        }

        current = parent as usize;
    }

    reversed_path.reverse();
    reversed_path
}

pub fn shortest_path(
    node_count: usize,
    from: Vec<u32>,
    to: Vec<u32>,
    weights: Vec<f64>,
    start: usize,
    target: usize,
) -> Result<JsValue, JsValue> {
    if start >= node_count || target >= node_count {
        return Err(JsValue::from_str("Start or target vertex is out of range."));
    }

    let (offsets, neighbors, costs) = build_csr(node_count, &from, &to, &weights)?;
    let mut distances = vec![f64::INFINITY; node_count];
    let mut previous = vec![-1i32; node_count];
    let mut visited = vec![false; node_count];
    let mut heap = BinaryHeap::new();
    let mut visited_count = 0usize;

    distances[start] = 0.0;
    heap.push(State {
        cost: 0.0,
        node: start,
    });

    while let Some(State { cost, node }) = heap.pop() {
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
                heap.push(State {
                    cost: next_cost,
                    node: next_node,
                });
            }
        }
    }

    let found = distances[target].is_finite();
    let result = PathResult {
        found,
        distance: found.then_some(distances[target]),
        path_length: if found {
            reconstruct_path_length(&previous, start, target)
        } else {
            0
        },
        path_nodes: if found {
            reconstruct_path_nodes(&previous, start, target)
        } else {
            Vec::new()
        },
        visited_count,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Serialization failed: {error}")))
}
