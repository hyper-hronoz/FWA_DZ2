mod pathfinding;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn load_graph_wasm(
    node_count: usize,
    from: Vec<u32>,
    to: Vec<u32>,
    weights: Vec<f64>,
) -> Result<(), JsValue> {
    pathfinding::load_graph(node_count, from, to, weights)
}

#[wasm_bindgen]
pub fn shortest_path_wasm(start: usize, target: usize) -> Result<JsValue, JsValue> {
    pathfinding::shortest_path(start, target)
}
