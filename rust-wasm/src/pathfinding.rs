use serde::Serialize;
use std::cell::RefCell;
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
    visited_count: usize,
}

struct Graph {
    node_count: usize,
    offsets: Vec<usize>,
    neighbors: Vec<u32>,
    costs: Vec<f64>,
}

thread_local! {
    static GRAPH: RefCell<Option<Graph>> = const { RefCell::new(None) };
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

pub fn load_graph(
    node_count: usize,
    from: Vec<u32>,
    to: Vec<u32>,
    weights: Vec<f64>,
) -> Result<(), JsValue> {
    let (offsets, neighbors, costs) = build_csr(node_count, &from, &to, &weights)?;

    GRAPH.with(|graph| {
        *graph.borrow_mut() = Some(Graph {
            node_count,
            offsets,
            neighbors,
            costs,
        });
    });

    Ok(())
}

pub fn shortest_path(
    start: usize,
    target: usize,
) -> Result<JsValue, JsValue> {
    GRAPH.with(|graph| shortest_path_on_loaded_graph(&graph.borrow(), start, target))
}

fn shortest_path_on_loaded_graph(
    graph: &Option<Graph>,
    start: usize,
    target: usize,
) -> Result<JsValue, JsValue> {
    let graph = graph
        .as_ref()
        .ok_or_else(|| JsValue::from_str("Graph is not loaded into WASM memory."))?;

    let node_count = graph.node_count;

    if start >= node_count || target >= node_count {
        return Err(JsValue::from_str("Start or target vertex is out of range."));
    }

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

        for edge_index in graph.offsets[node]..graph.offsets[node + 1] {
            let next_node = graph.neighbors[edge_index] as usize;
            let next_cost = cost + graph.costs[edge_index];

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
        visited_count,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Serialization failed: {error}")))
}
