const MAX_DIM = 16;

const state = {
  m: 4,
  n: 4,
  o: 4,
  tile: 2,
  mode: "sequential",
  detail: "tile",
  speedMs: 420,
  A: [],
  B: [],
  C: [],
  steps: [],
  stepIndex: 0,
  currentStep: null,
  timerId: null,
  playing: false,
  dirty: true,
  inspectTile: "0,0",
  focusCell: "0,0",
  invalidCells: new Set(),
  highlight: emptyHighlight()
};

const els = {
  mInput: document.getElementById("mInput"),
  nInput: document.getElementById("nInput"),
  oInput: document.getElementById("oInput"),
  tileInput: document.getElementById("tileInput"),
  modeSelect: document.getElementById("modeSelect"),
  detailSelect: document.getElementById("detailSelect"),
  speedInput: document.getElementById("speedInput"),
  speedLabel: document.getElementById("speedLabel"),
  inspectTileSelect: document.getElementById("inspectTileSelect"),
  resizeBtn: document.getElementById("resizeBtn"),
  defaultsBtn: document.getElementById("defaultsBtn"),
  randomBtn: document.getElementById("randomBtn"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  prevBtn: document.getElementById("prevBtn"),
  stepBtn: document.getElementById("stepBtn"),
  resetBtn: document.getElementById("resetBtn"),
  stepProgress: document.getElementById("stepProgress"),
  progressLabel: document.getElementById("progressLabel"),
  aContainer: document.getElementById("aContainer"),
  bContainer: document.getElementById("bContainer"),
  cContainer: document.getElementById("cContainer"),
  cCard: document.getElementById("cCard"),
  resultBadge: document.getElementById("resultBadge"),
  sharedAContainer: document.getElementById("sharedAContainer"),
  sharedBContainer: document.getElementById("sharedBContainer"),
  sharedMeta: document.getElementById("sharedMeta"),
  equationPanel: document.getElementById("equationPanel"),
  status: document.getElementById("status")
};

function emptyHighlight() {
  return {
    a: new Set(),
    b: new Set(),
    c: new Set(),
    updated: new Set(),
    inspectedA: new Set(),
    inspectedB: new Set(),
    inspectedC: new Set()
  };
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function keyOf(row, col) {
  return row + "," + col;
}

function makeMatrix(rows, cols, filler) {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) =>
      typeof filler === "function" ? filler(row, col) : 0
    )
  );
}

function resizeMatrix(oldMatrix, newRows, newCols, filler) {
  const oldRows = oldMatrix.length;
  const oldCols = oldRows ? oldMatrix[0].length : 0;
  return makeMatrix(newRows, newCols, (row, col) => {
    if (row < oldRows && col < oldCols) return oldMatrix[row][col];
    return filler(row, col);
  });
}

function defaultAValue(row, col) {
  return ((row + col * 2) % 7) - 3;
}

function defaultBValue(row, col) {
  return ((row * 3 + col) % 9) - 4;
}

function formatNumber(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "NaN";
  if (numeric === Infinity) return "Infinity";
  if (numeric === -Infinity) return "-Infinity";
  if (Object.is(numeric, -0) || numeric === 0) return "0";
  if (Number.isSafeInteger(numeric)) return String(numeric);
  return String(Number(numeric.toPrecision(10)));
}

function setStatus(message, isError) {
  els.status.textContent = message || "";
  els.status.classList.toggle("error", Boolean(isError));
}

function setResultState(kind) {
  const labels = {
    empty: "Not computed",
    stale: "Out of date",
    ready: "Ready",
    computing: "Partial result",
    complete: "Complete"
  };

  els.resultBadge.textContent = labels[kind] || labels.empty;
  els.resultBadge.className = "result-badge";
  els.cCard.classList.remove("stale");

  if (kind === "stale") {
    els.resultBadge.classList.add("stale");
    els.cCard.classList.add("stale");
  } else if (kind === "complete") {
    els.resultBadge.classList.add("complete");
  }
}

function stopPlayback() {
  if (state.timerId !== null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }
  state.playing = false;
}

function markDirty(note) {
  state.dirty = true;
  stopPlayback();
  setResultState("stale");
  if (note) setStatus(note, false);
  updateButtons();
}

function resetProgress(clearSteps) {
  stopPlayback();
  state.C = makeMatrix(state.m, state.o, () => 0);
  state.stepIndex = 0;
  state.currentStep = null;
  state.highlight = emptyHighlight();
  state.invalidCells.clear();
  if (clearSteps) state.steps = [];
  setResultState(state.dirty ? "stale" : state.steps.length ? "ready" : "empty");
  renderAll();
  updateProgress();
  updateButtons();
}

function setDimensions(m, n, o, preserve) {
  const nextM = clamp(m, 1, MAX_DIM);
  const nextN = clamp(n, 1, MAX_DIM);
  const nextO = clamp(o, 1, MAX_DIM);

  if (preserve) {
    state.A = resizeMatrix(state.A, nextM, nextN, defaultAValue);
    state.B = resizeMatrix(state.B, nextN, nextO, defaultBValue);
  } else {
    state.A = makeMatrix(nextM, nextN, defaultAValue);
    state.B = makeMatrix(nextN, nextO, defaultBValue);
  }

  state.m = nextM;
  state.n = nextN;
  state.o = nextO;
  state.tile = clamp(els.tileInput.value, 1, MAX_DIM);

  const focusParts = state.focusCell.split(",");
  state.focusCell = keyOf(
    clamp(focusParts[0], 0, nextM - 1),
    clamp(focusParts[1], 0, nextO - 1)
  );

  els.mInput.value = String(nextM);
  els.nInput.value = String(nextN);
  els.oInput.value = String(nextO);
  els.tileInput.value = String(state.tile);

  state.dirty = true;
  rebuildInspectTiles();
  resetProgress(true);
  markDirty("Dimensions updated. Start or use Next Step to regenerate the simulation.");
}

function renderMatrix(container, matrix, options) {
  const table = document.createElement("table");
  table.className = "matrix";

  const caption = document.createElement("caption");
  caption.textContent = options.caption || "Matrix";
  table.appendChild(caption);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.scope = "col";
  corner.textContent = "#";
  headerRow.appendChild(corner);
  const colOffset = options.colOffset || 0;
  const rowOffset = options.rowOffset || 0;

  const columnCount = matrix.length ? matrix[0].length : 0;
  for (let col = 0; col < columnCount; col += 1) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = "c" + (col + colOffset);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let row = 0; row < matrix.length; row += 1) {
    const tr = document.createElement("tr");
    const rowHeader = document.createElement("th");
    rowHeader.scope = "row";
    rowHeader.textContent = "r" + (row + rowOffset);
    tr.appendChild(rowHeader);

    for (let col = 0; col < matrix[row].length; col += 1) {
      const td = document.createElement("td");
      const className = options.cellClass ? options.cellClass(row, col) : "";
      if (className) td.className = className;

      const globalRow = row + rowOffset;
      const globalCol = col + colOffset;
      const cellLabel = (options.caption || "Matrix") +
        ", row " + globalRow + ", column " + globalCol;

      if (options.editable) {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = String(matrix[row][col]);
        input.setAttribute("aria-label", cellLabel);
        const validationKey = options.matrixKey + ":" + keyOf(row, col);

        input.addEventListener("input", () => {
          const raw = input.value.trim();
          const value = Number(raw);
          if (raw === "" || !Number.isFinite(value)) {
            state.invalidCells.add(validationKey);
            input.setAttribute("aria-invalid", "true");
            markDirty("Enter a finite number in every matrix cell before computing.");
            setStatus("Invalid value at " + cellLabel + ". Enter a finite number.", true);
            return;
          }

          state.invalidCells.delete(validationKey);
          input.removeAttribute("aria-invalid");
          matrix[row][col] = value;
          markDirty("Matrix values changed. Start or use Next Step to regenerate the simulation.");
        });
        td.appendChild(input);
      } else {
        td.textContent = formatNumber(matrix[row][col]);
        td.title = String(matrix[row][col]);
        td.setAttribute("aria-label", cellLabel + ", value " + formatNumber(matrix[row][col]));

        if (options.onCellSelect) {
          td.classList.add("selectable");
          td.tabIndex = 0;
          td.setAttribute("role", "button");
          td.setAttribute("aria-label", td.getAttribute("aria-label") + ". Select to inspect.");
          const selectCell = () => options.onCellSelect(row, col);
          td.addEventListener("click", selectCell);
          td.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectCell();
            }
          });
        }
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.replaceChildren(table);
}

function tileBorderClasses(row, col, rows, cols) {
  const classes = [];
  if ((col + 1) % state.tile === 0 && col < cols - 1) classes.push("tile-edge-right");
  if ((row + 1) % state.tile === 0 && row < rows - 1) classes.push("tile-edge-bottom");
  return classes;
}

function highlightedCellClasses(kind, row, col, rows, cols) {
  const cellKey = keyOf(row, col);
  const classes = tileBorderClasses(row, col, rows, cols);
  if (state.highlight[kind].has(cellKey)) classes.push("active-" + kind);
  if (kind === "c" && state.highlight.updated.has(cellKey)) classes.push("updated");

  const inspectedKey = kind === "a" ? "inspectedA" : kind === "b" ? "inspectedB" : "inspectedC";
  if (state.highlight[inspectedKey].has(cellKey)) classes.push("inspected");
  if (kind === "c" && state.focusCell === cellKey) classes.push("selected");
  return classes.join(" ");
}

function renderAll() {
  renderMatrix(els.aContainer, state.A, {
    editable: true,
    caption: "Matrix A",
    matrixKey: "A",
    cellClass: (row, col) => highlightedCellClasses("a", row, col, state.m, state.n)
  });

  renderMatrix(els.bContainer, state.B, {
    editable: true,
    caption: "Matrix B",
    matrixKey: "B",
    cellClass: (row, col) => highlightedCellClasses("b", row, col, state.n, state.o)
  });

  renderMatrix(els.cContainer, state.C, {
    editable: false,
    caption: "Matrix C",
    cellClass: (row, col) => highlightedCellClasses("c", row, col, state.m, state.o),
    onCellSelect: (row, col) => {
      state.focusCell = keyOf(row, col);
      if (state.mode === "parallel") {
        state.inspectTile = keyOf(Math.floor(row / state.tile), Math.floor(col / state.tile));
        els.inspectTileSelect.value = state.inspectTile;
        state.highlight = computeHighlights(state.currentStep);
      }
      renderAll();
    }
  });

  renderSharedTiles();
}

function tileBounds(index, tileSize, limit) {
  const start = index * tileSize;
  return { start, end: Math.min(start + tileSize, limit) };
}

function makePaddedTile(matrix, rowStart, colStart, tileSize, rowLimit, colLimit) {
  return makeMatrix(tileSize, tileSize, (localRow, localCol) => {
    const row = rowStart + localRow;
    const col = colStart + localCol;
    return row < rowLimit && col < colLimit ? matrix[row][col] : 0;
  });
}

function tileDescriptor(tileRow, tileCol) {
  return "Tile (" + tileRow + ", " + tileCol + ")";
}

function rebuildInspectTiles() {
  const tileSize = clamp(els.tileInput.value, 1, MAX_DIM);
  const tileRows = Math.ceil(state.m / tileSize);
  const tileCols = Math.ceil(state.o / tileSize);
  const previous = state.inspectTile;

  els.inspectTileSelect.replaceChildren();
  for (let tileRow = 0; tileRow < tileRows; tileRow += 1) {
    for (let tileCol = 0; tileCol < tileCols; tileCol += 1) {
      const option = document.createElement("option");
      option.value = keyOf(tileRow, tileCol);
      option.textContent = tileDescriptor(tileRow, tileCol);
      els.inspectTileSelect.appendChild(option);
    }
  }

  if (!els.inspectTileSelect.options.length) {
    state.inspectTile = "0,0";
    return;
  }

  const found = Array.from(els.inspectTileSelect.options).some((option) => option.value === previous);
  state.inspectTile = found ? previous : els.inspectTileSelect.options[0].value;
  els.inspectTileSelect.value = state.inspectTile;
  els.inspectTileSelect.disabled = state.mode !== "parallel";
}

function renderSharedTiles() {
  const step = state.currentStep;
  if (!step) {
    els.sharedAContainer.textContent = "-";
    els.sharedBContainer.textContent = "-";
    els.sharedMeta.textContent = "No active step yet. Click Start or Next Step.";
    renderEquation();
    return;
  }

  const tileSize = step.tileSize;
  let tileRow = step.tr;
  let tileCol = step.tc;
  if (step.mode === "parallel") {
    const parts = state.inspectTile.split(",");
    tileRow = clamp(parts[0], 0, Math.max(0, Math.ceil(state.m / tileSize) - 1));
    tileCol = clamp(parts[1], 0, Math.max(0, Math.ceil(state.o / tileSize) - 1));
  }

  const rowBounds = tileBounds(tileRow, tileSize, state.m);
  const colBounds = tileBounds(tileCol, tileSize, state.o);
  const kBounds = tileBounds(step.tk, tileSize, state.n);
  const sharedA = makePaddedTile(state.A, rowBounds.start, kBounds.start, tileSize, state.m, state.n);
  const sharedB = makePaddedTile(state.B, kBounds.start, colBounds.start, tileSize, state.n, state.o);

  renderMatrix(els.sharedAContainer, sharedA, {
    editable: false,
    caption: "Zero-padded shared tile from A",
    rowOffset: rowBounds.start,
    colOffset: kBounds.start,
    cellClass: (localRow, localCol) =>
      rowBounds.start + localRow >= state.m || kBounds.start + localCol >= state.n ? "padding-cell" : ""
  });

  renderMatrix(els.sharedBContainer, sharedB, {
    editable: false,
    caption: "Zero-padded shared tile from B",
    rowOffset: kBounds.start,
    colOffset: colBounds.start,
    cellClass: (localRow, localCol) =>
      kBounds.start + localRow >= state.n || colBounds.start + localCol >= state.o ? "padding-cell" : ""
  });

  const localUpdateCount = step.updates.filter((update) =>
    update.i >= rowBounds.start && update.i < rowBounds.end &&
    update.j >= colBounds.start && update.j < colBounds.end
  ).length;
  const activeK = Number.isInteger(step.activeK) ? " | Active k = " + step.activeK : "";
  els.sharedMeta.textContent =
    (step.mode === "parallel" ? "Parallel wave" : "Sequential execution") +
    " | Inspecting " + tileDescriptor(tileRow, tileCol) +
    " | k-tile " + (step.tk + 1) + "/" + step.totalKTiles +
    activeK +
    " | " + localUpdateCount + " cell update(s) in this tile" +
    " | Hatched cells are zero padding.";

  renderEquation();
}

function renderEquation() {
  const step = state.currentStep;
  if (!step) {
    els.equationPanel.textContent =
      "Select a cell in C, then click Start or Next Step to see its multiply-accumulate equation.";
    return;
  }

  const parts = state.focusCell.split(",");
  const row = Number(parts[0]);
  const col = Number(parts[1]);
  const update = step.updates.find((candidate) => candidate.i === row && candidate.j === col);
  if (!update) {
    els.equationPanel.textContent =
      "C[" + row + "," + col + "] is not updated in this sequential step. " +
      "Select a highlighted output cell or continue to its tile.";
    return;
  }

  const expression = update.terms.map((term) =>
    "A[" + update.i + "," + term.k + "] x B[" + term.k + "," + update.j + "]" +
    " (" + formatNumber(term.a) + " x " + formatNumber(term.b) + " = " + formatNumber(term.product) + ")"
  ).join(" + ");

  els.equationPanel.textContent =
    "C[" + update.i + "," + update.j + "] = " + formatNumber(update.oldValue) +
    " + [" + expression + "] = " + formatNumber(update.newValue) +
    "   (step contribution: " + formatNumber(update.add) + ")";
}

function makeUpdate(row, col, kStart, kEnd, accumulator) {
  const oldValue = accumulator[row][col];
  const terms = [];
  let add = 0;

  for (let k = kStart; k < kEnd; k += 1) {
    const a = state.A[row][k];
    const b = state.B[k][col];
    const product = a * b;
    terms.push({ k, a, b, product });
    add += product;
  }

  const newValue = oldValue + add;
  accumulator[row][col] = newValue;
  return { i: row, j: col, oldValue, add, newValue, terms };
}

function buildSequentialSteps(tileSize, detail) {
  const steps = [];
  const accumulator = makeMatrix(state.m, state.o, () => 0);
  const tileRows = Math.ceil(state.m / tileSize);
  const tileCols = Math.ceil(state.o / tileSize);
  const tileKs = Math.ceil(state.n / tileSize);

  for (let tileRow = 0; tileRow < tileRows; tileRow += 1) {
    for (let tileCol = 0; tileCol < tileCols; tileCol += 1) {
      const rowBounds = tileBounds(tileRow, tileSize, state.m);
      const colBounds = tileBounds(tileCol, tileSize, state.o);

      for (let tileK = 0; tileK < tileKs; tileK += 1) {
        const kBounds = tileBounds(tileK, tileSize, state.n);

        if (detail === "mac") {
          for (let k = kBounds.start; k < kBounds.end; k += 1) {
            for (let row = rowBounds.start; row < rowBounds.end; row += 1) {
              for (let col = colBounds.start; col < colBounds.end; col += 1) {
                steps.push({
                  mode: "sequential",
                  granularity: "mac",
                  tileSize,
                  tr: tileRow,
                  tc: tileCol,
                  tk: tileK,
                  totalKTiles: tileKs,
                  rowStart: rowBounds.start,
                  rowEnd: rowBounds.end,
                  colStart: colBounds.start,
                  colEnd: colBounds.end,
                  kStart: kBounds.start,
                  kEnd: kBounds.end,
                  activeK: k,
                  updates: [makeUpdate(row, col, k, k + 1, accumulator)]
                });
              }
            }
          }
        } else {
          const updates = [];
          for (let row = rowBounds.start; row < rowBounds.end; row += 1) {
            for (let col = colBounds.start; col < colBounds.end; col += 1) {
              updates.push(makeUpdate(row, col, kBounds.start, kBounds.end, accumulator));
            }
          }

          steps.push({
            mode: "sequential",
            granularity: "tile",
            tileSize,
            tr: tileRow,
            tc: tileCol,
            tk: tileK,
            totalKTiles: tileKs,
            rowStart: rowBounds.start,
            rowEnd: rowBounds.end,
            colStart: colBounds.start,
            colEnd: colBounds.end,
            kStart: kBounds.start,
            kEnd: kBounds.end,
            activeK: null,
            updates
          });
        }
      }
    }
  }

  return steps;
}

function buildParallelSteps(tileSize, detail) {
  const steps = [];
  const accumulator = makeMatrix(state.m, state.o, () => 0);
  const tileRows = Math.ceil(state.m / tileSize);
  const tileCols = Math.ceil(state.o / tileSize);
  const tileKs = Math.ceil(state.n / tileSize);

  for (let tileK = 0; tileK < tileKs; tileK += 1) {
    const kBounds = tileBounds(tileK, tileSize, state.n);
    const activeKs = detail === "mac"
      ? Array.from({ length: kBounds.end - kBounds.start }, (_, index) => kBounds.start + index)
      : [null];

    for (const activeK of activeKs) {
      const updates = [];
      for (let tileRow = 0; tileRow < tileRows; tileRow += 1) {
        const rowBounds = tileBounds(tileRow, tileSize, state.m);
        for (let tileCol = 0; tileCol < tileCols; tileCol += 1) {
          const colBounds = tileBounds(tileCol, tileSize, state.o);
          for (let row = rowBounds.start; row < rowBounds.end; row += 1) {
            for (let col = colBounds.start; col < colBounds.end; col += 1) {
              updates.push(makeUpdate(
                row,
                col,
                activeK === null ? kBounds.start : activeK,
                activeK === null ? kBounds.end : activeK + 1,
                accumulator
              ));
            }
          }
        }
      }

      steps.push({
        mode: "parallel",
        granularity: detail,
        tileSize,
        tk: tileK,
        totalKTiles: tileKs,
        kStart: kBounds.start,
        kEnd: kBounds.end,
        activeK,
        updates
      });
    }
  }

  return steps;
}

function hasUnsafeArithmetic(steps) {
  return steps.some((step) => step.updates.some((update) =>
    !Number.isFinite(update.oldValue) ||
    !Number.isFinite(update.add) ||
    !Number.isFinite(update.newValue) ||
    update.terms.some((term) => !Number.isFinite(term.product))
  ));
}

function generateSteps() {
  if (state.invalidCells.size) {
    setStatus("Fix invalid matrix values before computing.", true);
    setResultState("stale");
    return false;
  }

  state.tile = clamp(els.tileInput.value, 1, MAX_DIM);
  state.mode = els.modeSelect.value;
  state.detail = els.detailSelect.value;
  els.tileInput.value = String(state.tile);

  const nextSteps = state.mode === "parallel"
    ? buildParallelSteps(state.tile, state.detail)
    : buildSequentialSteps(state.tile, state.detail);

  if (hasUnsafeArithmetic(nextSteps)) {
    state.steps = [];
    state.dirty = true;
    setResultState("stale");
    setStatus(
      "Computation stopped: these values overflow JavaScript's finite number range. Use smaller magnitudes.",
      true
    );
    updateProgress();
    updateButtons();
    return false;
  }

  state.steps = nextSteps;
  state.dirty = false;
  state.stepIndex = 0;
  state.currentStep = null;
  state.C = makeMatrix(state.m, state.o, () => 0);
  state.highlight = emptyHighlight();
  rebuildInspectTiles();
  setResultState("ready");
  renderAll();

  if (!state.steps.length) {
    setStatus("No simulation steps are available for the current settings.", true);
    updateProgress();
    updateButtons();
    return false;
  }

  setStatus(
    "Simulation ready with " + state.steps.length + " step(s) at " +
    (state.detail === "mac" ? "multiply-accumulate" : "tile-wave") + " detail.",
    false
  );
  updateProgress();
  updateButtons();
  return true;
}

function addRange(set, rowStart, rowEnd, colStart, colEnd) {
  for (let row = rowStart; row < rowEnd; row += 1) {
    for (let col = colStart; col < colEnd; col += 1) set.add(keyOf(row, col));
  }
}

function computeHighlights(step) {
  const highlight = emptyHighlight();
  if (!step) return highlight;

  for (const update of step.updates) {
    highlight.updated.add(keyOf(update.i, update.j));
    highlight.c.add(keyOf(update.i, update.j));
  }

  if (step.granularity === "mac") {
    for (const update of step.updates) {
      for (const term of update.terms) {
        highlight.a.add(keyOf(update.i, term.k));
        highlight.b.add(keyOf(term.k, update.j));
      }
    }
  } else if (step.mode === "sequential") {
    addRange(highlight.a, step.rowStart, step.rowEnd, step.kStart, step.kEnd);
    addRange(highlight.b, step.kStart, step.kEnd, step.colStart, step.colEnd);
    addRange(highlight.c, step.rowStart, step.rowEnd, step.colStart, step.colEnd);
  } else {
    addRange(highlight.a, 0, state.m, step.kStart, step.kEnd);
    addRange(highlight.b, step.kStart, step.kEnd, 0, state.o);
    addRange(highlight.c, 0, state.m, 0, state.o);
  }

  let tileRow = step.tr;
  let tileCol = step.tc;
  if (step.mode === "parallel") {
    const parts = state.inspectTile.split(",");
    tileRow = clamp(parts[0], 0, Math.max(0, Math.ceil(state.m / step.tileSize) - 1));
    tileCol = clamp(parts[1], 0, Math.max(0, Math.ceil(state.o / step.tileSize) - 1));
  }

  const rowBounds = tileBounds(tileRow, step.tileSize, state.m);
  const colBounds = tileBounds(tileCol, step.tileSize, state.o);
  const kBounds = tileBounds(step.tk, step.tileSize, state.n);
  addRange(highlight.inspectedA, rowBounds.start, rowBounds.end, kBounds.start, kBounds.end);
  addRange(highlight.inspectedB, kBounds.start, kBounds.end, colBounds.start, colBounds.end);
  addRange(highlight.inspectedC, rowBounds.start, rowBounds.end, colBounds.start, colBounds.end);
  return highlight;
}

function describeStep(step) {
  if (!step) return "No active step";
  const location = step.mode === "parallel"
    ? "all output tiles"
    : "output tile (" + step.tr + ", " + step.tc + ")";
  const kDescription = Number.isInteger(step.activeK)
    ? "k = " + step.activeK + " in k-tile " + (step.tk + 1) + "/" + step.totalKTiles
    : "k-tile " + (step.tk + 1) + "/" + step.totalKTiles;
  return location + " | " + kDescription;
}

function applyNextStep() {
  if (state.stepIndex >= state.steps.length) {
    stopPlayback();
    setResultState("complete");
    setStatus("Simulation complete.", false);
    updateButtons();
    return false;
  }

  const step = state.steps[state.stepIndex];
  for (const update of step.updates) state.C[update.i][update.j] = update.newValue;
  state.currentStep = step;
  state.highlight = computeHighlights(step);
  state.stepIndex += 1;

  const complete = state.stepIndex >= state.steps.length;
  if (complete) {
    stopPlayback();
    setResultState("complete");
  } else {
    setResultState("computing");
  }

  renderAll();
  updateProgress();
  setStatus(
    (complete ? "Simulation complete. " : "Step " + state.stepIndex + "/" + state.steps.length + " | ") +
    describeStep(step),
    false
  );
  updateButtons();
  return true;
}

function restoreToStep(targetIndex) {
  stopPlayback();
  const target = clamp(targetIndex, 0, state.steps.length);
  state.C = makeMatrix(state.m, state.o, () => 0);
  for (let index = 0; index < target; index += 1) {
    for (const update of state.steps[index].updates) state.C[update.i][update.j] = update.newValue;
  }

  state.stepIndex = target;
  state.currentStep = target > 0 ? state.steps[target - 1] : null;
  state.highlight = computeHighlights(state.currentStep);
  setResultState(target === 0 ? "ready" : target === state.steps.length ? "complete" : "computing");
  renderAll();
  updateProgress();
  setStatus(
    target === 0
      ? "Returned to the beginning."
      : "Returned to step " + target + "/" + state.steps.length + " | " + describeStep(state.currentStep),
    false
  );
  updateButtons();
}

function runPlayback() {
  if (!state.playing) return;
  const didStep = applyNextStep();
  if (!didStep || !state.playing) return;
  state.timerId = setTimeout(runPlayback, state.speedMs);
}

function updateProgress() {
  const total = state.steps.length;
  els.stepProgress.max = Math.max(1, total);
  els.stepProgress.value = Math.min(state.stepIndex, total);
  els.progressLabel.textContent = state.stepIndex + " / " + total + " steps";
}

function updateButtons() {
  const hasSteps = state.steps.length > 0;
  const atEnd = !state.dirty && hasSteps && state.stepIndex >= state.steps.length;
  const canResume = hasSteps && !state.dirty && state.stepIndex > 0 && !atEnd;

  els.startBtn.disabled = state.playing;
  els.pauseBtn.disabled = !state.playing && !canResume;
  els.pauseBtn.textContent = state.playing ? "Pause" : "Resume";
  els.prevBtn.disabled = state.playing || state.dirty || state.stepIndex === 0;
  els.stepBtn.disabled = state.playing || atEnd;
  els.inspectTileSelect.disabled = state.mode !== "parallel";
}

function ensurePrepared() {
  if (!state.dirty && state.steps.length) return true;
  return generateSteps();
}

function randomizeValues() {
  state.A = makeMatrix(state.m, state.n, () => Math.floor(Math.random() * 9) - 4);
  state.B = makeMatrix(state.n, state.o, () => Math.floor(Math.random() * 9) - 4);
  state.dirty = true;
  resetProgress(true);
  markDirty("Randomized A and B. Start or use Next Step to regenerate the simulation.");
}

function resetValues() {
  state.A = makeMatrix(state.m, state.n, defaultAValue);
  state.B = makeMatrix(state.n, state.o, defaultBValue);
  state.dirty = true;
  resetProgress(true);
  markDirty("Matrix values reset. Start or use Next Step to regenerate the simulation.");
}

function bindEvents() {
  els.speedInput.addEventListener("input", () => {
    state.speedMs = clamp(els.speedInput.value, 80, 1500);
    els.speedInput.value = String(state.speedMs);
    els.speedLabel.textContent = state.speedMs + " ms";
  });

  els.modeSelect.addEventListener("change", () => {
    state.mode = els.modeSelect.value;
    rebuildInspectTiles();
    markDirty("Mode changed. Start or use Next Step to regenerate the simulation.");
  });

  els.detailSelect.addEventListener("change", () => {
    state.detail = els.detailSelect.value;
    markDirty("Animation detail changed. Start or use Next Step to regenerate the simulation.");
  });

  els.tileInput.addEventListener("change", () => {
    state.tile = clamp(els.tileInput.value, 1, MAX_DIM);
    els.tileInput.value = String(state.tile);
    rebuildInspectTiles();
    markDirty("Tile size changed. Start or use Next Step to regenerate the simulation.");
  });

  els.inspectTileSelect.addEventListener("change", () => {
    state.inspectTile = els.inspectTileSelect.value;
    const parts = state.inspectTile.split(",");
    state.focusCell = keyOf(Number(parts[0]) * state.tile, Number(parts[1]) * state.tile);
    state.highlight = computeHighlights(state.currentStep);
    renderAll();
  });

  els.resizeBtn.addEventListener("click", () => {
    setDimensions(els.mInput.value, els.nInput.value, els.oInput.value, true);
  });

  els.defaultsBtn.addEventListener("click", resetValues);
  els.randomBtn.addEventListener("click", randomizeValues);

  els.startBtn.addEventListener("click", () => {
    if (!ensurePrepared()) return;
    if (state.stepIndex >= state.steps.length) restoreToStep(0);
    state.playing = true;
    updateButtons();
    runPlayback();
  });

  els.pauseBtn.addEventListener("click", () => {
    if (state.playing) {
      stopPlayback();
      setStatus("Paused at step " + state.stepIndex + "/" + state.steps.length + ".", false);
      updateButtons();
      return;
    }

    if (!ensurePrepared() || state.stepIndex >= state.steps.length) return;
    state.playing = true;
    setStatus("Resumed from step " + state.stepIndex + "/" + state.steps.length + ".", false);
    updateButtons();
    runPlayback();
  });

  els.prevBtn.addEventListener("click", () => {
    if (state.playing || state.dirty || state.stepIndex === 0) return;
    restoreToStep(state.stepIndex - 1);
  });

  els.stepBtn.addEventListener("click", () => {
    if (state.playing || !ensurePrepared()) return;
    applyNextStep();
  });

  els.resetBtn.addEventListener("click", () => {
    resetProgress(false);
    setStatus(
      state.dirty
        ? "Progress reset. Settings have changed; Start or use Next Step to regenerate."
        : "Progress reset. Ready from step 1.",
      false
    );
  });
}

function init() {
  state.A = makeMatrix(state.m, state.n, defaultAValue);
  state.B = makeMatrix(state.n, state.o, defaultBValue);
  state.C = makeMatrix(state.m, state.o, () => 0);
  els.speedLabel.textContent = state.speedMs + " ms";
  rebuildInspectTiles();
  bindEvents();
  setResultState("empty");
  renderAll();
  updateProgress();
  updateButtons();
  setStatus("Edit values, then click Start or Next Step.", false);
}

init();
