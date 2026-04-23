import "./style.css";
import { generateRoadGraph, shortestPathJs } from "./graph.js";
import initWasm, { load_graph_wasm, shortest_path_wasm } from "./wasm/path_finder_wasm.js";

const form = document.querySelector("#benchmark-form");
const runButton = document.querySelector("#run-button");
const presetButton = document.querySelector("#preset-button");
const statusText = document.querySelector("#status-text");
const logList = document.querySelector("#log-list");
const summaryText = document.querySelector("#summary-text");

const datasetFields = {
  nodes: document.querySelector("#nodes-stat"),
  edges: document.querySelector("#edges-stat"),
  directed: document.querySelector("#directed-stat"),
  start: document.querySelector("#start-stat"),
  target: document.querySelector("#target-stat"),
  generation: document.querySelector("#generation-stat")
};

const resultFields = {
  jsAverage: document.querySelector("#js-avg"),
  wasmAverage: document.querySelector("#wasm-avg"),
  jsDetails: document.querySelector("#js-details"),
  wasmDetails: document.querySelector("#wasm-details")
};

let wasmReady = false;

function setStatus(text) {
  statusText.textContent = text;
}

function addLog(message) {
  const item = document.createElement("li");
  item.textContent = message;
  logList.prepend(item);

  while (logList.children.length > 12) {
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
  return value === null || !Number.isFinite(value) ? "пути нет" : value.toFixed(2);
}

function readConfiguration() {
  const formData = new FormData(form);

  return {
    nodeCount: Math.max(10000, Math.min(100000, Math.trunc(Number(formData.get("nodeCount"))))),
    averageDegree: Math.max(2, Math.min(20, Math.trunc(Number(formData.get("averageDegree"))))),
    runs: Math.max(1, Math.min(10, Math.trunc(Number(formData.get("runs"))))),
    seed: Math.max(1, Math.min(4294967295, Math.trunc(Number(formData.get("seed")))))
  };
}

function writeConfiguration(config) {
  form.nodeCount.value = String(config.nodeCount);
  form.averageDegree.value = String(config.averageDegree);
  form.runs.value = String(config.runs);
  form.seed.value = String(config.seed);
}

function renderDataset(graph, generationTime) {
  datasetFields.nodes.textContent = formatInteger(graph.nodeCount);
  datasetFields.edges.textContent = formatInteger(graph.undirectedEdgeCount);
  datasetFields.directed.textContent = formatInteger(graph.directedEdgeCount);
  datasetFields.start.textContent = formatInteger(graph.start);
  datasetFields.target.textContent = formatInteger(graph.target);
  datasetFields.generation.textContent = formatMilliseconds(generationTime);
}

function calculateAverage(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    throw new Error("JS и WASM вычислили разную длину пути.");
  }

  if (jsResult.visitedCount !== wasmResult.visited_count) {
    throw new Error("JS и WASM посетили разное число вершин.");
  }
}

function renderResults(jsRuns, wasmRuns, jsResult, wasmResult) {
  const jsAverage = calculateAverage(jsRuns);
  const wasmAverage = calculateAverage(wasmRuns);
  const speedup = jsAverage / wasmAverage;

  resultFields.jsAverage.textContent = formatMilliseconds(jsAverage);
  resultFields.wasmAverage.textContent = formatMilliseconds(wasmAverage);
  resultFields.jsDetails.textContent =
    `Расстояние: ${formatDistance(jsResult.distance)}. Длина пути: ${formatInteger(jsResult.pathLength)}. Посещено вершин: ${formatInteger(jsResult.visitedCount)}.`;
  resultFields.wasmDetails.textContent =
    `Расстояние: ${formatDistance(wasmResult.distance)}. Длина пути: ${formatInteger(wasmResult.path_length)}. Посещено вершин: ${formatInteger(wasmResult.visited_count)}.`;

  if (speedup > 1) {
    summaryText.textContent = `WASM быстрее JS в ${speedup.toFixed(2)} раза.`;
  } else if (speedup < 1) {
    summaryText.textContent = `JS быстрее WASM в ${(1 / speedup).toFixed(2)} раза.`;
  } else {
    summaryText.textContent = "Среднее время совпало.";
  }
}

function setRunningState(isRunning) {
  runButton.disabled = isRunning;
  presetButton.disabled = isRunning;
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

async function benchmarkImplementation(label, runner) {
  const started = performance.now();
  const result = runner();
  const elapsed = performance.now() - started;
  addLog(`${label}: ${formatMilliseconds(elapsed)}`);
  return { elapsed, result };
}

async function runBenchmark(event) {
  event.preventDefault();

  if (!wasmReady) {
    setStatus("WASM ещё не готов.");
    return;
  }

  const config = readConfiguration();
  setRunningState(true);
  logList.replaceChildren();
  summaryText.textContent = "Выполняется сравнение...";

  try {
    setStatus("Генерация случайного графа...");
    await nextFrame();

    const generationStarted = performance.now();
    const graph = generateRoadGraph(config);
    const generationTime = performance.now() - generationStarted;

    renderDataset(graph, generationTime);
    addLog(
      `Сгенерирован граф: ${formatInteger(graph.nodeCount)} вершин, ${formatInteger(graph.undirectedEdgeCount)} дорог.`
    );

    setStatus("Загрузка графа в память WASM...");
    await nextFrame();

    const loadStarted = performance.now();
    load_graph_wasm(graph.nodeCount, graph.from, graph.to, graph.weights);
    const loadElapsed = performance.now() - loadStarted;
    addLog(`Загрузка графа в WASM: ${formatMilliseconds(loadElapsed)}.`);

    setStatus("Прогрев реализаций...");
    await nextFrame();

    shortestPathJs(graph.nodeCount, graph.from, graph.to, graph.weights, graph.start, graph.target);
    shortest_path_wasm(graph.start, graph.target);

    const jsRuns = [];
    const wasmRuns = [];
    let jsResult = null;
    let wasmResult = null;

    for (let runIndex = 0; runIndex < config.runs; runIndex += 1) {
      setStatus(`Замер ${runIndex + 1} из ${config.runs}...`);
      await nextFrame();

      const firstIsJs = runIndex % 2 === 0;
      const firstMeasurement = await benchmarkImplementation(
        firstIsJs ? "JS" : "WASM",
        () =>
          firstIsJs
            ? shortestPathJs(graph.nodeCount, graph.from, graph.to, graph.weights, graph.start, graph.target)
            : shortest_path_wasm(graph.start, graph.target)
      );
      const secondMeasurement = await benchmarkImplementation(
        firstIsJs ? "WASM" : "JS",
        () =>
          firstIsJs
            ? shortest_path_wasm(graph.start, graph.target)
            : shortestPathJs(graph.nodeCount, graph.from, graph.to, graph.weights, graph.start, graph.target)
      );

      if (firstIsJs) {
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
    setStatus("Сравнение завершено.");
  } catch (error) {
    console.error(error);
    setStatus("Ошибка во время выполнения.");
    summaryText.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setRunningState(false);
  }
}

async function initializeWasm() {
  try {
    await initWasm();
    wasmReady = true;
    setStatus("WebAssembly готов.");
    addLog("WASM-модуль загружен.");
  } catch (error) {
    console.error(error);
    setStatus("Не удалось загрузить WebAssembly.");
    summaryText.textContent = "Выполните `npm run wasm:build`, если сборка WASM отсутствует.";
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

initializeWasm();
