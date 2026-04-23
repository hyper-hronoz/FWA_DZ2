import "./style.css";
import { generateRoadGraph, shortestPathJs } from "./graph.js";
import initWasm, { prepare_graph_visualization_wasm, shortest_path_wasm } from "./wasm/path_finder_wasm.js";

const form = document.querySelector("#benchmark-form");
const runButton = document.querySelector("#run-button");
const presetButton = document.querySelector("#preset-button");
const statusText = document.querySelector("#status-text");
const routeText = document.querySelector("#route-text");
const logList = document.querySelector("#log-list");
const summaryText = document.querySelector("#summary-text");
const graphCanvas = document.querySelector("#graph-canvas");
const graphPlaceholder = document.querySelector("#graph-placeholder");

const VISUALIZATION_NODE_LIMIT = 180;

const datasetFields = {
  nodes: document.querySelector("#nodes-stat"),
  edges: document.querySelector("#edges-stat"),
  directed: document.querySelector("#directed-stat"),
  generation: document.querySelector("#generation-stat")
};

const resultFields = {
  jsAverage: document.querySelector("#js-avg"),
  wasmAverage: document.querySelector("#wasm-avg"),
  jsDetails: document.querySelector("#js-details"),
  wasmDetails: document.querySelector("#wasm-details"),
  jsBar: document.querySelector("#js-bar"),
  wasmBar: document.querySelector("#wasm-bar")
};

const visualizationFields = {
  nodes: document.querySelector("#viz-nodes-stat"),
  edges: document.querySelector("#viz-edges-stat"),
  layout: document.querySelector("#viz-layout-stat")
};

let wasmReady = false;
let lastVisualization = null;

function setStatus(text) {
  statusText.textContent = text;
}

function addLog(message) {
  const item = document.createElement("li");
  item.textContent = message;
  logList.prepend(item);

  while (logList.children.length > 8) {
    logList.removeChild(logList.lastElementChild);
  }
}

function formatInteger(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatMilliseconds(value) {
  return `${value.toFixed(2)} мс`;
}

function formatDistance(value) {
  if (value === null || !Number.isFinite(value)) {
    return "пути нет";
  }

  return value.toFixed(2);
}

function readConfiguration() {
  const formData = new FormData(form);
  const nodeCount = Number(formData.get("nodeCount"));
  const averageDegree = Number(formData.get("averageDegree"));
  const runs = Number(formData.get("runs"));
  const seed = Number(formData.get("seed"));

  return {
    nodeCount: Math.max(10000, Math.min(100000, Math.trunc(nodeCount))),
    averageDegree: Math.max(2, Math.min(20, Math.trunc(averageDegree))),
    runs: Math.max(1, Math.min(10, Math.trunc(runs))),
    seed: Math.max(1, Math.min(4294967295, Math.trunc(seed)))
  };
}

function writeConfiguration(config) {
  form.nodeCount.value = String(config.nodeCount);
  form.averageDegree.value = String(config.averageDegree);
  form.runs.value = String(config.runs);
  form.seed.value = String(config.seed);
}

function resetResultBars() {
  resultFields.jsBar.style.width = "0%";
  resultFields.wasmBar.style.width = "0%";
}

function clearVisualization(message) {
  const context = graphCanvas.getContext("2d");
  const width = graphCanvas.width;
  const height = graphCanvas.height;

  context.clearRect(0, 0, width, height);
  graphPlaceholder.textContent = message;
  graphPlaceholder.hidden = false;
  visualizationFields.nodes.textContent = "0 вершин";
  visualizationFields.edges.textContent = "0";
  visualizationFields.layout.textContent = "0 мс";
  lastVisualization = null;
}

function renderDataset(graph, generationTime) {
  datasetFields.nodes.textContent = formatInteger(graph.nodeCount);
  datasetFields.edges.textContent = formatInteger(graph.undirectedEdgeCount);
  datasetFields.directed.textContent = formatInteger(graph.directedEdgeCount);
  datasetFields.generation.textContent = formatMilliseconds(generationTime);
  routeText.textContent = `${formatInteger(graph.start)} -> ${formatInteger(graph.target)}`;
}

function calculateAverage(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fitCanvasToDisplaySize() {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const displayWidth = Math.max(320, Math.floor(graphCanvas.clientWidth * devicePixelRatio));
  const displayHeight = Math.max(220, Math.floor(graphCanvas.clientHeight * devicePixelRatio));

  if (graphCanvas.width !== displayWidth || graphCanvas.height !== displayHeight) {
    graphCanvas.width = displayWidth;
    graphCanvas.height = displayHeight;
  }
}

function drawVisualization(visualization) {
  fitCanvasToDisplaySize();

  const context = graphCanvas.getContext("2d");
  const width = graphCanvas.width;
  const height = graphCanvas.height;
  const padding = 30 * (window.devicePixelRatio || 1);

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f7fbff";
  context.fillRect(0, 0, width, height);

  const projectX = (x) => padding + x * (width - padding * 2);
  const projectY = (y) => padding + y * (height - padding * 2);

  context.lineWidth = Math.max(1, 1.25 * (window.devicePixelRatio || 1));
  context.strokeStyle = "rgba(77, 101, 124, 0.23)";
  context.beginPath();
  for (let edgeIndex = 0; edgeIndex < visualization.edge_from.length; edgeIndex += 1) {
    const source = visualization.edge_from[edgeIndex];
    const target = visualization.edge_to[edgeIndex];
    context.moveTo(projectX(visualization.x[source]), projectY(visualization.y[source]));
    context.lineTo(projectX(visualization.x[target]), projectY(visualization.y[target]));
  }
  context.stroke();

  if (visualization.path_indices.length > 1) {
    context.save();
    context.lineWidth = Math.max(3, 3.4 * (window.devicePixelRatio || 1));
    context.strokeStyle = "#ff7a00";
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();

    const firstPathNode = visualization.path_indices[0];
    context.moveTo(projectX(visualization.x[firstPathNode]), projectY(visualization.y[firstPathNode]));

    for (let pathIndex = 1; pathIndex < visualization.path_indices.length; pathIndex += 1) {
      const nodeIndex = visualization.path_indices[pathIndex];
      context.lineTo(projectX(visualization.x[nodeIndex]), projectY(visualization.y[nodeIndex]));
    }

    context.stroke();
    context.restore();
  }

  const radius = Math.max(3, 3.2 * (window.devicePixelRatio || 1));
  for (let nodeIndex = 0; nodeIndex < visualization.node_ids.length; nodeIndex += 1) {
    const x = projectX(visualization.x[nodeIndex]);
    const y = projectY(visualization.y[nodeIndex]);

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);

    if (nodeIndex === visualization.start_index) {
      context.fillStyle = "#ef6c00";
    } else if (nodeIndex === visualization.target_index) {
      context.fillStyle = "#0059ff";
    } else if (visualization.path_index_set[nodeIndex]) {
      context.fillStyle = "#ff7a00";
    } else {
      context.fillStyle = "#17354c";
    }

    context.fill();
  }

  const labelFontSize = Math.max(12, 12 * (window.devicePixelRatio || 1));
  context.font = `${labelFontSize}px "IBM Plex Sans", sans-serif`;
  context.textBaseline = "bottom";

  const startX = projectX(visualization.x[visualization.start_index]);
  const startY = projectY(visualization.y[visualization.start_index]);
  const targetX = projectX(visualization.x[visualization.target_index]);
  const targetY = projectY(visualization.y[visualization.target_index]);

  context.fillStyle = "#9a4f0f";
  context.fillText(`start: ${visualization.node_ids[visualization.start_index]}`, startX + radius * 1.8, startY - radius * 1.6);

  context.fillStyle = "#0048cf";
  context.fillText(`target: ${visualization.node_ids[visualization.target_index]}`, targetX + radius * 1.8, targetY - radius * 1.6);
}

function renderVisualization(visualization, layoutTime) {
  graphPlaceholder.hidden = true;
  visualizationFields.nodes.textContent = `${formatInteger(visualization.node_ids.length)} вершин`;
  visualizationFields.edges.textContent = formatInteger(visualization.edge_from.length);
  visualizationFields.layout.textContent = formatMilliseconds(layoutTime);
  lastVisualization = visualization;
  drawVisualization(visualization);
}

function approximatelyEqual(left, right) {
  if (left === right) {
    return true;
  }

  if (left === null || right === null) {
    return false;
  }

  return Math.abs(left - right) < 1e-9;
}

function validateResults(jsResult, wasmResult) {
  if (jsResult.found !== wasmResult.found) {
    throw new Error("JS и WASM вернули разные признаки существования пути.");
  }

  if (!approximatelyEqual(jsResult.distance, wasmResult.distance)) {
    throw new Error("JS и WASM вычислили разные расстояния.");
  }

  if (jsResult.pathLength !== wasmResult.path_length) {
    throw new Error("JS и WASM вычислили разные длины маршрута.");
  }

  if (jsResult.visitedCount !== wasmResult.visited_count) {
    throw new Error("JS и WASM посетили разное количество вершин.");
  }

  if (jsResult.pathNodes.length !== wasmResult.path_nodes.length) {
    throw new Error("JS и WASM построили пути разной длины.");
  }

  for (let index = 0; index < jsResult.pathNodes.length; index += 1) {
    if (jsResult.pathNodes[index] !== wasmResult.path_nodes[index]) {
      throw new Error("JS и WASM построили разные кратчайшие пути.");
    }
  }
}

function renderResults(jsRuns, wasmRuns, jsResult, wasmResult) {
  const jsAverage = calculateAverage(jsRuns);
  const wasmAverage = calculateAverage(wasmRuns);
  const maxValue = Math.max(jsAverage, wasmAverage, 1);
  const speedup = jsAverage / wasmAverage;

  resultFields.jsAverage.textContent = formatMilliseconds(jsAverage);
  resultFields.wasmAverage.textContent = formatMilliseconds(wasmAverage);
  resultFields.jsDetails.textContent =
    `Расстояние: ${formatDistance(jsResult.distance)} • Длина пути: ${formatInteger(jsResult.pathLength)} • Посещено вершин: ${formatInteger(jsResult.visitedCount)}`;
  resultFields.wasmDetails.textContent =
    `Расстояние: ${formatDistance(wasmResult.distance)} • Длина пути: ${formatInteger(wasmResult.path_length)} • Посещено вершин: ${formatInteger(wasmResult.visited_count)}`;
  resultFields.jsBar.style.width = `${(jsAverage / maxValue) * 100}%`;
  resultFields.wasmBar.style.width = `${(wasmAverage / maxValue) * 100}%`;

  if (speedup > 1) {
    summaryText.textContent = `WASM быстрее JavaScript в ${speedup.toFixed(2)} раза(раз).`;
  } else if (speedup < 1) {
    summaryText.textContent = `JavaScript быстрее WASM в ${(1 / speedup).toFixed(2)} раза(раз).`;
  } else {
    summaryText.textContent = "Среднее время выполнения оказалось одинаковым.";
  }
}

function setRunningState(isRunning) {
  runButton.disabled = isRunning;
  presetButton.disabled = isRunning;
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function benchmarkImplementation(label, runner, graph) {
  const startTime = performance.now();
  const result = await runner(graph);
  const elapsed = performance.now() - startTime;
  addLog(`${label}: ${formatMilliseconds(elapsed)}`);
  return { elapsed, result };
}

async function buildVisualization(graph) {
  setStatus("Подготовка визуализации в WASM...");
  await nextFrame();

  const started = performance.now();
  const visualization = prepare_graph_visualization_wasm(
    graph.nodeCount,
    graph.from,
    graph.to,
    graph.start,
    graph.target,
    graph.pathNodes,
    VISUALIZATION_NODE_LIMIT
  );
  const elapsed = performance.now() - started;

  visualization.path_index_set = new Uint8Array(visualization.node_ids.length);
  for (let index = 0; index < visualization.path_indices.length; index += 1) {
    visualization.path_index_set[visualization.path_indices[index]] = 1;
  }

  renderVisualization(visualization, elapsed);
  addLog(
    `Визуализация: ${formatInteger(visualization.node_ids.length)} вершин, ${formatInteger(visualization.edge_from.length)} рёбер, layout ${formatMilliseconds(elapsed)}.`
  );
}

async function runBenchmark(event) {
  event.preventDefault();

  if (!wasmReady) {
    setStatus("WASM ещё не инициализирован.");
    return;
  }

  const config = readConfiguration();
  setRunningState(true);
  resetResultBars();
  summaryText.textContent = "Выполняется эксперимент...";
  logList.replaceChildren();
  clearVisualization("Строим визуализацию после завершения замеров...");

  try {
    setStatus("Генерация графа...");
    await nextFrame();

    const generationStarted = performance.now();
    const graph = generateRoadGraph(config);
    const generationTime = performance.now() - generationStarted;

    renderDataset(graph, generationTime);
    addLog(
      `Сгенерирован граф: ${formatInteger(graph.nodeCount)} вершин, ${formatInteger(graph.undirectedEdgeCount)} дорог.`
    );
    addLog(`Маршрут: ${graph.start} -> ${graph.target}.`);

    setStatus("Прогрев реализаций...");
    await nextFrame();

    shortestPathJs(graph.nodeCount, graph.from, graph.to, graph.weights, graph.start, graph.target);
    shortest_path_wasm(graph.nodeCount, graph.from, graph.to, graph.weights, graph.start, graph.target);

    const jsRuns = [];
    const wasmRuns = [];
    let jsResult = null;
    let wasmResult = null;

    for (let runIndex = 0; runIndex < config.runs; runIndex += 1) {
      setStatus(`Замер ${runIndex + 1} из ${config.runs}...`);
      await nextFrame();

      const jsRunner = (currentGraph) =>
        Promise.resolve(
          shortestPathJs(
            currentGraph.nodeCount,
            currentGraph.from,
            currentGraph.to,
            currentGraph.weights,
            currentGraph.start,
            currentGraph.target
          )
        );
      const wasmRunner = (currentGraph) =>
        Promise.resolve(
          shortest_path_wasm(
            currentGraph.nodeCount,
            currentGraph.from,
            currentGraph.to,
            currentGraph.weights,
            currentGraph.start,
            currentGraph.target
          )
        );

      const first = runIndex % 2 === 0 ? ["JS", jsRunner] : ["WASM", wasmRunner];
      const second = runIndex % 2 === 0 ? ["WASM", wasmRunner] : ["JS", jsRunner];

      const firstMeasurement = await benchmarkImplementation(first[0], first[1], graph);
      const secondMeasurement = await benchmarkImplementation(second[0], second[1], graph);

      if (first[0] === "JS") {
        jsRuns.push(firstMeasurement.elapsed);
        wasmRuns.push(secondMeasurement.elapsed);
        jsResult = firstMeasurement.result;
        wasmResult = secondMeasurement.result;
      } else {
        wasmRuns.push(firstMeasurement.elapsed);
        jsRuns.push(secondMeasurement.elapsed);
        wasmResult = firstMeasurement.result;
        jsResult = secondMeasurement.result;
      }

      validateResults(jsResult, wasmResult);
    }

    renderResults(jsRuns, wasmRuns, jsResult, wasmResult);
    graph.pathNodes = jsResult.pathNodes;
    await buildVisualization(graph);
    setStatus("Эксперимент завершён.");
  } catch (error) {
    console.error(error);
    setStatus("Ошибка во время эксперимента.");
    summaryText.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setRunningState(false);
  }
}

async function initializeWasm() {
  try {
    await initWasm();
    wasmReady = true;
    setStatus("WebAssembly готов к запуску.");
    addLog("WASM-модуль загружен.");
    clearVisualization("Запустите эксперимент, чтобы построить визуализацию подграфа.");
  } catch (error) {
    console.error(error);
    setStatus("Не удалось инициализировать WebAssembly.");
    summaryText.textContent = "Сборка WASM отсутствует или не загрузилась. Выполните `npm run wasm:build`.";
  }
}

form.addEventListener("submit", runBenchmark);
presetButton.addEventListener("click", () => {
  writeConfiguration({
    nodeCount: 50000,
    averageDegree: 8,
    runs: 3,
    seed: 20260501
  });
});

window.addEventListener("resize", () => {
  if (lastVisualization) {
    drawVisualization(lastVisualization);
  }
});

initializeWasm();
