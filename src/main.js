import "./style.css";
import { generateRoadGraph, shortestPathJs } from "./graph.js";
import initWasm, { shortest_path_wasm } from "./wasm/path_finder_wasm.js";

const form = document.querySelector("#benchmark-form");
const runButton = document.querySelector("#run-button");
const presetButton = document.querySelector("#preset-button");
const statusText = document.querySelector("#status-text");
const routeText = document.querySelector("#route-text");
const logList = document.querySelector("#log-list");
const summaryText = document.querySelector("#summary-text");

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

let wasmReady = false;

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

function renderDetailItems(container, items) {
  container.replaceChildren();

  for (const item of items) {
    const element = document.createElement("span");
    element.textContent = item;
    container.appendChild(element);
  }
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

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
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
  renderDetailItems(resultFields.jsDetails, [
    `Расстояние: ${formatDistance(jsResult.distance)}`,
    `Длина пути: ${formatInteger(jsResult.pathLength)}`,
    `Посещено вершин: ${formatInteger(jsResult.visitedCount)}`
  ]);
  renderDetailItems(resultFields.wasmDetails, [
    `Расстояние: ${formatDistance(wasmResult.distance)}`,
    `Длина пути: ${formatInteger(wasmResult.path_length)}`,
    `Посещено вершин: ${formatInteger(wasmResult.visited_count)}`
  ]);
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

async function benchmarkImplementation(label, runner, graph) {
  const startTime = performance.now();
  const result = await runner(graph);
  const elapsed = performance.now() - startTime;
  addLog(`${label}: ${formatMilliseconds(elapsed)}`);
  return { elapsed, result };
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

  try {
    setStatus("Генерация графа...");
    await nextFrame();

    const generationStarted = performance.now();
    const graph = generateRoadGraph(config);
    const generationTime = performance.now() - generationStarted;

    renderDataset(graph, generationTime);
    addLog(`Сгенерирован граф: ${formatInteger(graph.nodeCount)} вершин, ${formatInteger(graph.undirectedEdgeCount)} дорог.`);
    addLog(`Маршрут: ${graph.start} -> ${graph.target}.`);

    setStatus("Прогрев реализаций...");
    await nextFrame();

    shortestPathJs(graph.nodeCount, graph.from, graph.to, graph.weights, graph.start, graph.target, graph.csr);
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
            currentGraph.target,
            currentGraph.csr
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

initializeWasm();
