# Домашняя работа №2

Минимальное браузерное приложение для сравнения двух реализаций поиска кратчайшего пути в графе дорог:

- `JavaScript`
- `Rust`, скомпилированный в `WebAssembly`

В обеих реализациях используется алгоритм Дейкстры для взвешенного связного графа с неотрицательными весами.

## Что делает приложение

1. Генерирует большой случайный граф дорог.
2. Выбирает случайные вершины старта и финиша.
3. Решает задачу на `JS` и на `WASM`.
4. Несколько раз измеряет время через `performance.now()`.
5. Проверяет, что результаты двух реализаций совпадают.
6. Показывает среднее время выполнения.

Визуализации нет: проект специально оставлен в минимальном виде под формулировку задания.

## Запуск

Требования:

- `Node.js`
- `Rust`
- `cargo`

Команды:

```bash
npm install
npm run dev
```

При `dev` и `build` автоматически собирается `WASM`.

## Production

```bash
npm run build
npm run preview
```

## Параметры эксперимента

- `Количество вершин`: от `10 000`
- `Средняя степень`: плотность графа
- `Количество запусков`: число повторов для усреднения
- `Seed`: воспроизводимый случайный граф

## Структура проекта

- [index.html](/home/hronoz/Desktop/BMSTU_FWA/FWA_DZ_2/index.html)
- [src/main.js](/home/hronoz/Desktop/BMSTU_FWA/FWA_DZ_2/src/main.js)
- [src/graph.js](/home/hronoz/Desktop/BMSTU_FWA/FWA_DZ_2/src/graph.js)
- [src/style.css](/home/hronoz/Desktop/BMSTU_FWA/FWA_DZ_2/src/style.css)
- [rust-wasm/src/lib.rs](/home/hronoz/Desktop/BMSTU_FWA/FWA_DZ_2/rust-wasm/src/lib.rs)
- [rust-wasm/src/pathfinding.rs](/home/hronoz/Desktop/BMSTU_FWA/FWA_DZ_2/rust-wasm/src/pathfinding.rs)
- [scripts/build-wasm.sh](/home/hronoz/Desktop/BMSTU_FWA/FWA_DZ_2/scripts/build-wasm.sh)
