mod pathfinding;
mod visualization;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn shortest_path_wasm(
    node_count: usize,
    from: Vec<u32>,
    to: Vec<u32>,
    weights: Vec<f64>,
    start: usize,
    target: usize,
) -> Result<JsValue, JsValue> {
    pathfinding::shortest_path(node_count, from, to, weights, start, target)
}

#[wasm_bindgen]
pub fn prepare_graph_visualization_wasm(
    node_count: usize,
    from: Vec<u32>,
    to: Vec<u32>,
    start: usize,
    target: usize,
    path_nodes: Vec<u32>,
    max_nodes: usize,
) -> Result<JsValue, JsValue> {
    visualization::prepare_graph_visualization(
        node_count,
        from,
        to,
        start,
        target,
        path_nodes,
        max_nodes,
    )
}
