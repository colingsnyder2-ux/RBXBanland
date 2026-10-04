// Paint, in the style of MS Paint for Windows 98. Everything is rasterized by hand (no anti-aliasing), like the original.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const PALETTE = [
    "#000000", "#808080", "#800000", "#808000", "#008000", "#008080", "#000080", "#800080", "#808040", "#004040", "#0080ff", "#004080", "#8000ff", "#804000",
    "#ffffff", "#c0c0c0", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ffff80", "#00ff80", "#80ffff", "#8080ff", "#ff0080", "#ff8040",
  ];
  const TOOLS = [
    { id: "free", name: "Free-Form Select", help: "Selects a free-form part of the picture to move, copy, or edit.", cursor: "precise" },
    { id: "select", name: "Select", help: "Selects a rectangular part of the picture to move, copy, or edit.", cursor: "precise" },
    { id: "eraser", name: "Eraser/Color Eraser", help: "Erases a portion of the picture, using the selected eraser shape.", cursor: "none" },
    { id: "fill", name: "Fill With Color", help: "Fills an area with the current drawing color.", cursor: "fill-bucket" },
    { id: "pick", name: "Pick Color", help: "Picks up a color from the picture for drawing.", cursor: "eye-dropper" },
    { id: "zoom", name: "Magnifier", help: "Changes the magnification.", cursor: "magnifier" },
    { id: "pencil", name: "Pencil", help: "Draws a free-form line one pixel wide.", cursor: "pencil" },
    { id: "brush", name: "Brush", help: "Draws using a brush with the selected shape and size.", cursor: "precise-dotted" },
    { id: "air", name: "Airbrush", help: "Draws using an airbrush of the selected size.", cursor: "airbrush" },
    { id: "text", name: "Text", help: "Inserts text into the picture.", cursor: "precise" },
    { id: "line", name: "Line", help: "Draws a straight line with the selected line width.", cursor: "precise" },
    { id: "curve", name: "Curve", help: "Draws a curved line with the selected line width.", cursor: "precise" },
    { id: "rect", name: "Rectangle", help: "Draws a rectangle with the selected fill style.", cursor: "precise" },
    { id: "poly", name: "Polygon", help: "Draws a polygon with the selected fill style.", cursor: "precise" },
    { id: "ellipse", name: "Ellipse", help: "Draws an ellipse with the selected fill style.", cursor: "precise" },
    { id: "rrect", name: "Rounded Rectangle", help: "Draws a rounded rectangle with the selected fill style.", cursor: "precise" },
  ];
  const HOT = { precise: [16, 16], "precise-dotted": [16, 16], "fill-bucket": [8, 22], "eye-dropper": [9, 22], magnifier: [16, 16], pencil: [13, 23], airbrush: [7, 22] };
  const DEFAULT_HELP = "For Help, click Help Topics on the Help Menu.";
  const BRUSHES = [["circle", 7], ["circle", 4], ["circle", 1], ["square", 8], ["square", 5], ["square", 2], ["fslash", 8], ["fslash", 5], ["fslash", 2], ["bslash", 8], ["bslash", 5], ["bslash", 2]];

  // ---------- State ----------
  const opt = Object.assign({ brush: 1, eraser: 1, air: 0, line: 0, fill: 0, trans: 0, zoomOpt: 0 }, AppKit.load("rbx.paint.opts", {}));
  let tool = "pencil", prevTool = "pencil";
  let fg = "#000000", bg = "#ffffff";
  let W = 0, H = 0, zoom = 1;
  let M = null; // main raster {d: ImageData, u: Uint32Array}
  let undo = [], redo = [];
  let fileName = "untitled";
  let dirty = false;
  const img = $("#Img"), over = $("#Over"), ictx = img.getContext("2d"), octx = over.getContext("2d");

  // ---------- Raster helpers ----------
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  function pack(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return littleEndian ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
  }
  function unpack(u) {
    const r = littleEndian ? u & 255 : u >>> 24, g = littleEndian ? (u >> 8) & 255 : (u >> 16) & 255, b = littleEndian ? (u >> 16) & 255 : (u >> 8) & 255;
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function raster(w, h, data) {
    const d = data || new ImageData(w, h);
    return { d, u: new Uint32Array(d.data.buffer), w, h };
  }
  function cloneR(R) { return raster(R.w, R.h, new ImageData(new Uint8ClampedArray(R.d.data), R.w, R.h)); }
  function setPx(R, x, y, c) { if (x >= 0 && y >= 0 && x < R.w && y < R.h) R.u[y * R.w + x] = c; }
  function getPx(R, x, y) { return R.u[y * R.w + x]; }
  function stamp(R, cx, cy, shape, size, c) {
    if (shape === "point" || size <= 1) { setPx(R, cx, cy, c); return; }
    if (shape === "square") { const o = Math.floor(size / 2); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) setPx(R, cx - o + x, cy - o + y, c); return; }
    if (shape === "fslash") { const o = Math.floor(size / 2); for (let i = 0; i < size; i++) setPx(R, cx - o + i, cy + o - i, c); return; }
    if (shape === "bslash") { const o = Math.floor(size / 2); for (let i = 0; i < size; i++) setPx(R, cx - o + i, cy - o + i, c); return; }
    // circle
    const r = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - r, dy = y + 0.5 - r;
      if (dx * dx + dy * dy <= r * r + 0.5) setPx(R, cx - Math.floor(r) + x, cy - Math.floor(r) + y, c);
    }
  }
  function line(R, x0, y0, x1, y1, fn) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) {
      fn(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function thickLine(R, x0, y0, x1, y1, w, c) { line(R, x0, y0, x1, y1, (x, y) => stamp(R, x, y, w > 1 ? "circle" : "point", w, c)); }
  // Shape masks: inside(x, y) tests on pixel centers.
  function ellipseInside(x0, y0, x1, y1, inset) {
    const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
    const rx = (x1 - x0 + 1) / 2 - inset, ry = (y1 - y0 + 1) / 2 - inset;
    if (rx <= 0 || ry <= 0) return () => false;
    return (x, y) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; };
  }
  function rectInside(x0, y0, x1, y1, inset) {
    return (x, y) => x >= x0 + inset && x <= x1 - inset && y >= y0 + inset && y <= y1 - inset;
  }
  function rrectInside(x0, y0, x1, y1, inset) {
    const r = Math.max(0, Math.min(8, (x1 - x0 + 1) / 2, (y1 - y0 + 1) / 2) - inset);
    const ax = x0 + inset, ay = y0 + inset, bx = x1 - inset, by = y1 - inset;
    return (x, y) => {
      if (x < ax || x > bx || y < ay || y > by) return false;
      const px = x + 0.5, py = y + 0.5;
      const cx = px < ax + r ? ax + r : px > bx + 1 - r ? bx + 1 - r : px;
      const cy = py < ay + r ? ay + r : py > by + 1 - r ? by + 1 - r : py;
      const dx = px - cx, dy = py - cy;
      return dx * dx + dy * dy <= r * r;
    };
  }
  // Draws a closed shape by mask. style 0 outline (stroke color), 1 outline + fill (fill color), 2 fill only (stroke color).
  function drawShape(R, kind, x0, y0, x1, y1, lw, style, stroke, fillc) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    const mk = kind === "ellipse" ? ellipseInside : kind === "rrect" ? rrectInside : rectInside;
    const outer = mk(x0, y0, x1, y1, 0), inner = mk(x0, y0, x1, y1, style === 2 ? 0 : lw);
    for (let y = Math.max(0, y0); y <= Math.min(R.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(R.w - 1, x1); x++) {
      if (!outer(x, y)) continue;
      const inn = inner(x, y);
      if (style === 2) { R.u[y * R.w + x] = stroke; continue; }
      if (!inn) R.u[y * R.w + x] = stroke;
      else if (style === 1) R.u[y * R.w + x] = fillc;
    }
  }
  function polyFill(R, pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.max(0, minY); y <= Math.min(R.h - 1, maxY); y++) {
      const xs = [];
      const yc = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        const a0 = ay + 0.5, b0 = by + 0.5;
        if ((a0 <= yc && b0 > yc) || (b0 <= yc && a0 > yc)) xs.push(ax + 0.5 + (yc - a0) / (b0 - a0) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) setPx(R, x, y, c);
    }
  }
  function floodFill(R, sx, sy, c) {
    const target = getPx(R, sx, sy);
    if (target === c) return;
    const w = R.w, h = R.h, u = R.u;
    const stack = [[sx, sy]];
    while (stack.length) {
      let [x, y] = stack.pop();
      while (x >= 0 && u[y * w + x] === target) x--;
      x++;
      let up = false, down = false;
      while (x < w && u[y * w + x] === target) {
        u[y * w + x] = c;
        if (y > 0) { const m = u[(y - 1) * w + x] === target; if (m && !up) { stack.push([x, y - 1]); up = true; } else if (!m) up = false; }
        if (y < h - 1) { const m = u[(y + 1) * w + x] === target; if (m && !down) { stack.push([x, y + 1]); down = true; } else if (!m) down = false; }
        x++;
      }
    }
  }
  function bezier(p0, p1, p2, p3) {
    const out = [];
    const n = Math.max(8, Math.ceil((Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1])) / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = (1 - t) ** 3, b = 3 * t * (1 - t) ** 2, c = 3 * t * t * (1 - t), d = t ** 3;
      out.push([Math.round(a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0]), Math.round(a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])]);
    }
    return out;
  }

  // ---------- Image management ----------
  function newImage(w, h, fillHex = "#ffffff") {
    W = w; H = h;
    M = raster(W, H);
    M.u.fill(pack(fillHex));
    sizeCanvases(); render();
  }
  function sizeCanvases() {
    for (const c of [img, over]) { c.width = W; c.height = H; c.style.width = W * zoom + "px"; c.style.height = H * zoom + "px"; }
    O = raster(W, H);
    placeGrips();
    updateSel();
  }
  let O = null; // overlay raster
  function render() { ictx.putImageData(M.d, 0, 0); }
  function clearOverlay() { O.u.fill(0); octx.clearRect(0, 0, W, H); }
  function showOverlay() { octx.putImageData(O.d, 0, 0); }
  function pushUndo() {
    undo.push({ r: cloneR(M) });
    if (undo.length > 30) undo.shift();
    redo = [];
    dirty = true;
    setTitle();
  }
  function doUndo() {
    if (sel) { if (sel.lifted) { cancelSelection(); return; } dropSelection(); }
    const s = undo.pop();
    if (!s) return;
    redo.push({ r: cloneR(M) });
    M = s.r; W = M.w; H = M.h; sizeCanvases(); render(); saveDraft();
  }
  function doRedo() {
    const s = redo.pop();
    if (!s) return;
    undo.push({ r: cloneR(M) });
    M = s.r; W = M.w; H = M.h; sizeCanvases(); render(); saveDraft();
  }
  let draftTimer = 0;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try { localStorage.setItem("rbx.paint.draft", JSON.stringify({ name: fileName, png: img.toDataURL("image/png") })); } catch { /* full */ }
    }, 600);
  }
  async function loadDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem("rbx.paint.draft") || "null"); } catch { /* ignore */ }
    if (!d || !d.png || !/^data:image\/png;base64,/.test(d.png)) return false;
    try {
      const blob = await (await fetch(d.png)).blob();
      const bmp = await createImageBitmap(blob);
      loadBitmap(bmp);
      fileName = d.name || "untitled";
      return true;
    } catch { return false; }
  }
  function loadBitmap(bmp) {
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(bmp, 0, 0);
    W = c.width; H = c.height;
    M = raster(W, H, x.getImageData(0, 0, W, H));
    sizeCanvases(); render();
  }
  function setTitle() { document.title = `${dirty ? "* " : ""}${fileName} - Paint`; }

  // ---------- Selection ----------
  let sel = null; // { x, y, w, h, r (raster of contents), mask, lifted }
  const selCanvas = $("#SelCanvas"), selBox = $("#SelBox");
  function updateSel() {
    if (!sel) { selCanvas.hidden = true; selBox.hidden = true; $("#SizeInfo").textContent = ""; return; }
    selBox.hidden = false;
    Object.assign(selBox.style, { left: sel.x * zoom + "px", top: sel.y * zoom + "px", width: sel.w * zoom + "px", height: sel.h * zoom + "px" });
    selBox.classList.toggle("lift", !!sel.lifted);
    if (sel.lifted) {
      selCanvas.hidden = false;
      selCanvas.width = sel.w; selCanvas.height = sel.h;
      Object.assign(selCanvas.style, { left: sel.x * zoom + "px", top: sel.y * zoom + "px", width: sel.w * zoom + "px", height: sel.h * zoom + "px" });
      selCanvas.getContext("2d").putImageData(displaySel().d, 0, 0);
    } else selCanvas.hidden = true;
    $("#SizeInfo").textContent = `${sel.w}x${sel.h}`;
  }
  // In transparent mode, background-colored pixels are see-through.
  function displaySel() {
    if (!opt.trans) return sel.r;
    const R = cloneR(sel.r), key = pack(bg);
    for (let i = 0; i < R.u.length; i++) if (R.u[i] === key) R.u[i] = 0;
    return R;
  }
  function liftSelection(keepOriginal) {
    if (!sel || sel.lifted) return;
    pushUndo();
    const R = raster(sel.w, sel.h), bgc = pack(bg);
    for (let y = 0; y < sel.h; y++) for (let x = 0; x < sel.w; x++) {
      const sx = sel.x + x, sy = sel.y + y;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      if (sel.mask && !sel.mask[y * sel.w + x]) continue;
      R.u[y * sel.w + x] = getPx(M, sx, sy);
      if (!keepOriginal) setPx(M, sx, sy, bgc);
    }
    sel.r = R; sel.lifted = true;
    render(); updateSel();
  }
  function dropSelection() {
    if (!sel) return;
    if (sel.lifted) {
      const D = displaySel();
      for (let y = 0; y < sel.h; y++) for (let x = 0; x < sel.w; x++) {
        const c = D.u[y * sel.w + x];
        if ((c >>> 0) === 0) continue;
        const ax = littleEndian ? c >>> 24 : c & 255;
        if (!ax) continue;
        setPx(M, sel.x + x, sel.y + y, c);
      }
      render(); saveDraft();
    }
    sel = null; updateSel();
  }
  function cancelSelection() {
    if (sel && sel.lifted && undo.length) { const s = undo.pop(); M = s.r; render(); }
    sel = null; updateSel();
  }
  function deleteSelection() {
    if (!sel) return;
    if (!sel.lifted) liftSelection(false);
    sel = null; updateSel(); render(); saveDraft();
  }
  let clipboard = null;
  function copySelection() {
    if (!sel) return;
    if (!sel.lifted) {
      const R = raster(sel.w, sel.h);
      for (let y = 0; y < sel.h; y++) for (let x = 0; x < sel.w; x++) {
        if (sel.mask && !sel.mask[y * sel.w + x]) continue;
        const sx = sel.x + x, sy = sel.y + y;
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) R.u[y * sel.w + x] = getPx(M, sx, sy);
      }
      clipboard = R;
    } else clipboard = cloneR(sel.r);
    // Also put it on the system clipboard when allowed.
    try {
      const c = document.createElement("canvas"); c.width = clipboard.w; c.height = clipboard.h;
      c.getContext("2d").putImageData(clipboard.d, 0, 0);
      c.toBlob((b) => { try { navigator.clipboard?.write?.([new ClipboardItem({ "image/png": b })]).catch(() => {}); } catch { /* ignore */ } });
    } catch { /* ignore */ }
  }
  function pasteRaster(R) {
    dropSelection();
    setTool(tool === "free" ? "free" : "select");
    pushUndo();
    const area = $("#Area");
    const x = Math.floor(area.scrollLeft / zoom), y = Math.floor(area.scrollTop / zoom);
    if (R.w > W || R.h > H) { resizeImage(Math.max(W, R.w), Math.max(H, R.h), false); }
    sel = { x, y, w: R.w, h: R.h, r: R, lifted: true };
    updateSel();
  }
  async function paste() {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const t = it.types.find((x) => x.startsWith("image/"));
          if (t) {
            const bmp = await createImageBitmap(await it.getType(t));
            const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
            const x = c.getContext("2d"); x.drawImage(bmp, 0, 0);
            pasteRaster(raster(c.width, c.height, x.getImageData(0, 0, c.width, c.height)));
            return;
          }
        }
      }
    } catch { /* permission denied: fall back to our own clipboard */ }
    if (clipboard) pasteRaster(cloneR(clipboard));
  }

  // ---------- Tools UI ----------
  const toolsEl = $("#Tools");
  TOOLS.forEach((t, i) => {
    const b = document.createElement("div");
    b.className = "tool"; b.dataset.tool = t.id; b.title = t.name;
    b.innerHTML = `<span style="background-position:${-i * 16}px 0"></span>`;
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); setTool(t.id); });
    b.addEventListener("pointerenter", () => help(t.help));
    b.addEventListener("pointerleave", () => help());
    toolsEl.appendChild(b);
  });
  function help(text) { $("#Help").textContent = text || DEFAULT_HELP; }
  function setTool(id) {
    if (id !== tool) {
      commitText();
      if (sel && id !== "select" && id !== "free") dropSelection();
      if (tool === "curve" || tool === "poly") finishPending();
    }
    if (id !== "pick") prevTool = id === "zoom" ? prevTool : id;
    tool = id;
    for (const b of toolsEl.children) b.classList.toggle("on", b.dataset.tool === id);
    renderOpts(); setCursor();
    $("#FontBar").hidden = id !== "text" || !textActive;
  }
  function setCursor() {
    const t = TOOLS.find((x) => x.id === tool);
    const c = t.cursor;
    if (c === "none") { $("#Stage").style.cursor = "none"; return; }
    const hs = HOT[c] || [16, 16];
    $("#Stage").style.cursor = `url("vendor/jspaint/cursor-${c}.png") ${hs[0]} ${hs[1]}, crosshair`;
  }
  function optCanvas(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = "#000"; draw(x); return c; }
  function renderOpts() {
    const box = $("#Opts");
    box.replaceChildren();
    const add = (el, on, fn) => { const o = document.createElement("div"); o.className = "opt" + (on ? " on" : ""); o.appendChild(el); o.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(); AppKit.save("rbx.paint.opts", opt); renderOpts(); }); box.appendChild(o); return o; };
    const div = (cls) => { const d = document.createElement("div"); d.className = cls; return d; };
    if (tool === "select" || tool === "free" || tool === "text") {
      add(div("opt-trans"), !opt.trans, () => { opt.trans = 0; updateSel(); textStyle(); });
      add(div("opt-trans t2"), !!opt.trans, () => { opt.trans = 1; updateSel(); textStyle(); });
    } else if (tool === "eraser") {
      [4, 6, 8, 10].forEach((s, i) => add(optCanvas(14, 12, (x) => x.fillRect(7 - s / 2, 6 - s / 2, s, s)), opt.eraser === i, () => { opt.eraser = i; }));
    } else if (tool === "zoom") {
      [1, 2, 6, 8].forEach((z, i) => { const d = div("opt-mag"); d.style.backgroundPosition = `${-i * 23}px 0`; add(d, zoom === z, () => setZoom(z)); });
    } else if (tool === "brush") {
      const g = div("opt-grid");
      box.appendChild(g);
      BRUSHES.forEach(([shape, size], i) => {
        const c = optCanvas(11, 11, () => {});
        const R = raster(11, 11); stamp(R, 5, 5, shape, size, pack("#000000")); c.getContext("2d").putImageData(R.d, 0, 0);
        const o = document.createElement("div"); o.className = "opt" + (opt.brush === i ? " on" : ""); o.appendChild(c);
        o.addEventListener("pointerdown", (e) => { e.preventDefault(); opt.brush = i; AppKit.save("rbx.paint.opts", opt); renderOpts(); });
        g.appendChild(o);
      });
    } else if (tool === "air") {
      const wrap = div("opt-grid"); wrap.style.gridTemplateColumns = "repeat(2, 19px)"; wrap.style.gridAutoRows = "24px"; wrap.style.gap = "2px 0";
      box.appendChild(wrap);
      [0, 1, 2].forEach((i) => {
        const d = div("opt-air"); d.style.backgroundPosition = `${-i * 24}px 0`;
        const o = document.createElement("div"); o.className = "opt" + (opt.air === i ? " on" : ""); o.style.width = "24px"; o.appendChild(d);
        if (i === 2) o.style.gridColumn = "1 / span 2";
        o.addEventListener("pointerdown", (e) => { e.preventDefault(); opt.air = i; AppKit.save("rbx.paint.opts", opt); renderOpts(); });
        wrap.appendChild(o);
      });
      wrap.style.transform = "scale(.8)";
    } else if (tool === "line" || tool === "curve") {
      [1, 2, 3, 4, 5].forEach((w, i) => { const d = div("opt-line"); d.innerHTML = `<i style="height:${w}px;margin-top:${(9 - w) >> 1}px"></i>`; add(d, opt.line === i, () => { opt.line = i; }); });
    } else if (["rect", "poly", "ellipse", "rrect"].includes(tool)) {
      [0, 1, 2].forEach((i) => add(optCanvas(37, 20, (x) => {
        if (i < 2) { x.fillRect(5, 4, 27, 1); x.fillRect(5, 15, 27, 1); x.fillRect(5, 4, 1, 12); x.fillRect(31, 4, 1, 12); }
        if (i === 1) { x.fillStyle = "#808080"; x.fillRect(6, 5, 25, 10); }
        if (i === 2) { x.fillStyle = "#808080"; x.fillRect(5, 4, 27, 12); }
      }), opt.fill === i, () => { opt.fill = i; }));
    }
  }
  const lineW = () => opt.line + 1;

  // ---------- Colors UI ----------
  const pal = $("#Palette");
  let palette = AppKit.load("rbx.paint.palette", PALETTE.slice());
  if (!Array.isArray(palette) || palette.length !== 28) palette = PALETTE.slice();
  function renderPalette() {
    pal.replaceChildren();
    palette.forEach((c, i) => {
      const s = document.createElement("div");
      s.className = "sw"; s.style.background = c; s.title = c;
      s.addEventListener("pointerdown", (e) => { e.preventDefault(); if (e.button === 2) bg = c; else fg = c; updateColors(); });
      s.addEventListener("dblclick", () => editColor(i));
      s.addEventListener("contextmenu", (e) => e.preventDefault());
      pal.appendChild(s);
    });
  }
  function updateColors() {
    $("#Current .fgc").style.background = fg;
    $("#Current .bgc").style.background = bg;
    document.documentElement.style.setProperty("--paper", bg);
    textStyle();
    if (sel && sel.lifted && opt.trans) updateSel();
  }
  $("#Current").addEventListener("click", () => { [fg, bg] = [bg, fg]; updateColors(); });
  function editColor(i) {
    const idx = i == null ? palette.indexOf(fg) : i;
    const n = document.createElement("div");
    const start = idx >= 0 ? palette[idx] : fg;
    n.innerHTML = `<div class="row">Pick a color:</div><div class="row"><input type="color" id="EC" value="${start}" style="width:120px;height:40px;padding:0;border:0"></div>
      <div class="row">Hex: <input type="text" id="ECH" value="${start}" style="width:80px"></div>`;
    AppKit.dialog({
      title: "Edit Colors", node: n,
      onOpen: (d) => { const a = $("#EC", d), b = $("#ECH", d); a.addEventListener("input", () => { b.value = a.value; }); b.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(b.value)) a.value = b.value; }); },
      buttons: [{ label: "OK", default: true, action: (d) => {
        const v = $("#EC", d).value.toLowerCase();
        if (idx >= 0) { palette[idx] = v; AppKit.save("rbx.paint.palette", palette); renderPalette(); }
        fg = v; updateColors();
      } }, { label: "Cancel", cancel: true }],
    });
  }

  // ---------- Zoom ----------
  function setZoom(z, cx, cy) {
    const area = $("#Area");
    zoom = z;
    sizeCanvases(); render(); showOverlayIfAny();
    if (textActive) layoutText();
    if (cx != null) { area.scrollLeft = cx * z - area.clientWidth / 2; area.scrollTop = cy * z - area.clientHeight / 2; }
    renderOpts();
  }
  function showOverlayIfAny() { if (O) showOverlay(); }

  // ---------- Grips (canvas resize) ----------
  function placeGrips() {
    const g = document.querySelectorAll(".grip");
    const w = W * zoom, h = H * zoom;
    Object.assign(g[0].style, { left: w + "px", top: (h / 2 - 1) + "px" });
    Object.assign(g[1].style, { left: (w / 2 - 1) + "px", top: h + "px" });
    Object.assign(g[2].style, { left: w + "px", top: h + "px" });
  }
  for (const g of document.querySelectorAll(".grip")) {
    g.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      g.setPointerCapture(e.pointerId);
      const dir = g.dataset.dir, ghost = $("#ResizeGhost");
      const r = $("#Stage").getBoundingClientRect();
      let nw = W, nh = H;
      ghost.hidden = false;
      const mv = (ev) => {
        if (dir.includes("e")) nw = Math.max(1, Math.round((ev.clientX - r.left) / zoom));
        if (dir.includes("s")) nh = Math.max(1, Math.round((ev.clientY - r.top) / zoom));
        Object.assign(ghost.style, { width: nw * zoom + "px", height: nh * zoom + "px" });
        $("#SizeInfo").textContent = `${nw}x${nh}`;
      };
      mv(e);
      const up = () => { g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); ghost.hidden = true; if (nw !== W || nh !== H) resizeImage(nw, nh, true); $("#SizeInfo").textContent = ""; };
      g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up);
    });
  }
  function resizeImage(nw, nh, undoable) {
    if (undoable) pushUndo();
    const N = raster(nw, nh);
    N.u.fill(pack(bg));
    for (let y = 0; y < Math.min(H, nh); y++) for (let x = 0; x < Math.min(W, nw); x++) N.u[y * nw + x] = M.u[y * W + x];
    M = N; W = nw; H = nh;
    sizeCanvases(); render(); saveDraft();
  }

  // ---------- Pointer handling on the canvas ----------
  const stage = $("#Stage");
  let drag = null; // { button, color, alt, x0, y0, lx, ly, ... }
  let pending = null; // curve / polygon in progress
  function toImg(e) {
    const r = img.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / zoom), Math.floor((e.clientY - r.top) / zoom)];
  }
  function colors(button) { return button === 2 ? [pack(bg), pack(fg), bg] : [pack(fg), pack(bg), fg]; }
  stage.addEventListener("contextmenu", (e) => e.preventDefault());
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".grip") || e.target === $("#TextBox")) return;
    if (e.button !== 0 && e.button !== 2) return;
    AppKit.closeMenus();
    stage.setPointerCapture(e.pointerId);
    const [x, y] = toImg(e);
    const [c, alt] = colors(e.button);
    // A second button cancels the drag in progress, like the original.
    if (drag) { cancelDrag(); return; }
    drag = { button: e.button, c, alt, x0: x, y0: y, lx: x, ly: y, shift: e.shiftKey, ctrl: e.ctrlKey };
    switch (tool) {
      case "pencil": pushUndo(); setPx(M, x, y, c); render(); break;
      case "brush": { pushUndo(); const [s, z] = BRUSHES[opt.brush]; stamp(M, x, y, s, z, c); render(); break; }
      case "eraser": pushUndo(); erase(x, y, x, y, e.button === 2); render(); break;
      case "air": pushUndo(); spray(x, y); drag.timer = setInterval(() => { spray(drag.lx, drag.ly); render(); }, 30); render(); break;
      case "fill": pushUndo(); if (x >= 0 && y >= 0 && x < W && y < H) floodFill(M, x, y, c); render(); saveDraft(); drag = null; break;
      case "pick": if (x >= 0 && y >= 0 && x < W && y < H) { const hex = unpack(getPx(M, x, y)); if (e.button === 2) bg = hex; else fg = hex; updateColors(); } drag = null; setTool(prevTool); break;
      case "zoom": drag = null; if (zoom === 1) setZoom(4, x, y); else setZoom(1); break;
      case "select": case "free": {
        if (sel && x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h && (!sel.mask || sel.lifted || sel.mask[(y - sel.y) * sel.w + (x - sel.x)])) {
          if (!sel.lifted) liftSelection(e.ctrlKey);
          else if (e.ctrlKey) { const keep = cloneR(sel.r), at = { x: sel.x, y: sel.y, w: sel.w, h: sel.h }; dropSelection(); sel = { ...at, r: keep, lifted: true }; }
          drag.move = { ox: x - sel.x, oy: y - sel.y };
        } else {
          dropSelection();
          drag.path = [[x, y]];
        }
        break;
      }
      case "text":
        if (textActive) { const inside = x >= textRect.x && y >= textRect.y && x < textRect.x + textRect.w && y < textRect.y + textRect.h; if (!inside) { commitText(); drag = null; } else drag = null; }
        break;
      case "curve":
        if (pending && pending.kind === "curve") { pending.stage++; pending[pending.stage === 1 ? "c1" : "c2"] = [x, y]; if (pending.stage === 1) pending.c2 = [x, y]; previewCurve(); }
        break;
      case "poly":
        if (pending && pending.kind === "poly") { drag.polyAdd = true; }
        break;
    }
    move(e);
  });
  stage.addEventListener("pointermove", move);
  function move(e) {
    const [x, y] = toImg(e);
    $("#Coords").textContent = x >= 0 && y >= 0 && x < W && y < H ? `${x},${y}` : "";
    if (tool === "eraser") eraserCursor(x, y);
    if (!drag) return;
    const d = drag;
    let tx = x, ty = y;
    if (e.shiftKey && ["line", "curve", "poly"].includes(tool)) [tx, ty] = snap45(d.x0, d.y0, x, y);
    if (e.shiftKey && ["rect", "ellipse", "rrect", "select"].includes(tool)) { const s = Math.max(Math.abs(x - d.x0), Math.abs(y - d.y0)); tx = d.x0 + Math.sign(x - d.x0 || 1) * s; ty = d.y0 + Math.sign(y - d.y0 || 1) * s; }
    switch (tool) {
      case "pencil": line(M, d.lx, d.ly, x, y, (px, py) => setPx(M, px, py, d.c)); render(); break;
      case "brush": { const [s, z] = BRUSHES[opt.brush]; line(M, d.lx, d.ly, x, y, (px, py) => stamp(M, px, py, s, z, d.c)); render(); break; }
      case "eraser": erase(d.lx, d.ly, x, y, d.button === 2); render(); break;
      case "air": break;
      case "line": clearOverlay(); thickLine(O, d.x0, d.y0, tx, ty, lineW(), d.c); showOverlay(); break;
      case "curve":
        if (!pending) { clearOverlay(); thickLine(O, d.x0, d.y0, tx, ty, lineW(), d.c); showOverlay(); d.tx = tx; d.ty = ty; }
        else { pending[pending.stage === 1 ? "c1" : "c2"] = [x, y]; if (pending.stage === 1) pending.c2 = [x, y]; previewCurve(); }
        break;
      case "rect": case "ellipse": case "rrect":
        clearOverlay(); drawShape(O, tool, d.x0, d.y0, tx, ty, lineW(), opt.fill, opt.fill === 2 ? d.alt : d.c, d.alt); showOverlay();
        if (opt.fill === 2) { /* fill only uses the other color, like Paint */ }
        $("#SizeInfo").textContent = `${Math.abs(tx - d.x0) + 1}x${Math.abs(ty - d.y0) + 1}`;
        break;
      case "poly":
        if (!pending) { clearOverlay(); thickLine(O, d.x0, d.y0, tx, ty, lineW(), d.c); showOverlay(); }
        else { previewPoly([tx, ty]); }
        d.tx = tx; d.ty = ty;
        break;
      case "select": case "free":
        if (d.move) { sel.x = x - d.move.ox; sel.y = y - d.move.oy; updateSel(); }
        else if (d.path) {
          if (tool === "select") { clearOverlay(); octx.clearRect(0, 0, W, H); showSelRect(d.x0, d.y0, tx, ty); }
          else { d.path.push([x, y]); clearOverlay(); for (let i = 1; i < d.path.length; i++) line(O, d.path[i - 1][0], d.path[i - 1][1], d.path[i][0], d.path[i][1], (px, py) => setPx(O, px, py, ((px + py) & 1) ? pack("#000000") : pack("#ffffff"))); showOverlay(); }
        }
        break;
      case "text":
        if (!textActive) { clearOverlay(); octx.clearRect(0, 0, W, H); showSelRect(d.x0, d.y0, x, y); }
        break;
    }
    d.lx = x; d.ly = y;
  }
  function showSelRect(x0, y0, x1, y1) {
    const ax = Math.min(x0, x1), ay = Math.min(y0, y1);
    selBox.hidden = false;
    Object.assign(selBox.style, { left: ax * zoom + "px", top: ay * zoom + "px", width: (Math.abs(x1 - x0) + 1) * zoom + "px", height: (Math.abs(y1 - y0) + 1) * zoom + "px" });
    $("#SizeInfo").textContent = `${Math.abs(x1 - x0) + 1}x${Math.abs(y1 - y0) + 1}`;
  }
  stage.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.timer) clearInterval(d.timer);
    const [x, y] = toImg(e);
    let tx = d.tx ?? x, ty = d.ty ?? y;
    if (e.shiftKey && ["rect", "ellipse", "rrect", "select"].includes(tool)) { const s = Math.max(Math.abs(x - d.x0), Math.abs(y - d.y0)); tx = d.x0 + Math.sign(x - d.x0 || 1) * s; ty = d.y0 + Math.sign(y - d.y0 || 1) * s; }
    else if (!["line", "curve", "poly"].includes(tool)) { tx = x; ty = y; }
    switch (tool) {
      case "pencil": case "brush": case "eraser": case "air": saveDraft(); break;
      case "line": pushUndo(); clearOverlay(); thickLine(M, d.x0, d.y0, tx, ty, lineW(), d.c); render(); saveDraft(); break;
      case "rect": case "ellipse": case "rrect":
        pushUndo(); clearOverlay(); drawShape(M, tool, d.x0, d.y0, tx, ty, lineW(), opt.fill, opt.fill === 2 ? d.alt : d.c, d.alt); render(); saveDraft();
        $("#SizeInfo").textContent = "";
        break;
      case "curve":
        if (!pending) { if (tx === d.x0 && ty === d.y0) { clearOverlay(); break; } pending = { kind: "curve", p0: [d.x0, d.y0], p3: [tx, ty], c1: [d.x0, d.y0], c2: [tx, ty], stage: 0, c: d.c }; previewCurve(); }
        else if (pending.stage >= 2) finishPending();
        break;
      case "poly":
        if (!pending) { pending = { kind: "poly", pts: [[d.x0, d.y0], [tx, ty]], c: d.c, alt: d.alt }; previewPoly(); }
        else if (d.polyAdd) {
          const p0 = pending.pts[0];
          const near = Math.abs(tx - p0[0]) <= 2 && Math.abs(ty - p0[1]) <= 2;
          if (near) finishPending(); else { pending.pts.push([tx, ty]); previewPoly(); }
        }
        break;
      case "select": case "free":
        if (d.move) { saveDraft(); break; }
        clearOverlay();
        if (tool === "select") {
          const ax = Math.max(0, Math.min(d.x0, tx)), ay = Math.max(0, Math.min(d.y0, ty));
          const bx = Math.min(W - 1, Math.max(d.x0, tx)), by = Math.min(H - 1, Math.max(d.y0, ty));
          if (bx > ax || by > ay) { sel = { x: ax, y: ay, w: bx - ax + 1, h: by - ay + 1, lifted: false }; }
          else sel = null;
          updateSel();
        } else if (d.path && d.path.length > 2) {
          const xs = d.path.map((p) => p[0]), ys = d.path.map((p) => p[1]);
          const ax = Math.max(0, Math.min(...xs)), ay = Math.max(0, Math.min(...ys)), bx = Math.min(W - 1, Math.max(...xs)), by = Math.min(H - 1, Math.max(...ys));
          const w = bx - ax + 1, h = by - ay + 1;
          if (w > 1 && h > 1) {
            const R = raster(w, h);
            polyFill(R, d.path.map(([px, py]) => [px - ax, py - ay]), 1);
            const mask = new Uint8Array(w * h);
            for (let i = 0; i < mask.length; i++) mask[i] = R.u[i] ? 1 : 0;
            sel = { x: ax, y: ay, w, h, mask, lifted: false };
          }
          updateSel();
        } else updateSel();
        break;
      case "text":
        if (!textActive && (Math.abs(x - d.x0) > 2 || Math.abs(y - d.y0) > 2)) startText(Math.min(d.x0, x), Math.min(d.y0, y), Math.abs(x - d.x0) + 1, Math.abs(y - d.y0) + 1);
        else if (!textActive) startText(d.x0, d.y0, 120, 30);
        break;
    }
  });
  stage.addEventListener("dblclick", () => { if (tool === "poly" && pending) finishPending(); });
  function cancelDrag() {
    if (drag && drag.timer) clearInterval(drag.timer);
    if (drag && ["pencil", "brush", "eraser", "air"].includes(tool) && undo.length) { M = undo.pop().r; render(); }
    drag = null; pending = null; clearOverlay();
    if (tool === "select" || tool === "free") updateSel();
  }
  function snap45(x0, y0, x, y) {
    const dx = x - x0, dy = y - y0, a = Math.atan2(dy, dx), s = Math.round(a / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy);
    if (Math.abs(Math.cos(s)) > 0.9) return [x, y0];
    if (Math.abs(Math.sin(s)) > 0.9) return [x0, y];
    const m = Math.round(len / Math.SQRT2);
    return [x0 + Math.sign(dx) * m, y0 + Math.sign(dy) * m];
  }
  function previewCurve() {
    const p = pending;
    clearOverlay();
    const pts = bezier(p.p0, p.c1, p.c2, p.p3);
    for (let i = 1; i < pts.length; i++) thickLine(O, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], lineW(), p.c);
    showOverlay();
  }
  function previewPoly(cursor) {
    const p = pending;
    clearOverlay();
    const pts = cursor ? [...p.pts, cursor] : p.pts;
    for (let i = 1; i < pts.length; i++) thickLine(O, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], lineW(), p.c);
    showOverlay();
  }
  function finishPending() {
    const p = pending;
    if (!p) return;
    pending = null;
    clearOverlay();
    pushUndo();
    if (p.kind === "curve") {
      const pts = bezier(p.p0, p.c1, p.c2, p.p3);
      for (let i = 1; i < pts.length; i++) thickLine(M, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], lineW(), p.c);
    } else if (p.kind === "poly") {
      const pts = p.pts;
      if (opt.fill >= 1) polyFill(M, pts, opt.fill === 1 ? p.alt : p.alt);
      if (opt.fill !== 2) for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; thickLine(M, a[0], a[1], b[0], b[1], lineW(), p.c); }
    }
    render(); saveDraft();
  }
  // Eraser: left button paints the background color; right button is the color eraser (fg -> bg only).
  function erase(x0, y0, x1, y1, colorMode) {
    const s = [4, 6, 8, 10][opt.eraser], b = pack(bg), f = pack(fg), o = Math.floor(s / 2);
    line(M, x0, y0, x1, y1, (cx, cy) => {
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const px = cx - o + x, py = cy - o + y;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        if (colorMode && getPx(M, px, py) !== f) continue;
        M.u[py * W + px] = b;
      }
    });
  }
  function eraserCursor(x, y) {
    clearOverlay();
    if (x < -10 || y < -10 || x > W + 10 || y > H + 10) { showOverlay(); return; }
    const s = [4, 6, 8, 10][opt.eraser], o = Math.floor(s / 2);
    const blk = pack("#000000"), b = pack(bg);
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) setPx(O, x - o + xx, y - o + yy, xx === 0 || yy === 0 || xx === s - 1 || yy === s - 1 ? blk : b);
    showOverlay();
  }
  stage.addEventListener("pointerleave", () => { if (tool === "eraser" && !drag) clearOverlay(); $("#Coords").textContent = ""; });
  function spray(cx, cy) {
    const r = [4, 8, 12][opt.air];
    for (let i = 0; i < r * 2.5; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      setPx(M, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), drag ? drag.c : pack(fg));
    }
  }

  // ---------- Text tool ----------
  const textBox = $("#TextBox");
  let textActive = false, textRect = null;
  const font = Object.assign({ face: "Arial", size: 12, b: false, i: false, u: false }, AppKit.load("rbx.paint.font", {}));
  const FACES = ["Arial", "Times New Roman", "Courier New", "Comic Sans MS", "Verdana", "Tahoma", "Georgia", "Impact", "Lucida Console", "Trebuchet MS", "Microsoft Sans Serif", "Wingdings"];
  $("#FontFace").innerHTML = FACES.map((f) => `<option${f === font.face ? " selected" : ""}>${f}</option>`).join("");
  $("#FontSize").innerHTML = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72].map((s) => `<option${s === font.size ? " selected" : ""}>${s}</option>`).join("");
  $("#FontFace").addEventListener("change", (e) => { font.face = e.target.value; textStyle(); textBox.focus(); });
  $("#FontSize").addEventListener("change", (e) => { font.size = +e.target.value; textStyle(); textBox.focus(); });
  for (const k of ["b", "i", "u"]) $("#Font" + k.toUpperCase()).addEventListener("click", () => { font[k] = !font[k]; textStyle(); textBox.focus(); });
  function fontCss(scale) { return `${font.i ? "italic " : ""}${font.b ? "bold " : ""}${font.size * 96 / 72 * scale}px "${font.face}"`; }
  function textStyle() {
    AppKit.save("rbx.paint.font", font);
    for (const k of ["b", "i", "u"]) $("#Font" + k.toUpperCase()).classList.toggle("on", font[k]);
    textBox.style.font = fontCss(zoom);
    textBox.style.lineHeight = "1.15";
    textBox.style.textDecoration = font.u ? "underline" : "none";
    textBox.style.color = fg;
    textBox.classList.toggle("opaque", !opt.trans);
  }
  function startText(x, y, w, h) {
    textActive = true;
    textRect = { x, y, w: Math.max(w, 20), h: Math.max(h, Math.ceil(font.size * 96 / 72 * 1.2)) };
    textBox.hidden = false; textBox.value = "";
    layoutText(); textStyle();
    $("#FontBar").hidden = false;
    setTimeout(() => textBox.focus());
  }
  function layoutText() {
    Object.assign(textBox.style, { left: textRect.x * zoom + "px", top: textRect.y * zoom + "px", width: textRect.w * zoom + "px", height: textRect.h * zoom + "px" });
  }
  textBox.addEventListener("input", () => {
    // Grow downward as needed, like Paint's text frame.
    const need = Math.ceil(textBox.scrollHeight / zoom);
    if (need > textRect.h) { textRect.h = need; layoutText(); }
  });
  function commitText() {
    if (!textActive) return;
    textActive = false;
    textBox.hidden = true;
    $("#FontBar").hidden = true;
    const text = textBox.value;
    if (!text.trim()) return;
    pushUndo();
    const c = document.createElement("canvas");
    c.width = textRect.w; c.height = textRect.h;
    const x = c.getContext("2d");
    x.font = fontCss(1); x.textBaseline = "top"; x.fillStyle = "#000";
    const lh = font.size * 96 / 72 * 1.15;
    // Wrap to the frame width.
    const lines = [];
    for (const para of text.split("\n")) {
      let cur = "";
      for (const word of para.split(/(\s+)/)) {
        if (x.measureText(cur + word).width > textRect.w - 2 && cur) { lines.push(cur); cur = word.trimStart(); } else cur += word;
      }
      lines.push(cur);
    }
    lines.forEach((l, i) => {
      x.fillText(l, 1, 1 + i * lh);
      if (font.u) { const w = x.measureText(l).width; x.fillRect(1, Math.round(1 + i * lh + font.size * 96 / 72), w, Math.max(1, Math.round(font.size / 12))); }
    });
    const data = x.getImageData(0, 0, c.width, c.height).data;
    const f = pack(fg), b = pack(bg);
    for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) {
      const a = data[(yy * c.width + xx) * 4 + 3];
      if (a >= 110) setPx(M, textRect.x + xx, textRect.y + yy, f);
      else if (!opt.trans) setPx(M, textRect.x + xx, textRect.y + yy, b);
    }
    render(); saveDraft();
  }
  // Font bar is draggable by its title.
  $(".fb-title").addEventListener("pointerdown", (e) => {
    const fb = $("#FontBar"), r = fb.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = (ev) => { fb.style.left = ev.clientX - ox + "px"; fb.style.top = ev.clientY - oy + "px"; fb.style.right = "auto"; };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });

  // ---------- Image menu operations ----------
  function transform(fn) {
    // Apply to the selection if there is one, else the whole image.
    if (sel) {
      if (!sel.lifted) liftSelection(false);
      sel.r = fn(sel.r); sel.w = sel.r.w; sel.h = sel.r.h; sel.mask = null; updateSel();
      return;
    }
    pushUndo();
    M = fn(M); W = M.w; H = M.h; sizeCanvases(); render(); saveDraft();
  }
  const flipH = (R) => { const N = raster(R.w, R.h); for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) N.u[y * R.w + x] = R.u[y * R.w + (R.w - 1 - x)]; return N; };
  const flipV = (R) => { const N = raster(R.w, R.h); for (let y = 0; y < R.h; y++) N.u.set(R.u.subarray((R.h - 1 - y) * R.w, (R.h - y) * R.w), y * R.w); return N; };
  const rot90 = (R) => { const N = raster(R.h, R.w); for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) N.u[x * R.h + (R.h - 1 - y)] = R.u[y * R.w + x]; return N; };
  const invert = (R) => { const N = cloneR(R); const m = littleEndian ? 0x00ffffff : 0xffffff00; for (let i = 0; i < N.u.length; i++) N.u[i] = (N.u[i] ^ m) >>> 0; return N; };
  const stretch = (sx, sy) => (R) => { const nw = Math.max(1, Math.round(R.w * sx)), nh = Math.max(1, Math.round(R.h * sy)); const N = raster(nw, nh); for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) N.u[y * nw + x] = R.u[Math.min(R.h - 1, Math.floor(y / sy)) * R.w + Math.min(R.w - 1, Math.floor(x / sx))]; return N; };
  function flipRotateDialog() {
    const n = document.createElement("div");
    n.innerHTML = `<fieldset><legend>Flip or rotate</legend>
      <div class="row"><label><input type="radio" name="fr" value="h" checked> Flip horizontal</label></div>
      <div class="row"><label><input type="radio" name="fr" value="v"> Flip vertical</label></div>
      <div class="row"><label><input type="radio" name="fr" value="r"> Rotate by angle</label></div>
      <div class="row" style="padding-left:20px;gap:12px"><label><input type="radio" name="ang" value="90" checked> 90&deg;</label><label><input type="radio" name="ang" value="180"> 180&deg;</label><label><input type="radio" name="ang" value="270"> 270&deg;</label></div></fieldset>`;
    AppKit.dialog({ title: "Flip and Rotate", node: n, buttons: [{ label: "OK", default: true, action: (d) => {
      const v = $("input[name=fr]:checked", d).value, a = +$("input[name=ang]:checked", d).value;
      if (v === "h") transform(flipH); else if (v === "v") transform(flipV);
      else transform((R) => { for (let k = 0; k < a / 90; k++) R = rot90(R); return R; });
    } }, { label: "Cancel", cancel: true }] });
  }
  function stretchDialog() {
    const n = document.createElement("div");
    n.innerHTML = `<fieldset><legend>Stretch</legend><div class="row">Horizontal: <input type="number" id="SH" value="100" min="1" max="500" style="width:56px"> %</div>
      <div class="row">Vertical: <input type="number" id="SV" value="100" min="1" max="500" style="width:56px"> %</div></fieldset>`;
    AppKit.dialog({ title: "Stretch and Skew", node: n, buttons: [{ label: "OK", default: true, action: (d) => {
      const h = Math.max(1, Math.min(500, +$("#SH", d).value || 100)) / 100, v = Math.max(1, Math.min(500, +$("#SV", d).value || 100)) / 100;
      if (h !== 1 || v !== 1) transform(stretch(h, v));
    } }, { label: "Cancel", cancel: true }] });
  }
  function attributesDialog() {
    const n = document.createElement("div");
    n.innerHTML = `<div class="row">File last saved: Not Available</div>
      <div class="row">Width: <input type="number" id="AW" value="${W}" min="1" max="4000" style="width:64px"> Height: <input type="number" id="AH" value="${H}" min="1" max="4000" style="width:64px"></div>
      <div class="row" style="color:#444">Units: Pels</div>`;
    AppKit.dialog({ title: "Attributes", node: n, buttons: [
      { label: "OK", default: true, action: (d) => {
        const w = Math.max(1, Math.min(4000, Math.round(+$("#AW", d).value) || W)), h = Math.max(1, Math.min(4000, Math.round(+$("#AH", d).value) || H));
        if (w !== W || h !== H) { dropSelection(); resizeImage(w, h, true); }
      } },
      { label: "Cancel", cancel: true },
      { label: "Default", action: (d) => { $("#AW", d).value = 480; $("#AH", d).value = 320; return false; } },
    ] });
  }

  // ---------- File ----------
  async function confirmDiscard() {
    if (!dirty) return true;
    const r = await AppKit.confirm("Paint", `Save changes to ${fileName}?`);
    if (r === "Yes") { await save(); return true; }
    return r === "No";
  }
  async function fileNew() {
    if (!(await confirmDiscard())) return;
    dropSelection(); commitText();
    undo = []; redo = []; fileName = "untitled"; dirty = false;
    newImage(W || 480, H || 320); setTitle(); saveDraft();
  }
  function fileOpen() { $("#OpenIn").click(); }
  $("#OpenIn").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      dropSelection(); undo = []; redo = [];
      loadBitmap(bmp);
      fileName = f.name.replace(/\.[^.]+$/, ""); dirty = false; setTitle(); saveDraft();
    } catch { AppKit.alert("Paint", "Paint cannot read this file.\nThis is not a valid bitmap file, or its format is not currently supported.", "error"); }
  });
  function save() {
    dropSelection(); commitText();
    return new Promise((res) => img.toBlob((b) => { AppKit.download(b, fileName + ".png"); dirty = false; setTitle(); res(); }, "image/png"));
  }
  async function saveAs() {
    const n = document.createElement("div");
    n.innerHTML = `<div class="row">File <u>n</u>ame: <input type="text" id="FN" value="${AppKit.esc(fileName)}" style="width:180px"></div><div class="row">Save as <u>t</u>ype: <select style="width:180px"><option>PNG (*.png)</option></select></div>`;
    const r = await AppKit.dialog({ title: "Save As", node: n, buttons: [{ label: "Save", default: true, action: (d) => { fileName = ($("#FN", d).value.trim() || "untitled").replace(/\.png$/i, "").replace(/[\\/:*?"<>|]/g, "_"); } }, { label: "Cancel", cancel: true }] });
    if (r === "Save") { setTitle(); await save(); saveDraft(); }
  }
  function setWallpaper(mode) {
    try {
      const api = window.parent.RBDesktop;
      if (api && typeof api.setWallpaper === "function") { dropSelection(); api.setWallpaper(img.toDataURL("image/png"), mode); return; }
    } catch { /* ignore */ }
    AppKit.alert("Paint", "The desktop doesn't support custom wallpaper yet.", "info");
  }
  const canWallpaper = () => { try { return typeof window.parent.RBDesktop?.setWallpaper === "function"; } catch { return false; } };
  function viewBitmap() {
    const v = document.createElement("div");
    v.id = "ViewBitmap";
    const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(img, 0, 0);
    v.appendChild(c); document.body.appendChild(v);
    const close = () => { v.remove(); removeEventListener("keydown", close, true); };
    v.addEventListener("pointerdown", close); addEventListener("keydown", close, true);
  }
  const toggleView = (cls) => { document.documentElement.classList.toggle(cls); };

  // ---------- Menus ----------
  AppKit.menubar($("#Menu"), [
    { label: "&File", items: () => [
      { label: "&New", key: "Ctrl+N", action: fileNew },
      { label: "&Open...", key: "Ctrl+O", action: fileOpen },
      { label: "&Save", key: "Ctrl+S", action: () => (fileName === "untitled" ? saveAs() : save()) },
      { label: "Save &As...", action: saveAs },
      "-",
      { label: "Print Pre&view", disabled: () => true },
      { label: "Page Se&tup...", disabled: () => true },
      { label: "&Print...", key: "Ctrl+P", disabled: () => true },
      "-",
      { label: "Set As &Wallpaper (Tiled)", disabled: () => !canWallpaper(), action: () => setWallpaper("tile") },
      { label: "Set As Wa&llpaper (Centered)", disabled: () => !canWallpaper(), action: () => setWallpaper("center") },
      "-",
      { label: "E&xit", key: "Alt+F4", action: async () => { if (await confirmDiscard()) AppKit.host.close(); } },
    ] },
    { label: "&Edit", items: () => [
      { label: "&Undo", key: "Ctrl+Z", action: doUndo, disabled: () => !undo.length && !sel },
      { label: "&Repeat", key: "Ctrl+Y", action: doRedo, disabled: () => !redo.length },
      "-",
      { label: "Cu&t", key: "Ctrl+X", action: () => { copySelection(); deleteSelection(); }, disabled: () => !sel },
      { label: "&Copy", key: "Ctrl+C", action: copySelection, disabled: () => !sel },
      { label: "&Paste", key: "Ctrl+V", action: paste },
      { label: "C&lear Selection", key: "Del", action: deleteSelection, disabled: () => !sel },
      { label: "Select &All", key: "Ctrl+A", action: selectAll },
      "-",
      { label: "C&opy To...", disabled: () => !sel, action: () => { copySelection(); const R = clipboard; const c = document.createElement("canvas"); c.width = R.w; c.height = R.h; c.getContext("2d").putImageData(R.d, 0, 0); c.toBlob((b) => AppKit.download(b, "selection.png")); } },
      { label: "Paste &From...", action: () => { pasteFromFile = true; fileOpenPaste(); } },
    ] },
    { label: "&View", items: () => [
      { label: "&Tool Box", key: "Ctrl+T", checked: () => !document.documentElement.classList.contains("hide-tools"), action: () => toggleView("hide-tools") },
      { label: "&Color Box", key: "Ctrl+L", checked: () => !document.documentElement.classList.contains("hide-colors"), action: () => toggleView("hide-colors") },
      { label: "&Status Bar", checked: () => !document.documentElement.classList.contains("hide-status"), action: () => toggleView("hide-status") },
      { label: "T&ext Toolbar", checked: () => !$("#FontBar").hidden, disabled: () => !textActive, action: () => { $("#FontBar").hidden = !$("#FontBar").hidden; } },
      "-",
      { label: "&Normal Size", key: "Ctrl+PgUp", radio: true, checked: () => zoom === 1, action: () => setZoom(1) },
      { label: "&Large Size", key: "Ctrl+PgDn", radio: true, checked: () => zoom === 4, action: () => setZoom(4) },
      { label: "C&ustom Zoom (2x)", radio: true, checked: () => zoom === 2, action: () => setZoom(2) },
      { label: "Custom Zoom (6x)", radio: true, checked: () => zoom === 6, action: () => setZoom(6) },
      { label: "Custom Zoom (8x)", radio: true, checked: () => zoom === 8, action: () => setZoom(8) },
      "-",
      { label: "&View Bitmap", key: "Ctrl+F", action: viewBitmap },
    ] },
    { label: "&Image", items: () => [
      { label: "&Flip/Rotate...", key: "Ctrl+R", action: flipRotateDialog },
      { label: "&Stretch/Skew...", key: "Ctrl+W", action: stretchDialog },
      { label: "&Invert Colors", key: "Ctrl+I", action: () => transform(invert) },
      { label: "&Attributes...", key: "Ctrl+E", action: attributesDialog },
      { label: "&Clear Image", key: "Ctrl+Shft+N", action: clearImage },
      { label: "&Draw Opaque", checked: () => !opt.trans, action: () => { opt.trans = opt.trans ? 0 : 1; AppKit.save("rbx.paint.opts", opt); renderOpts(); updateSel(); } },
    ] },
    { label: "&Colors", items: () => [
      { label: "&Edit Colors...", action: () => editColor() },
      { label: "&Reset Palette", action: () => { palette = PALETTE.slice(); AppKit.save("rbx.paint.palette", palette); renderPalette(); } },
    ] },
    { label: "&Help", items: () => [
      { label: "&Help Topics", action: helpTopics },
      "-",
      { label: "&About Paint", action: () => AppKit.alert("About Paint", "Paint\nRBXBanland Edition, Version 4.10.1998\n\nTool icons and cursors from JS Paint by Isaiah Odhner (MIT).", "info") },
    ] },
  ]);
  let pasteFromFile = false;
  function fileOpenPaste() {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.addEventListener("change", async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const bmp = await createImageBitmap(f);
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
        const x = c.getContext("2d"); x.drawImage(bmp, 0, 0);
        pasteRaster(raster(c.width, c.height, x.getImageData(0, 0, c.width, c.height)));
      } catch { AppKit.alert("Paint", "Paint cannot read this file.", "error"); }
    });
    inp.click();
  }
  function selectAll() { commitText(); dropSelection(); setTool("select"); sel = { x: 0, y: 0, w: W, h: H, lifted: false }; updateSel(); }
  function clearImage() { dropSelection(); pushUndo(); M.u.fill(pack(bg)); render(); saveDraft(); }
  function helpTopics() {
    AppKit.alert("Paint Help", "Pick a tool on the left, then draw on the white canvas.\n\n" +
      "Left button draws with the foreground color, right button with the background color.\n" +
      "Click a palette color to pick it (right-click for the background). Double-click a color to edit it.\n" +
      "Hold Shift for straight lines, squares and circles.\n" +
      "Drag the little blue handles to resize the picture.\n\n" +
      "Curve: drag a line, then click twice to bend it.\nPolygon: drag the first side, click for more corners, double-click to finish.", "info");
  }

  addEventListener("keydown", (e) => {
    if (document.querySelector(".dlg-shade")) return;
    if (e.target === textBox) { if (e.key === "Escape") { textBox.value = ""; commitText(); } return; }
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const map = ctrl ? {
      z: doUndo, y: doRedo, x: () => { copySelection(); deleteSelection(); }, c: copySelection, v: paste, a: selectAll,
      n: () => (e.shiftKey ? clearImage() : fileNew()), o: fileOpen, s: () => (fileName === "untitled" ? saveAs() : save()),
      r: flipRotateDialog, w: stretchDialog, i: () => transform(invert), e: attributesDialog, f: viewBitmap,
      t: () => toggleView("hide-tools"), l: () => toggleView("hide-colors"), pageup: () => setZoom(1), pagedown: () => setZoom(4),
    } : {
      delete: deleteSelection, escape: () => { if (drag || pending) cancelDrag(); else if (sel) dropSelection(); },
      enter: () => { if (pending) finishPending(); },
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  });
  // Drop an image file onto Paint to open it.
  addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  addEventListener("drop", async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    try { const bmp = await createImageBitmap(f); dropSelection(); pushUndo(); loadBitmap(bmp); fileName = f.name.replace(/\.[^.]+$/, ""); setTitle(); saveDraft(); } catch { /* ignore */ }
  });
  AppKit.onTheme(() => {});

  // ---------- Boot ----------
  (async () => {
    renderPalette(); updateColors();
    if (!(await loadDraft())) newImage(480, 320);
    setTitle();
    setTool("pencil");
  })();
  window.__paint = { get state() { return { W, H, tool, zoom, fg, bg, sel: !!sel, undo: undo.length }; }, setTool, pixel: (x, y) => unpack(getPx(M, x, y)) };
})();
