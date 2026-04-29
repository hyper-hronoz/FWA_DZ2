import "bootstrap/dist/css/bootstrap.min.css";

import { generate_road_graph } from "./Graph_Generator.js";
import { shortest_path_js } from "./Shortest_Path_Finder.js";
import init_wasm, { shortest_path_wasm } from "./wasm/path_finder_wasm.js";

(() => {
  class UI_context {
    constructor() {
      this.form = document.querySelector("#benchmark-form");
      this.controls = {
        run_button: document.querySelector("#run-button"),
        preset_button: document.querySelector("#preset-button")
      };
      this.dataset_fields = {
        nodes: document.querySelector("#nodes-stat"),
        edges: document.querySelector("#edges-stat"),
        directed: document.querySelector("#directed-stat"),
        generation: document.querySelector("#generation-stat")
      };
      this.result_fields = {
        js_average: document.querySelector("#js-avg"),
        js_details: document.querySelector("#js-details"),
        js_bar: document.querySelector("#js-bar"),
        wasm_average: document.querySelector("#wasm-avg"),
        wasm_details: document.querySelector("#wasm-details"),
        wasm_bar: document.querySelector("#wasm-bar")
      };
    }

    read_configuration() {
      const form_data = new FormData(this.form);
      const node_count = Number(form_data.get("node_count"));
      const average_degree = Number(form_data.get("average_degree"));
      const runs = Number(form_data.get("runs"));
      const seed = Number(form_data.get("seed"));

      return {
        node_count: Math.max(10000, Math.min(100000, Math.trunc(node_count))),
        average_degree: Math.max(2, Math.min(20, Math.trunc(average_degree))),
        runs: Math.max(1, Math.min(10, Math.trunc(runs))),
        seed: Math.max(1, Math.min(4294967295, Math.trunc(seed)))
      };
    }

    write_configuration(config) {
      this.form.elements.namedItem("node_count").value = String(config.node_count);
      this.form.elements.namedItem("average_degree").value = String(config.average_degree);
      this.form.runs.value = String(config.runs);
      this.form.seed.value = String(config.seed);
    }

    reset_result_bars() {
      this.result_fields.js_bar.style.width = "0%";
      this.result_fields.wasm_bar.style.width = "0%";
    }

    render_dataset(graph, generation_time) {
      this.dataset_fields.nodes.textContent = format_integer(graph.node_count);
      this.dataset_fields.edges.textContent = format_integer(graph.undirected_edge_count);
      this.dataset_fields.directed.textContent = format_integer(graph.directed_edge_count);
      this.dataset_fields.generation.textContent = format_milliseconds(generation_time);
    }

    set_running_state(is_running) {
      this.controls.run_button.disabled = is_running;
      this.controls.preset_button.disabled = is_running;
      this.controls.run_button.classList.toggle("disabled", is_running);
      this.controls.preset_button.classList.toggle("disabled", is_running);
    }
  }

  const ui_context = new UI_context();

  let is_wasm_ready = false;

  const format_integer = (value) => {
    return new Intl.NumberFormat("ru-RU").format(value);
  }

  const format_milliseconds = (value) => {
    return `${value.toFixed(2)} мс`;
  }

  const format_distance = (value) => {
    if (value === null || !Number.isFinite(value)) {
      return "нет пути";
    }

    return value.toFixed(2);
  }

  const render_detail_items = (container, items) => {
    container.replaceChildren();

    for (const item of items) {
      const element = document.createElement("span");
      element.className = "badge rounded-pill text-bg-light border text-secondary-emphasis fw-normal py-2 px-3";
      element.textContent = item;
      container.appendChild(element);
    }
  }

  const calculate_average = (values) => {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function approximately_equal(left, right) {
    if (left === right) {
      return true;
    }

    if (left === null || right === null) {
      return false;
    }

    return Math.abs(left - right) < 1e-9;
  }

  function validate_results(js_result, wasm_result) {
    if (js_result.found !== wasm_result.found) {
      throw new Error("JS и WASM вернули разные признаки существования пути.");
    }

    if (!approximately_equal(js_result.distance, wasm_result.distance)) {
      throw new Error("JS и WASM вычислили разные расстояния.");
    }

    if (js_result.visited_count !== wasm_result.visited_count) {
      throw new Error("JS и WASM посетили разное количество вершин.");
    }

    /* PATH_RECONSTRUCTION_DISABLED
    if (js_result.path_length !== wasm_result.path_length) {
      throw new Error("JS и WASM вычислили разные длины маршрута.");
    }

    if (js_result.path_nodes.length !== wasm_result.path_nodes.length) {
      throw new Error("JS и WASM построили пути разной длины.");
    }

    for (let index = 0; index < js_result.path_nodes.length; index += 1) {
      if (js_result.path_nodes[index] !== wasm_result.path_nodes[index]) {
        throw new Error("JS и WASM построили разные кратчайшие пути.");
      }
    }
    PATH_RECONSTRUCTION_DISABLED */
  }

  function render_results(js_runs, wasm_runs, js_result, wasm_result) {
    const js_average = calculate_average(js_runs);
    const wasm_average = calculate_average(wasm_runs);
    const max_value = Math.max(js_average, wasm_average, 1);

    ui_context.result_fields.js_average.textContent = format_milliseconds(js_average);
    ui_context.result_fields.wasm_average.textContent = format_milliseconds(wasm_average);
    render_detail_items(ui_context.result_fields.js_details, [
      `Расстояние: ${format_distance(js_result.distance)}`,
      `Посещено вершин: ${format_integer(js_result.visited_count)}`
    ]);
    render_detail_items(ui_context.result_fields.wasm_details, [
      `Передача: ${format_milliseconds(wasm_result.timings.transfer)}`,
      `Расчёт: ${format_milliseconds(wasm_result.timings.compute)}`,
      `Расстояние: ${format_distance(wasm_result.distance)}`,
      `Посещено вершин: ${format_integer(wasm_result.visited_count)}`
    ]);
    /* PATH_RECONSTRUCTION_DISABLED
    render_detail_items(ui_context.result_fields.js_details, [
      `Расстояние: ${format_distance(js_result.distance)}`,
      `Длина пути: ${format_integer(js_result.path_length)}`,
      `Посещено вершин: ${format_integer(js_result.visited_count)}`
    ]);
    render_detail_items(ui_context.result_fields.wasm_details, [
      `Передача: ${format_milliseconds(wasm_result.timings.transfer)}`,
      `Расчёт: ${format_milliseconds(wasm_result.timings.compute)}`,
      `Расстояние: ${format_distance(wasm_result.distance)}`,
      `Длина пути: ${format_integer(wasm_result.path_length)}`,
      `Посещено вершин: ${format_integer(wasm_result.visited_count)}`
    ]);
    PATH_RECONSTRUCTION_DISABLED */
    ui_context.result_fields.js_bar.style.width = `${(js_average / max_value) * 100}%`;
    ui_context.result_fields.wasm_bar.style.width = `${(wasm_average / max_value) * 100}%`;
  }

  async function benchmark_implementation(label, runner, graph) {
    const start_time = performance.now();
    const result = await runner(graph);
    const elapsed = performance.now() - start_time;
    console.log(`${label}: ${format_milliseconds(elapsed)}`);
    return { elapsed, result };
  }

  const run_benchmark = async (event) => {
    event.preventDefault();

    if (!is_wasm_ready) {
      console.error("WASM IS NOT LOADED")
      return;
    }

    const config = ui_context.read_configuration();
    ui_context.set_running_state(true);
    ui_context.reset_result_bars();

    try {
      const generation_started = performance.now();
      const graph = generate_road_graph(config);
      const generation_time = performance.now() - generation_started;

      console.info("GENERATION TIME: ", generation_time)

      ui_context.render_dataset(graph, generation_time);

      console.log(`Сгенерирован граф: ${format_integer(graph.node_count)} вершин, ${format_integer(graph.undirected_edge_count)} дорог.`);
      console.log(`Маршрут: ${graph.start} -> ${graph.target}.`);

      shortest_path_js(graph.node_count, graph.from, graph.to, graph.weights, graph.start, graph.target);
      shortest_path_wasm(graph.node_count, graph.from, graph.to, graph.weights, graph.start, graph.target);

      const js_runs = [];
      const wasm_runs = [];
      const js_timing_runs = [];
      const wasm_timing_runs = [];
      let js_result = null;
      let wasm_result = null;

      for (let run_index = 0; run_index < config.runs; run_index += 1) {
        const js_runner = (current_graph) =>
          Promise.resolve(
            shortest_path_js(
              current_graph.node_count,
              current_graph.from,
              current_graph.to,
              current_graph.weights,
              current_graph.start,
              current_graph.target
            )
          );
        const wasm_runner = (current_graph) =>
          Promise.resolve(
            shortest_path_wasm(
              current_graph.node_count,
              current_graph.from,
              current_graph.to,
              current_graph.weights,
              current_graph.start,
              current_graph.target
            )
          );

        const first = run_index % 2 === 0 ? ["JS", js_runner] : ["WASM", wasm_runner];
        const second = run_index % 2 === 0 ? ["WASM", wasm_runner] : ["JS", js_runner];

        const first_measurement = await benchmark_implementation(first[0], first[1], graph);
        const second_measurement = await benchmark_implementation(second[0], second[1], graph);

        if (first[0] === "JS") {
          js_runs.push(first_measurement.elapsed);
          js_result = first_measurement.result;
          js_timing_runs.push(first_measurement.result.timings);

          wasm_runs.push(second_measurement.elapsed);
          wasm_result = second_measurement.result;
          wasm_timing_runs.push(second_measurement.result.timings);
        } else {
          js_runs.push(second_measurement.elapsed);
          js_result = second_measurement.result;
          js_timing_runs.push(second_measurement.result.timings);

          wasm_runs.push(first_measurement.elapsed);
          wasm_result = first_measurement.result;
          wasm_timing_runs.push(first_measurement.result.timings);
        }

        validate_results(js_result, wasm_result);
      }

      js_result.timings = {
        build: calculate_average(js_timing_runs.map((timing) => timing.build)),
        compute: calculate_average(js_timing_runs.map((timing) => timing.compute))
      };
      wasm_result.timings = {
        transfer: calculate_average(wasm_timing_runs.map((timing) => timing.transfer)),
        compute: calculate_average(wasm_timing_runs.map((timing) => timing.compute))
      };

      render_results(js_runs, wasm_runs, js_result, wasm_result);
    } catch (error) {
      console.error(error);
    } finally {
      ui_context.set_running_state(false);
    }
  }

  const initialize_wasm = async () => {
    try {
      await init_wasm();
      is_wasm_ready = true;
      console.log("WASM-модуль загружен.");
    } catch (error) {
      console.error(error);
    }
  }

  ui_context.form.addEventListener("submit", run_benchmark);

  ui_context.controls.preset_button.addEventListener("click", () => {
    ui_context.write_configuration({
      node_count: 50000,
      average_degree: 8,
      runs: 3,
      seed: 20260501
    });
  });

  initialize_wasm();
})()
