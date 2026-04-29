let wasm_exports = null;
let wasm_initialization = null;

function create_wasi_shim() {
  return {
    wasi_snapshot_preview1: {
      args_get() {
        return 0;
      },
      args_sizes_get() {
        return 0;
      },
      fd_close() {
        return 0;
      },
      fd_seek() {
        return 0;
      },
      fd_write() {
        return 0;
      },
      proc_exit(code) {
        throw new Error(`WASM вызвал proc_exit(${code}).`);
      }
    }
  };
}

function get_memory() {
  if (!wasm_exports) {
    throw new Error("WASM-модуль ещё не инициализирован.");
  }

  return wasm_exports.memory;
}

function normalize_input(input) {
  if (input instanceof URL || typeof input === "string") {
    return fetch(input).then((response) => response.arrayBuffer());
  }

  if (input instanceof Response) {
    return input.arrayBuffer();
  }

  if (input instanceof ArrayBuffer) {
    return Promise.resolve(input);
  }

  if (ArrayBuffer.isView(input)) {
    return Promise.resolve(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  }

  return Promise.reject(new Error("Неподдерживаемый формат входа для инициализации WASM."));
}

function copy_uint32_array(values) {
  const pointer = wasm_exports.alloc_bytes(values.byteLength, Uint32Array.BYTES_PER_ELEMENT);
  new Uint32Array(get_memory().buffer, pointer, values.length).set(values);
  return pointer;
}

function copy_float64_array(values) {
  const pointer = wasm_exports.alloc_bytes(values.byteLength, Float64Array.BYTES_PER_ELEMENT);
  new Float64Array(get_memory().buffer, pointer, values.length).set(values);
  return pointer;
}

function alloc_uint32(count = 1) {
  return wasm_exports.alloc_bytes(count * Uint32Array.BYTES_PER_ELEMENT, Uint32Array.BYTES_PER_ELEMENT);
}

function alloc_float64(count = 1) {
  return wasm_exports.alloc_bytes(count * Float64Array.BYTES_PER_ELEMENT, Float64Array.BYTES_PER_ELEMENT);
}

function map_error_code(error_code) {
  switch (error_code) {
    case 1:
      return "Количество вершин превышает допустимый диапазон.";
    case 2:
      return "Количество рёбер превышает допустимый диапазон.";
    case 3:
      return "Некорректные вершины старта или финиша.";
    case 4:
      return "В массивах рёбер есть вершина вне диапазона.";
    case 5:
      return "Не удалось восстановить путь.";
    default:
      return `WASM вернул неизвестный код ошибки: ${error_code}.`;
  }
}

export default async function init_wasm(input = new URL("./path_finder_wasm.wasm", import.meta.url)) {
  if (wasm_exports) {
    return wasm_exports;
  }

  if (!wasm_initialization) {
    wasm_initialization = normalize_input(input).then(async (bytes) => {
      const { instance } = await WebAssembly.instantiate(bytes, create_wasi_shim());
      wasm_exports = instance.exports;
      return wasm_exports;
    });
  }

  return wasm_initialization;
}

export function shortest_path_wasm(node_count, from, to, weights, start, target) {
  if (!wasm_exports) {
    throw new Error("WASM-модуль ещё не инициализирован.");
  }

  if (from.length !== to.length || to.length !== weights.length) {
    throw new Error("Массивы рёбер должны иметь одинаковую длину.");
  }

  const transfer_started = performance.now();
  wasm_exports.reset_allocator();

  const from_pointer = copy_uint32_array(from);
  const to_pointer = copy_uint32_array(to);
  const weights_pointer = copy_float64_array(weights);
  const found_pointer = alloc_uint32();
  const distance_pointer = alloc_float64();
  const visited_count_pointer = alloc_uint32();
  const path_length_pointer = alloc_uint32();
  const path_pointer = alloc_uint32(node_count);
  const transfer_in_time = performance.now() - transfer_started;

  const compute_started = performance.now();
  const error_code = wasm_exports.run_shortest_path(
    node_count,
    from.length,
    from_pointer,
    to_pointer,
    weights_pointer,
    start,
    target,
    found_pointer,
    distance_pointer,
    visited_count_pointer,
    path_length_pointer,
    path_pointer
  );
  const compute_time = performance.now() - compute_started;

  if (error_code !== 0) {
    throw new Error(map_error_code(error_code));
  }

  const read_started = performance.now();
  const found = Boolean(new Uint32Array(get_memory().buffer, found_pointer, 1)[0]);
  const distance = new Float64Array(get_memory().buffer, distance_pointer, 1)[0];
  const visited_count = new Uint32Array(get_memory().buffer, visited_count_pointer, 1)[0];
  const path_length = new Uint32Array(get_memory().buffer, path_length_pointer, 1)[0];
  const path_nodes = Array.from(new Uint32Array(get_memory().buffer, path_pointer, path_length));
  const read_out_time = performance.now() - read_started;

  return {
    found,
    distance: found ? distance : null,
    path_length,
    path_nodes,
    visited_count,
    timings: {
      transfer: transfer_in_time + read_out_time,
      transfer_in: transfer_in_time,
      compute: compute_time,
      read_out: read_out_time
    }
  };
}
