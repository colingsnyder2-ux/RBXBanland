// Minesweeper, Windows 98 style. All art is drawn here pixel by pixel (no image assets).
// Layout follows the original WinMine metrics: 16px cells, 13x23 LED digits, 24px face button, 12px margins.
(() => {
  "use strict";
  const C = { face: "#c0c0c0", hi: "#ffffff", lo: "#808080", black: "#000000", red: "#ff0000", yellow: "#ffff00", olive: "#808000" };
  const NUM = ["", "#0000ff", "#008000", "#ff0000", "#000080", "#800000", "#008080", "#000000", "#808080"];
  const LEVELS = {
    beginner: { w: 9, h: 9, m: 10, label: "Beginner" },
    intermediate: { w: 16, h: 16, m: 40, label: "Intermediate" },
    expert: { w: 30, h: 16, m: 99, label: "Expert" },
  };
  const BLK = 16, GRID_X = 12, GRID_Y = 55, LED_W = 13, LED_H = 23, TOP_LED = 16, BTN = 24;

  // ---------- Pixel art (traced to match the original 16x16 tiles) ----------
  const GLYPHS = {
    1: ["........XX", ".......XXX", "......XXXX", ".....XXXXX", ".......XXX", ".......XXX", ".......XXX", ".......XXX", ".....XXXXXXX", ".....XXXXXXX"],
    2: ["....XXXXXXXX", "...XXXXXXXXXX", "...XXX....XXX", "..........XXX", "........XXXX", "......XXXXX", "....XXXXX", "...XXXX", "...XXXXXXXXXX", "...XXXXXXXXXX"],
    3: ["...XXXXXXXXX", "...XXXXXXXXXX", "..........XXX", "..........XXX", "......XXXXXX", "......XXXXXX", "..........XXX", "..........XXX", "...XXXXXXXXXX", "...XXXXXXXXX"],
    4: [".....XXX.XXX", ".....XXX.XXX", "....XXX..XXX", "....XXX..XXX", "...XXXXXXXXXX", "...XXXXXXXXXX", ".........XXX", ".........XXX", ".........XXX", ".........XXX"],
    5: ["...XXXXXXXXXX", "...XXXXXXXXXX", "...XXX", "...XXX", "...XXXXXXXXX", "...XXXXXXXXXX", "..........XXX", "..........XXX", "...XXXXXXXXXX", "...XXXXXXXXX"],
    6: ["....XXXXXXXX", "...XXXXXXXXX", "...XXX", "...XXX", "...XXXXXXXXX", "...XXXXXXXXXX", "...XXX....XXX", "...XXX....XXX", "...XXXXXXXXXX", "....XXXXXXXX"],
    7: ["...XXXXXXXXXX", "...XXXXXXXXXX", "..........XXX", "..........XXX", ".........XXX", ".........XXX", "........XXX", "........XXX", ".......XXX", ".......XXX"],
    8: ["....XXXXXXXX", "...XXXXXXXXXX", "...XXX....XXX", "...XXX....XXX", "....XXXXXXXX", "....XXXXXXXX", "...XXX....XXX", "...XXX....XXX", "...XXXXXXXXXX", "....XXXXXXXX"],
  };
  const MINE = [
    "", "", "........#", "........#", "....#.#####.#", ".....#######", "....##WW#####", "....##WW#####",
    "..#############", "....#########", "....#########", ".....#######", "....#.#####.#", "........#", "........#",
  ];
  const WRONG = [
    "", "", "........#", "..RR....#....RR", "...RR.#####.RR", "....RR#####RR", "....#RRW##RR#", "....##RR#RR##",
    "..#####RRR#####", "....###RRR###", "....##RR#RR##", ".....RR###RR", "....RR#####RR", "...RR...#...RR", "..RR....#....RR",
  ];
  const FLAG = ["", "", "", ".......RR", ".....RRRR", "....RRRRR", ".....RRRR", ".......RR", "........#", "........#", "......####", "....########", "....########"];
  const QUEST = ["", "", "", "......####", ".....##..##", ".....##..##", ".........##", "........##", ".......##", ".......##", "", ".......##", ".......##"];
  const FACE_RING = [
    "......#####......", "....##YYYYY##....", "...#YYYYYYYYY#...", "..#YYYYYYYYYYY#..",
  ];
  const FACE_BOTTOM = ["..#YYYYYYYYYYY#..", "...#YYYYYYYYY#...", "....##YYYYY##....", "......#####......"];
  const FACES = {
    smile: [...FACE_RING, ".#YYYYYYYYYYYYY#.", ".#YYY##YYY##YYY#.", "#YYYY##YYY##YYYY#", "#YYYYYYYYYYYYYYY#", "#YYYYYYYYYYYYYYY#", "#YYYYYYYYYYYYYYY#", "#YYY#YYYYYYY#YYY#", ".#YYY#YYYYY#YYY#.", ".#YYYY#####YYYY#.", ...FACE_BOTTOM],
    oh: [...FACE_RING, ".#YYO#OYYYO#OYY#.", ".#YY###YYY###YY#.", "#YYYO#OYYYO#OYYY#", "#YYYYYYYYYYYYYYY#", "#YYYYYYYYYYYYYYY#", "#YYYYYY###YYYYYY#", "#YYYYYO#Y#OYYYYY#", ".#YYYY#YYY#YYYY#.", ".#YYYYO#Y#OYYYY#.", "..#YYYY###YYYY#..", "...#YYYYYYYYY#...", "....##YYYYY##....", "......#####......"],
    dead: [...FACE_RING, ".#YY#Y#YYY#Y#YY#.", ".#YYY#YYYYY#YYY#.", "#YYY#Y#YYY#Y#YYY#", "#YYYYYYYYYYYYYYY#", "#YYYYYYYYYYYYYYY#", "#YYYYYYYYYYYYYYY#", "#YYYYY#####YYYYY#", ".#YYY#YYYYY#YYY#.", ".#YY#YYYYYYY#YY#.", ...FACE_BOTTOM],
    cool: [...FACE_RING, ".#YYYYYYYYYYYYY#.", ".#YY#########YY#.", "#YY#####Y#####YY#", "#Y#Y####Y####Y#Y#", "##YYO##YYY##OYY##", "#YYYYYYYYYYYYYYY#", "#YYYYYYYYYYYYYYY#", ".#YYY#YYYYY#YYY#.", ".#YYYY#####YYYY#.", ...FACE_BOTTOM],
  };
  // LED segment masks for a 13x23 digit: a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle.
  const SEGS = {
    a: (x, y) => (y === 0 && x >= 2 && x <= 10) || (y === 1 && x >= 3 && x <= 9) || (y === 2 && x >= 4 && x <= 8),
    f: (x, y) => side(x, y, 1, 9, false),
    b: (x, y) => side(x, y, 1, 9, true),
    e: (x, y) => side(x, y, 11, 19, false),
    c: (x, y) => side(x, y, 11, 19, true),
    g: (x, y) => (y === 9 && x >= 3 && x <= 9) || (y === 10 && x >= 2 && x <= 10) || (y === 11 && x >= 3 && x <= 9),
    d: (x, y) => (y === 18 && x >= 4 && x <= 8) || (y === 19 && x >= 3 && x <= 9) || (y === 20 && x >= 2 && x <= 10),
  };
  function side(x, y, y0, y1, right) {
    if (y < y0 || y > y1) return false;
    const xx = right ? 12 - x : x;
    const k = y - y0, n = y1 - y0;
    const depth = k === 0 || k === n ? 1 : k === 1 || k === n - 1 ? 2 : 3;
    return xx >= 1 && xx <= depth;
  }
  const DIGIT_SEGS = ["abcdef", "bc", "abged", "abgcd", "fgbc", "afgcd", "afgedc", "abc", "abcdefg", "abcdfg", "g"];

  // ---------- State ----------
  const canvas = document.getElementById("Board");
  const ctx = canvas.getContext("2d");
  const cfg = Object.assign({ level: "beginner", w: 9, h: 9, m: 10, marks: true, color: true }, AppKit.load("rbx.mines.cfg", {}));
  let W, H, cols, rows, mines;
  let mine, state, adj; // state: 0 closed, 1 open, 2 flag, 3 question
  let opened, flags, playing, over, won, firstClick, elapsed, timer, boomAt;
  let face = "smile", facePressed = false;
  let held = null; // { mode: "reveal"|"chord"|"face", cell }
  let xyzzy = "", cheat = false;

  function idx(c, r) { return r * cols + c; }
  function neighbors(i) {
    const c = i % cols, r = (i / cols) | 0, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const cc = c + dc, rr = r + dr;
      if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) out.push(rr * cols + cc);
    }
    return out;
  }

  function newGame() {
    const L = LEVELS[cfg.level];
    cols = L ? L.w : cfg.w; rows = L ? L.h : cfg.h; mines = L ? L.m : cfg.m;
    W = cols * BLK + 24; H = rows * BLK + 67;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    const n = cols * rows;
    mine = new Uint8Array(n); state = new Uint8Array(n); adj = new Uint8Array(n);
    // Place mines at random.
    let placed = 0;
    while (placed < mines) { const i = (Math.random() * n) | 0; if (!mine[i]) { mine[i] = 1; placed++; } }
    computeAdj();
    opened = 0; flags = 0; playing = false; over = false; won = false; firstClick = true; elapsed = 0; boomAt = -1;
    clearInterval(timer); timer = null;
    face = "smile"; held = null;
    draw();
    fit();
  }
  function computeAdj() { for (let i = 0; i < mine.length; i++) adj[i] = neighbors(i).reduce((s, j) => s + mine[j], 0); }

  function protectStart(i) {
    const safe = new Set([i, ...neighbors(i)]), move = [];
    for (let j = 0; j < mine.length; j++) if (safe.has(j) && mine[j]) { mine[j] = 0; move.push(j); }
    if (!move.length) return;
    const free = [];
    for (let j = 0; j < mine.length; j++) if (!safe.has(j) && !mine[j]) free.push(j);
    for (let k = 0; k < move.length; k++) mine[free[k]] = 1;
    computeAdj();
  }

  function fit() { AppKit.host.resizeClient(W, H + document.getElementById("Menu").offsetHeight); }

  function startTimer() {
    playing = true;
    elapsed = 1;
    timer = setInterval(() => { if (elapsed < 999) { elapsed++; drawLed(W - 56, 16, elapsed); } }, 1000);
  }

  function reveal(i) {
    if (over || state[i] === 1 || state[i] === 2) return;
    if (firstClick) {
      firstClick = false;
      protectStart(i); // Give opening click a blank-ish 3x3, like polished modern versions.
      startTimer();
    }
    if (mine[i]) return lose(i);
    flood(i);
    checkWin();
  }
  function flood(i) {
    const stack = [i];
    while (stack.length) {
      const k = stack.pop();
      if (state[k] === 1 || state[k] === 2 || mine[k]) continue;
      state[k] = 1; opened++;
      if (adj[k] === 0) for (const j of neighbors(k)) if (state[j] !== 1 && state[j] !== 2) { if (state[j] === 3) state[j] = 0; stack.push(j); }
    }
  }
  function chord(i) {
    if (over || state[i] !== 1 || !adj[i]) return;
    const nb = neighbors(i);
    const f = nb.filter((j) => state[j] === 2).length;
    if (f !== adj[i]) return;
    let hit = -1;
    for (const j of nb) {
      if (state[j] === 2 || state[j] === 1) continue;
      if (mine[j]) { if (hit < 0) hit = j; continue; }
      flood(j);
    }
    if (hit >= 0) return lose(hit);
    checkWin();
  }
  function lose(i) {
    over = true; boomAt = i; face = "dead";
    clearInterval(timer);
    for (let j = 0; j < mine.length; j++) if (mine[j] && state[j] !== 2) state[j] = 1;
  }
  function checkWin() {
    if (opened !== cols * rows - mines) return;
    over = true; won = true; face = "cool";
    clearInterval(timer);
    for (let j = 0; j < mine.length; j++) if (mine[j]) state[j] = 2;
    flags = mines;
    draw();
    if (LEVELS[cfg.level]) {
      const best = loadBest();
      if (elapsed < best[cfg.level].time) setTimeout(() => askName(elapsed), 50);
    }
  }
  function toggleMark(i) {
    if (over || state[i] === 1) return;
    if (state[i] === 0) { state[i] = 2; flags++; }
    else if (state[i] === 2) { flags--; state[i] = cfg.marks ? 3 : 0; }
    else state[i] = 0;
  }

  // ---------- Drawing ----------
  function px(x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
  function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
  // Bevel of width w around (x1,y1)-(x2,y2) inclusive. Raised: light top/left. Corner pixels go to the darker side.
  function bevel(x1, y1, x2, y2, w, raised) {
    const a = raised ? C.hi : C.lo, b = raised ? C.lo : C.hi;
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      const dHi = Math.min(y - y1, x - x1), dLo = Math.min(y2 - y, x2 - x);
      if (Math.min(dHi, dLo) >= w) { x = Math.max(x, x2 - w); continue; }
      px(x, y, dHi < dLo ? a : b);
    }
  }
  function pattern(x, y, rowsArr, colors) {
    for (let r = 0; r < rowsArr.length; r++) {
      const s = rowsArr[r];
      for (let c = 0; c < s.length; c++) { const col = colors[s[c]]; if (col) px(x + c, y + r, col); }
    }
  }
  const PAL = { "#": C.black, W: C.hi, R: C.red, Y: C.yellow, O: C.olive };

  function drawLed(x, y, value) {
    let s;
    if (value < 0) { const v = Math.min(99, -value); s = "-" + String(v).padStart(2, "0"); }
    else s = String(Math.min(999, value)).padStart(3, "0");
    for (let k = 0; k < 3; k++) {
      const ch = s[k], segs = DIGIT_SEGS[ch === "-" ? 10 : +ch];
      const ox = x + k * LED_W;
      rect(ox, y, LED_W, LED_H, C.black);
      for (let yy = 0; yy < LED_H - 2; yy++) for (let xx = 0; xx < LED_W; xx++) {
        for (const sg of "abcdefg") {
          if (!SEGS[sg](xx, yy)) continue;
          if (segs.includes(sg)) px(ox + xx, y + yy + 1, C.red);
          else if ((xx + yy) % 2 === 1) px(ox + xx, y + yy + 1, "#800000");
          break;
        }
      }
    }
  }
  function drawFace() {
    const x = ((W - BTN) >> 1) - 1, y = TOP_LED - 1;
    rect(x, y, 26, 26, C.face);
    // 1px gray frame, then a 2px raised bevel (or flat when pressed).
    ctx.strokeStyle = C.lo; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 25, 25);
    const f = facePressed ? "smile" : held && held.mode !== "face" ? "oh" : face;
    if (facePressed) {
      rect(x + 1, y + 1, 24, 1, C.lo); rect(x + 1, y + 1, 1, 24, C.lo);
      pattern(x + 6, y + 6, FACES.smile, PAL);
    } else {
      bevel(x + 1, y + 1, x + 24, y + 24, 2, true);
      pattern(x + 5, y + 5, FACES[f], PAL);
    }
  }
  function drawCell(i) {
    const c = i % cols, r = (i / cols) | 0;
    const x = GRID_X + c * BLK, y = GRID_Y + r * BLK;
    const s = state[i];
    const pressed = held && isPressed(i);
    if (s === 1 || pressed && (s === 0 || s === 3)) {
      rect(x, y, BLK, BLK, i === boomAt ? C.red : C.face);
      rect(x, y, BLK, 1, C.lo); rect(x, y, 1, BLK, C.lo);
      if (s === 1) {
        if (mine[i]) pattern(x, y, MINE, PAL);
        else if (adj[i]) pattern(x, y + 3, GLYPHS[adj[i]], { X: NUM[adj[i]] });
      } else if (s === 3) pattern(x + 1, y + 1, QUEST, PAL);
      return;
    }
    rect(x, y, BLK, BLK, C.face);
    bevel(x, y, x + 15, y + 15, 2, true);
    if (s === 2) {
      if (over && !won && !mine[i]) { rect(x, y, BLK, BLK, C.face); rect(x, y, BLK, 1, C.lo); rect(x, y, 1, BLK, C.lo); pattern(x, y, WRONG, PAL); }
      else pattern(x, y, FLAG, PAL);
    } else if (s === 3) pattern(x, y, QUEST, PAL);
  }
  function isPressed(i) {
    if (!held || !held.cell && held.cell !== 0 || held.cell < 0 || over) return false;
    if (held.mode === "reveal") return i === held.cell;
    if (held.mode === "chord") { if (i === held.cell) return true; return neighbors(held.cell).includes(i); }
    return false;
  }
  function draw() {
    rect(0, 0, W, H, C.face);
    bevel(0, 0, W - 1, H - 1, 3, true);
    bevel(9, 9, W - 10, 45, 2, false);
    bevel(16, 15, 56, 39, 1, false);
    bevel(W - 57, 15, W - 17, 39, 1, false);
    bevel(9, 52, W - 10, H - 10, 3, false);
    drawLed(17, 16, mines - flags);
    drawLed(W - 56, 16, elapsed);
    drawFace();
    for (let i = 0; i < cols * rows; i++) drawCell(i);
  }

  // ---------- Input ----------
  function hit(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) * W / r.width), y = Math.floor((e.clientY - r.top) * H / r.height);
    const fx = ((W - BTN) >> 1) - 1;
    if (x >= fx && x < fx + 26 && y >= TOP_LED - 1 && y < TOP_LED + 25) return { face: true };
    const c = Math.floor((x - GRID_X) / BLK), rr = Math.floor((y - GRID_Y) / BLK);
    if (x >= GRID_X && y >= GRID_Y && c >= 0 && rr >= 0 && c < cols && rr < rows) return { cell: idx(c, rr) };
    return { cell: -1 };
  }
  let downButtons = 0, chordDone = false, longPress = null;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    AppKit.closeMenus();
    canvas.setPointerCapture(e.pointerId);
    downButtons = e.buttons || 1;
    const h = hit(e);
    if (h.face) {
      if (e.button === 0) { held = { mode: "face" }; facePressed = true; drawFace(); }
      return;
    }
    if (over) return;
    if (e.pointerType === "touch") {
      held = { mode: "reveal", cell: h.cell };
      longPress = setTimeout(() => { longPress = null; if (held && held.cell >= 0) { toggleMark(held.cell); held = null; draw(); navigator.vibrate?.(30); } }, 420);
      draw();
      return;
    }
    const both = (downButtons & 3) === 3 || (downButtons & 4) || (e.button === 0 && e.shiftKey);
    if (both) { held = { mode: "chord", cell: h.cell }; chordDone = false; }
    else if (e.button === 2) { if (h.cell >= 0) toggleMark(h.cell); held = null; }
    else if (e.button === 0) held = { mode: "reveal", cell: h.cell };
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (cheat && !held) { const h = hit(e); px(0, 0, h.cell >= 0 && mine[h.cell] ? "#000" : "#fff"); }
    if (!held) return;
    const h = hit(e);
    if (held.mode === "face") { const p = !!h.face; if (p !== facePressed) { facePressed = p; drawFace(); } return; }
    if (h.cell !== held.cell) {
      if (longPress) { clearTimeout(longPress); longPress = null; }
      held.cell = h.face ? -1 : h.cell; draw();
    }
  });
  const up = (e) => {
    if (longPress) { clearTimeout(longPress); longPress = null; }
    if (!held) { downButtons = e.buttons; return; }
    const h = hit(e);
    const mode = held.mode;
    if (mode === "face") {
      held = null; facePressed = false;
      if (h.face) newGame(); else drawFace();
      return;
    }
    // Upgrade to a chord if the other button got pressed while holding.
    if (mode === "reveal" && (e.buttons & 2)) { held.mode = "chord"; draw(); return; }
    const cell = held.cell;
    held = null;
    if (cell >= 0 && !over) {
      if (mode === "chord") { if (!chordDone) { chordDone = true; chord(cell); } }
      else reveal(cell);
    }
    draw();
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", () => { held = null; facePressed = false; draw(); });
  // Right button pressed while left is down arrives as pointermove with changed buttons in Chromium.
  canvas.addEventListener("pointermove", (e) => {
    if (held && held.mode === "reveal" && (e.buttons & 3) === 3) { held.mode = "chord"; draw(); }
  });

  addEventListener("keydown", (e) => {
    if (e.key === "F2") { e.preventDefault(); newGame(); return; }
    if (e.key === "F1") { e.preventDefault(); help(); return; }
    if (e.key.length === 1 && /[a-z]/i.test(e.key)) { xyzzy = (xyzzy + e.key.toLowerCase()).slice(-5); }
    if (e.key === "Enter" && e.shiftKey && xyzzy === "xyzzy") { cheat = !cheat; }
  });

  // ---------- Best times ----------
  function loadBest() {
    const def = { time: 999, name: "Anonymous" };
    const b = AppKit.load("rbx.mines.best", {});
    for (const k of Object.keys(LEVELS)) b[k] = Object.assign({}, def, b[k]);
    return b;
  }
  function askName(t) {
    const n = document.createElement("div");
    n.innerHTML = `<div style="width:180px;text-align:center;line-height:1.4">You have the fastest time<br>for ${LEVELS[cfg.level].label.toLowerCase()} level.<br>Please enter your name.</div>
      <div style="text-align:center;margin-top:10px"><input type="text" maxlength="32" value="${AppKit.esc(AppKit.load("rbx.mines.lastName", "Anonymous"))}" style="width:150px"></div>`;
    AppKit.dialog({
      title: "", node: n,
      buttons: [{ label: "OK", default: true, cancel: true, action: () => {
        const name = n.querySelector("input").value.trim() || "Anonymous";
        const b = loadBest();
        b[cfg.level] = { time: t, name };
        AppKit.save("rbx.mines.best", b);
        AppKit.save("rbx.mines.lastName", name);
      } }],
    }).then(bestTimes);
  }
  function bestTimes() {
    const n = document.createElement("div");
    const render = () => {
      const b = loadBest();
      n.innerHTML = `<table class="best" style="border-collapse:collapse">${Object.entries(LEVELS).map(([k, L]) =>
        `<tr><td>${L.label}:</td><td>${b[k].time} seconds</td><td>${AppKit.esc(b[k].name)}</td></tr>`).join("")}</table>`;
    };
    render();
    AppKit.dialog({
      title: "Fastest Mine Sweepers", node: n,
      buttons: [
        { label: "Reset Scores", action: () => { AppKit.save("rbx.mines.best", {}); render(); return false; } },
        { label: "OK", default: true, cancel: true },
      ],
    });
  }
  function custom() {
    const n = document.createElement("div");
    n.className = "custom";
    n.innerHTML = `<label for="cH"><u>H</u>eight:</label><input id="cH" type="number" min="9" max="24" value="${rows}">
      <label for="cW"><u>W</u>idth:</label><input id="cW" type="number" min="9" max="30" value="${cols}">
      <label for="cM"><u>M</u>ines:</label><input id="cM" type="number" min="10" max="667" value="${mines}">`;
    AppKit.dialog({
      title: "Custom Field", node: n,
      buttons: [{ label: "OK", default: true, action: () => {
        const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v) || a));
        const h = clamp(n.querySelector("#cH").value, 9, 24), w = clamp(n.querySelector("#cW").value, 9, 30);
        const m = clamp(n.querySelector("#cM").value, 10, (w - 1) * (h - 1));
        Object.assign(cfg, { level: "custom", w, h, m });
        saveCfg(); newGame();
      } }, { label: "Cancel", cancel: true }],
    });
  }
  function help() {
    AppKit.alert("Minesweeper Help",
      "Uncover all the squares that don't have mines.\n\n" +
      "Left-click a square to uncover it. The number tells you how many mines touch that square.\n" +
      "Your first click protects its 3x3 area and starts the timer.\n" +
      "Right-click to flag a mine (right-click again for ?).\n" +
      "Click a number with both buttons (or the middle button) to uncover its neighbors once enough are flagged.\n\n" +
      "On a touch screen, press and hold to place a flag.", "info");
  }
  function about() {
    AppKit.alert("About Minesweeper", "Minesweeper\nRBXBanland Edition, Version 4.10.1998\n\nA faithful recreation for the RBXBanland desktop.\nAll pixels hand placed.", "info");
  }
  function saveCfg() { AppKit.save("rbx.mines.cfg", cfg); }
  function setLevel(l) { cfg.level = l; saveCfg(); newGame(); }

  AppKit.menubar(document.getElementById("Menu"), [
    { label: "&Game", items: () => [
      { label: "&New", key: "F2", action: newGame },
      "-",
      { label: "&Beginner", checked: () => cfg.level === "beginner", action: () => setLevel("beginner") },
      { label: "&Intermediate", checked: () => cfg.level === "intermediate", action: () => setLevel("intermediate") },
      { label: "&Expert", checked: () => cfg.level === "expert", action: () => setLevel("expert") },
      { label: "&Custom...", checked: () => cfg.level === "custom", action: custom },
      "-",
      { label: "&Marks (?)", checked: () => cfg.marks, action: () => { cfg.marks = !cfg.marks; saveCfg(); } },
      { label: "Co&lor", checked: () => cfg.color, action: () => { cfg.color = !cfg.color; saveCfg(); applyColor(); } },
      "-",
      { label: "Bes&t Times...", action: bestTimes },
      "-",
      { label: "E&xit", action: () => AppKit.host.close() },
    ] },
    { label: "&Help", items: [
      { label: "&Contents", key: "F1", action: help },
      { label: "&Search for Help on...", action: help },
      { label: "&Using Help", action: help },
      "-",
      { label: "&About Minesweeper...", action: about },
    ] },
  ]);
  function applyColor() { document.documentElement.classList.toggle("mono", !cfg.color); }
  applyColor();
  newGame();
  window.__mines = { get state() { return { cols, rows, mines, opened, over, won, elapsed, flags }; }, mine: () => mine, reveal: (i) => { reveal(i); draw(); } };
})();
