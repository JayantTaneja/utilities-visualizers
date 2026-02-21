const MAX_DIM = 16;

    const state = {
      m: 4,
      n: 4,
      o: 4,
      tile: 2,
      mode: "sequential",
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
      highlight: {
        a: new Set(),
        b: new Set(),
        c: new Set(),
        updated: new Set()
      }
    };

    const els = {
      mInput: document.getElementById("mInput"),
      nInput: document.getElementById("nInput"),
      oInput: document.getElementById("oInput"),
      tileInput: document.getElementById("tileInput"),
      modeSelect: document.getElementById("modeSelect"),
      speedInput: document.getElementById("speedInput"),
      speedLabel: document.getElementById("speedLabel"),
      inspectTileSelect: document.getElementById("inspectTileSelect"),
      resizeBtn: document.getElementById("resizeBtn"),
      defaultsBtn: document.getElementById("defaultsBtn"),
      randomBtn: document.getElementById("randomBtn"),
      startBtn: document.getElementById("startBtn"),
      pauseBtn: document.getElementById("pauseBtn"),
      stepBtn: document.getElementById("stepBtn"),
      resetBtn: document.getElementById("resetBtn"),
      aContainer: document.getElementById("aContainer"),
      bContainer: document.getElementById("bContainer"),
      cContainer: document.getElementById("cContainer"),
      sharedAContainer: document.getElementById("sharedAContainer"),
      sharedBContainer: document.getElementById("sharedBContainer"),
      sharedMeta: document.getElementById("sharedMeta"),
      status: document.getElementById("status")
    };

    function clamp(value, min, max) {
      const v = Number(value);
      if (!Number.isFinite(v)) return min;
      return Math.max(min, Math.min(max, Math.trunc(v)));
    }

    function keyOf(r, c) {
      return r + "," + c;
    }

    function makeMatrix(rows, cols, filler) {
      return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) =>
          typeof filler === "function" ? filler(r, c) : 0
        )
      );
    }

    function resizeMatrix(oldMatrix, newRows, newCols, filler) {
      const oldRows = oldMatrix.length;
      const oldCols = oldRows ? oldMatrix[0].length : 0;
      return makeMatrix(newRows, newCols, (r, c) => {
        if (r < oldRows && c < oldCols) {
          return oldMatrix[r][c];
        }
        return filler(r, c);
      });
    }

    function defaultAValue(r, c) {
      return ((r + c * 2) % 7) - 3;
    }

    function defaultBValue(r, c) {
      return ((r * 3 + c) % 9) - 4;
    }

    function formatNumber(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return "0";
      if (Math.abs(n - Math.round(n)) < 1e-9) {
        return String(Math.round(n));
      }
      return n.toFixed(2).replace(/\.00$/, "");
    }

    function setStatus(message, isError) {
      els.status.textContent = message || "";
      els.status.classList.toggle("error", !!isError);
    }

    function stopPlayback() {
      if (state.timerId !== null) {
        clearTimeout(state.timerId);
        state.timerId = null;
      }
      state.playing = false;
      els.pauseBtn.textContent = "Pause";
    }

    function markDirty(note) {
      state.dirty = true;
      stopPlayback();
      if (note) {
        setStatus(note, false);
      }
    }

    function resetProgress(clearSteps) {
      stopPlayback();
      state.C = makeMatrix(state.m, state.o, () => 0);
      state.stepIndex = 0;
      state.currentStep = null;
      state.highlight = { a: new Set(), b: new Set(), c: new Set(), updated: new Set() };
      if (clearSteps) {
        state.steps = [];
      }
      renderAll();
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

      els.mInput.value = String(nextM);
      els.nInput.value = String(nextN);
      els.oInput.value = String(nextO);
      els.tileInput.value = String(state.tile);

      rebuildInspectTiles();
      resetProgress(true);
      markDirty("Dimensions updated. Start to regenerate the simulation.");
    }

    function parseCellValue(raw) {
      const v = Number(raw);
      if (!Number.isFinite(v)) return 0;
      return v;
    }

    function renderMatrix(container, matrix, opts) {
      const table = document.createElement("table");
      table.className = "matrix";
      const tbody = document.createElement("tbody");

      for (let r = 0; r < matrix.length; r += 1) {
        const tr = document.createElement("tr");
        for (let c = 0; c < matrix[r].length; c += 1) {
          const td = document.createElement("td");
          const className = opts.cellClass ? opts.cellClass(r, c) : "";
          if (className) td.className = className;

          if (opts.editable) {
            const input = document.createElement("input");
            input.type = "number";
            input.step = "any";
            input.value = String(matrix[r][c]);
            input.addEventListener("input", () => {
              matrix[r][c] = parseCellValue(input.value);
              markDirty("Matrix values changed. Start to regenerate the simulation.");
            });
            td.appendChild(input);
          } else {
            td.textContent = formatNumber(matrix[r][c]);
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      container.replaceChildren(table);
    }

    function highlightClass(baseSet, updatedSet, r, c, baseClass) {
      const k = keyOf(r, c);
      let cls = "";
      if (baseSet.has(k)) cls = baseClass;
      if (updatedSet.has(k)) cls = (cls ? cls + " " : "") + "updated";
      return cls;
    }

    function renderAll() {
      const noUpdates = new Set();

      renderMatrix(els.aContainer, state.A, {
        editable: true,
        cellClass: (r, c) => highlightClass(state.highlight.a, noUpdates, r, c, "active-a")
      });

      renderMatrix(els.bContainer, state.B, {
        editable: true,
        cellClass: (r, c) => highlightClass(state.highlight.b, noUpdates, r, c, "active-b")
      });

      renderMatrix(els.cContainer, state.C, {
        editable: false,
        cellClass: (r, c) => highlightClass(state.highlight.c, state.highlight.updated, r, c, "active-c")
      });

      renderSharedTiles();
    }

    function tileBounds(index, tileSize, limit) {
      const start = index * tileSize;
      return { start, end: Math.min(start + tileSize, limit) };
    }

    function extractTile(matrix, rowStart, rowEnd, colStart, colEnd) {
      const out = [];
      for (let r = rowStart; r < rowEnd; r += 1) {
        const row = [];
        for (let c = colStart; c < colEnd; c += 1) {
          row.push(matrix[r][c]);
        }
        out.push(row);
      }
      return out;
    }

    function tileDescriptor(tr, tc) {
      return "Tile (" + tr + ", " + tc + ")";
    }

    function rebuildInspectTiles() {
      const t = clamp(els.tileInput.value, 1, MAX_DIM);
      const tileRows = Math.ceil(state.m / t);
      const tileCols = Math.ceil(state.o / t);
      const select = els.inspectTileSelect;
      const prev = state.inspectTile;

      select.replaceChildren();
      for (let tr = 0; tr < tileRows; tr += 1) {
        for (let tc = 0; tc < tileCols; tc += 1) {
          const option = document.createElement("option");
          option.value = tr + "," + tc;
          option.textContent = tileDescriptor(tr, tc);
          select.appendChild(option);
        }
      }

      if (select.options.length === 0) {
        state.inspectTile = "0,0";
        return;
      }

      const found = Array.from(select.options).some((opt) => opt.value === prev);
      state.inspectTile = found ? prev : select.options[0].value;
      select.value = state.inspectTile;
      select.disabled = state.mode !== "parallel";
    }

    function renderSharedTiles() {
      const step = state.currentStep;
      if (!step) {
        els.sharedAContainer.textContent = "-";
        els.sharedBContainer.textContent = "-";
        els.sharedMeta.textContent = "No active step yet. Click Start or Step.";
        return;
      }

      const tileSize = step.tileSize;
      let tr;
      let tc;
      if (step.mode === "parallel") {
        const parts = state.inspectTile.split(",");
        tr = clamp(parts[0], 0, Math.max(0, Math.ceil(state.m / tileSize) - 1));
        tc = clamp(parts[1], 0, Math.max(0, Math.ceil(state.o / tileSize) - 1));
      } else {
        tr = step.tr;
        tc = step.tc;
      }

      const row = tileBounds(tr, tileSize, state.m);
      const col = tileBounds(tc, tileSize, state.o);
      const kBound = tileBounds(step.tk, tileSize, state.n);

      const sharedA = extractTile(state.A, row.start, row.end, kBound.start, kBound.end);
      const sharedB = extractTile(state.B, kBound.start, kBound.end, col.start, col.end);

      renderMatrix(els.sharedAContainer, sharedA, { editable: false });
      renderMatrix(els.sharedBContainer, sharedB, { editable: false });

      let localUpdates = step.updates;
      if (step.mode === "parallel") {
        localUpdates = step.updates.filter((u) => u.i >= row.start && u.i < row.end && u.j >= col.start && u.j < col.end);
      }

      const tileWork = localUpdates.reduce((sum, u) => sum + u.add, 0);
      const header = step.mode === "parallel"
        ? "Parallel wave " + (step.tk + 1) + "/" + step.totalKTiles
        : "Sequential step " + (state.stepIndex) + "/" + state.steps.length;
      els.sharedMeta.textContent = header +
        " | Inspecting " + tileDescriptor(tr, tc) +
        " | k-tile " + (step.tk + 1) +
        " | Tile update sum this step: " + formatNumber(tileWork);
    }

    function buildSequentialSteps(tileSize) {
      const steps = [];
      const cAcc = makeMatrix(state.m, state.o, () => 0);
      const tileRows = Math.ceil(state.m / tileSize);
      const tileCols = Math.ceil(state.o / tileSize);
      const tileKs = Math.ceil(state.n / tileSize);

      for (let tr = 0; tr < tileRows; tr += 1) {
        for (let tc = 0; tc < tileCols; tc += 1) {
          const row = tileBounds(tr, tileSize, state.m);
          const col = tileBounds(tc, tileSize, state.o);

          for (let tk = 0; tk < tileKs; tk += 1) {
            const kb = tileBounds(tk, tileSize, state.n);
            const updates = [];

            for (let i = row.start; i < row.end; i += 1) {
              for (let j = col.start; j < col.end; j += 1) {
                let add = 0;
                for (let k = kb.start; k < kb.end; k += 1) {
                  add += state.A[i][k] * state.B[k][j];
                }
                cAcc[i][j] += add;
                updates.push({ i, j, add, newValue: cAcc[i][j] });
              }
            }

            steps.push({
              mode: "sequential",
              tileSize,
              tr,
              tc,
              tk,
              totalKTiles: tileKs,
              rowStart: row.start,
              rowEnd: row.end,
              colStart: col.start,
              colEnd: col.end,
              kStart: kb.start,
              kEnd: kb.end,
              updates
            });
          }
        }
      }

      return steps;
    }

    function buildParallelSteps(tileSize) {
      const steps = [];
      const cAcc = makeMatrix(state.m, state.o, () => 0);
      const tileRows = Math.ceil(state.m / tileSize);
      const tileCols = Math.ceil(state.o / tileSize);
      const tileKs = Math.ceil(state.n / tileSize);

      for (let tk = 0; tk < tileKs; tk += 1) {
        const kb = tileBounds(tk, tileSize, state.n);
        const updates = [];

        for (let tr = 0; tr < tileRows; tr += 1) {
          const row = tileBounds(tr, tileSize, state.m);
          for (let tc = 0; tc < tileCols; tc += 1) {
            const col = tileBounds(tc, tileSize, state.o);

            for (let i = row.start; i < row.end; i += 1) {
              for (let j = col.start; j < col.end; j += 1) {
                let add = 0;
                for (let k = kb.start; k < kb.end; k += 1) {
                  add += state.A[i][k] * state.B[k][j];
                }
                cAcc[i][j] += add;
                updates.push({ i, j, add, newValue: cAcc[i][j] });
              }
            }
          }
        }

        steps.push({
          mode: "parallel",
          tileSize,
          tk,
          totalKTiles: tileKs,
          kStart: kb.start,
          kEnd: kb.end,
          updates
        });
      }

      return steps;
    }

    function generateSteps() {
      state.tile = clamp(els.tileInput.value, 1, MAX_DIM);
      state.mode = els.modeSelect.value;
      els.tileInput.value = String(state.tile);

      state.steps = state.mode === "parallel"
        ? buildParallelSteps(state.tile)
        : buildSequentialSteps(state.tile);

      state.dirty = false;
      state.stepIndex = 0;
      state.currentStep = null;
      state.C = makeMatrix(state.m, state.o, () => 0);
      state.highlight = { a: new Set(), b: new Set(), c: new Set(), updated: new Set() };
      rebuildInspectTiles();
      renderAll();

      if (state.steps.length === 0) {
        setStatus("No simulation steps available for current settings.", true);
        return false;
      }

      setStatus("Simulation ready with " + state.steps.length + " step(s).", false);
      updateButtons();
      return true;
    }

    function computeHighlights(step) {
      const h = { a: new Set(), b: new Set(), c: new Set(), updated: new Set() };
      if (!step) return h;

      for (const u of step.updates) {
        h.updated.add(keyOf(u.i, u.j));
      }

      if (step.mode === "sequential") {
        for (let r = step.rowStart; r < step.rowEnd; r += 1) {
          for (let c = step.kStart; c < step.kEnd; c += 1) {
            h.a.add(keyOf(r, c));
          }
        }

        for (let r = step.kStart; r < step.kEnd; r += 1) {
          for (let c = step.colStart; c < step.colEnd; c += 1) {
            h.b.add(keyOf(r, c));
          }
        }

        for (let r = step.rowStart; r < step.rowEnd; r += 1) {
          for (let c = step.colStart; c < step.colEnd; c += 1) {
            h.c.add(keyOf(r, c));
          }
        }
      } else {
        for (let r = 0; r < state.m; r += 1) {
          for (let c = step.kStart; c < step.kEnd; c += 1) {
            h.a.add(keyOf(r, c));
          }
        }

        for (let r = step.kStart; r < step.kEnd; r += 1) {
          for (let c = 0; c < state.o; c += 1) {
            h.b.add(keyOf(r, c));
          }
        }

        for (const u of step.updates) {
          h.c.add(keyOf(u.i, u.j));
        }
      }

      return h;
    }

    function applyNextStep() {
      if (state.stepIndex >= state.steps.length) {
        stopPlayback();
        setStatus("Simulation complete.", false);
        updateButtons();
        return false;
      }

      const step = state.steps[state.stepIndex];
      for (const u of step.updates) {
        state.C[u.i][u.j] = u.newValue;
      }
      state.currentStep = step;
      state.highlight = computeHighlights(step);
      state.stepIndex += 1;

      renderAll();
      setStatus(
        "Step " + state.stepIndex + "/" + state.steps.length +
        " | Mode: " + (state.mode === "parallel" ? "Parallel" : "Sequential") +
        " | k-tile " + (step.tk + 1) + "/" + step.totalKTiles,
        false
      );

      if (state.stepIndex >= state.steps.length) {
        stopPlayback();
        setStatus("Simulation complete.", false);
      }
      updateButtons();
      return true;
    }

    function runPlayback() {
      if (!state.playing) return;
      const didStep = applyNextStep();
      if (!didStep || !state.playing) return;
      state.timerId = setTimeout(runPlayback, state.speedMs);
    }

    function updateButtons() {
      const hasSteps = state.steps.length > 0;
      const atEnd = hasSteps && state.stepIndex >= state.steps.length;

      els.startBtn.disabled = false;
      els.pauseBtn.disabled = !state.playing && (!hasSteps || atEnd);
      els.stepBtn.disabled = state.playing || (hasSteps && atEnd);
      els.inspectTileSelect.disabled = state.mode !== "parallel";
    }

    function ensurePrepared() {
      if (!state.dirty && state.steps.length > 0) {
        return true;
      }
      return generateSteps();
    }

    function randomizeValues() {
      state.A = makeMatrix(state.m, state.n, () => Math.floor(Math.random() * 9) - 4);
      state.B = makeMatrix(state.n, state.o, () => Math.floor(Math.random() * 9) - 4);
      markDirty("Randomized A and B. Start to regenerate the simulation.");
      resetProgress(true);
    }

    function resetValues() {
      state.A = makeMatrix(state.m, state.n, defaultAValue);
      state.B = makeMatrix(state.n, state.o, defaultBValue);
      markDirty("Matrix values reset. Start to regenerate the simulation.");
      resetProgress(true);
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
        markDirty("Mode changed. Start to regenerate the simulation.");
        updateButtons();
      });

      els.tileInput.addEventListener("change", () => {
        state.tile = clamp(els.tileInput.value, 1, MAX_DIM);
        els.tileInput.value = String(state.tile);
        rebuildInspectTiles();
        markDirty("Tile size changed. Start to regenerate the simulation.");
      });

      els.inspectTileSelect.addEventListener("change", () => {
        state.inspectTile = els.inspectTileSelect.value;
        renderSharedTiles();
      });

      els.resizeBtn.addEventListener("click", () => {
        setDimensions(els.mInput.value, els.nInput.value, els.oInput.value, true);
      });

      els.defaultsBtn.addEventListener("click", resetValues);
      els.randomBtn.addEventListener("click", randomizeValues);

      els.startBtn.addEventListener("click", () => {
        if (!ensurePrepared()) return;
        if (state.stepIndex >= state.steps.length) {
          state.stepIndex = 0;
          state.currentStep = null;
          state.C = makeMatrix(state.m, state.o, () => 0);
          state.highlight = { a: new Set(), b: new Set(), c: new Set(), updated: new Set() };
          renderAll();
        }
        if (!state.playing) {
          state.playing = true;
          els.pauseBtn.textContent = "Pause";
          runPlayback();
        }
        updateButtons();
      });

      els.pauseBtn.addEventListener("click", () => {
        if (!state.playing) return;
        stopPlayback();
        setStatus("Paused at step " + state.stepIndex + "/" + state.steps.length + ".", false);
        updateButtons();
      });

      els.stepBtn.addEventListener("click", () => {
        if (state.playing) return;
        if (!ensurePrepared()) return;
        applyNextStep();
      });

      els.resetBtn.addEventListener("click", () => {
        resetProgress(false);
        setStatus("Progress reset. Ready from step 1.", false);
      });
    }

    function init() {
      state.A = makeMatrix(state.m, state.n, defaultAValue);
      state.B = makeMatrix(state.n, state.o, defaultBValue);
      state.C = makeMatrix(state.m, state.o, () => 0);
      els.speedLabel.textContent = state.speedMs + " ms";
      rebuildInspectTiles();
      bindEvents();
      renderAll();
      updateButtons();
      setStatus("Edit values, then click Start or Step.", false);
    }

    init();

