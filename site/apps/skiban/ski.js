// Ski: a SkiFree-style downhill game. Original pixel sprites drawn here.
// Steer with the mouse or arrow keys, F to go fast, F2 for a new run. Watch out after 2000m.
(() => {
  "use strict";
  const cv = document.getElementById("Slope"), ctx = cv.getContext("2d");
  const statsEl = document.getElementById("Stats");
  const PX = 2; // each sprite pixel is 2x2 screen pixels, for that chunky 1991 look

  // ---------- Sprites (pixel maps) ----------
  const P = {
    k: "#000000", w: "#ffffff", g: "#808080", l: "#c0c0c0", G: "#008000", d: "#004000", b: "#804000", B: "#402000",
    r: "#ff0000", R: "#800000", u: "#0000ff", n: "#000080", s: "#ffc090", y: "#ffff00", p: "#ff00ff", c: "#00ffff",
  };
  const SPR = {
    tree: [
      "....G....", "...GGG...", "...GdG...", "..GGGGG..", "..GdGdG..", ".GGGGGGG.", "..GGdGG..", ".GGGGGGG.", ".GdGGGdG.",
      "GGGGGGGGG", ".GGdGdGG.", "GGGGGGGGG", "....b....", "....b....",
    ],
    bigtree: [
      ".....G.....", "....GGG....", "....GdG....", "...GGGGG...", "...GdGdG...", "..GGGGGGG..", "...GGdGG...", "..GGGGGGG..", ".GGdGGGdGG.",
      ".GGGGGGGGG.", "..GGdGdGG..", ".GGGGGGGGG.", "GGdGGGGGdGG", "GGGGGdGGGGG", ".GGGGGGGGG.", "GGdGGGGGdGG", "GGGGGGGGGGG", ".....b.....", ".....b.....",
    ],
    dead: ["..B...B..", "...B.B...", "B..BB...B", ".B.B..BB.", "..BB.B...", "...BB....", "...B.....", "...B.....", "...B....."],
    rock: ["..ggg..", ".glggg.", "glllggg", "gggggkg", ".kkkkk."],
    stump: [".bbbbb.", "bBbbbBb", ".bbbbb.", ".bbbbb.", ".BbbbB."],
    mogul: ["...lll...", ".lwwwwl..", "lwwwwwwll"],
    jump: ["...lllllll...", ".llwwwwwwwll.", "lwwwwwwwwwwwl", "lkkkkkkkkkkkl"],
    flagL: ["rr.", "rrr", "rr.", "k..", "k..", "k..", "k.."],
    flagB: ["uu.", "uuu", "uu.", "k..", "k..", "k..", "k.."],
    dog: ["......kk", "kk.kkkkk", ".kkkkkk.", ".kkkkkk.", ".k.k.k.k"],
  };
  // Skier poses, 10 px wide. dir: -3 (hard left) .. 0 (down) .. 3 (hard right); "fall", "jump", "sit".
  const SKIER = {
    0: ["...rr....", "..rrrr...", "...ss....", "..uuuu...", ".uuuuuu..", ".s.uu.s..", "...nn....", "..n..n...", "..n..n...", "..k..k...", "..k..k...", "..k..k..."],
    1: ["...rr....", "..rrrr...", "...ss....", "..uuuu...", ".uuuuuu..", ".s.uu.s..", "...nn....", "...n.n...", "...n..n..", "...k..k..", "....k..k.", "....k..k."],
    2: ["...rr....", "..rrrr...", "...ss....", "..uuuu...", ".uuuuus..", ".s.uu....", "...nnn...", "...n..n..", "...kk.n..", "....kk.k.", "......kkk", "........."],
    3: ["...rr....", "..rrrr...", "...ss....", "..uuuu...", ".suuuus..", "...uu....", "...nnn...", "...n.n...", "kkkkkkkkk", ".........", "kkkkkkkkk", "........."],
    fall: [".........", ".........", ".........", "....k..k.", "rr..k.k..", "rrssuuunnk", ".r.uuunn.k", "...s..k...", ".....k....", "....k....."],
    jump: ["...rr....", "..rrrr...", "s..ss..s.", ".uuuuuu..", "..uuuu...", "...nn....", "..n..n...", ".n....n..", "kkk..kkk.", "........."],
  };
  const pad = (rows) => [".".repeat(rows[0].length + 2), ...rows.map((r) => "." + r + "."), ".".repeat(rows[0].length + 2)];
  const YETI = {
    a: ["...wwww...", "..wkwwkw..", "..wwwwww..", "..wrrrrw..", "w.wwwwww.w", "ww.wwww.ww", ".wwwwwwww.", "...wwww...", "...wwww...", "..ww..ww..", "..ww..ww..", ".www..www."],
    b: ["...wwww...", "..wkwwkw..", "..wwwwww..", "..wrrrrw..", ".wwwwwwww.", "w.wwwwww.w", "..wwwwww..", "...wwww...", "...wwww...", "...ww.ww..", "..ww...ww.", ".www...www"],
    eat: ["...wwww...", "..wkwwkw..", "..wwwwww..", "..wrrrrw..", "wwwwwwwwww", "w.wwrrww.w", "..wwwwww..", "...wwww...", "...wwww...", "..ww..ww..", "..ww..ww..", ".www..www."],
  };
  const cache = new Map();
  function sprite(rows, flip, outline) {
    const key = rows.join("|") + (flip ? "f" : "") + (outline ? "o" : "");
    if (cache.has(key)) return cache.get(key);
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const c = document.createElement("canvas"); c.width = w * PX; c.height = h * PX;
    const x = c.getContext("2d");
    const on = (i, j) => j >= 0 && j < h && i >= 0 && i < w && P[rows[j][i]] !== undefined;
    // White sprites (the yeti, snow piles) get a dark outline so they show up on snow.
    if (outline) {
      x.fillStyle = "#000";
      for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
        if (on(i, j)) continue;
        if (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1)) { const ii = flip ? w - 1 - i : i; if (ii >= 0 && ii < w && j >= 0 && j < h) x.fillRect(ii * PX, j * PX, PX, PX); }
      }
    }
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (P[ch]) { x.fillStyle = P[ch]; x.fillRect((flip ? w - 1 - i : i) * PX, j * PX, PX, PX); } }));
    cache.set(key, c);
    return c;
  }
  function skierSprite(dir, state) {
    if (state === "fall") return sprite(SKIER.fall);
    if (state === "jump") return sprite(SKIER.jump);
    return sprite(SKIER[Math.abs(dir)], dir < 0);
  }

  // ---------- Game state ----------
  let W = 0, H = 0;
  let objs, skier, yeti, t0, elapsed, style, running, paused, over, dist, fast, mouse, best = AppKit.load("rbx.ski.best", 0);
  const HIT = { tree: [5, 3], bigtree: [6, 3], dead: [4, 3], rock: [6, 4], stump: [6, 4] }; // collision half-width, height (sprite px) at base
  function reset() {
    objs = [];
    skier = { x: 0, y: 0, dir: 0, speed: 0, state: "ski", stateT: 0, air: 0 };
    yeti = null; style = 0; dist = 0; elapsed = 0; t0 = performance.now(); running = true; paused = false; over = false; fast = false;
    mouse = null;
    // Pre-populate the visible hill.
    for (let y = 60; y < 1600; y += 18) spawnRow(y);
    // Start gate: a pair of flags and a sign.
    objs.push({ k: "flagL", x: -60, y: 20 }, { k: "flagB", x: 60, y: 20 });
    document.getElementById("Pause").hidden = true;
  }
  function spawnRow(y) {
    const span = Math.max(W, 640) * 1.6;
    const n = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const k = r < 0.34 ? "tree" : r < 0.46 ? "bigtree" : r < 0.56 ? "dead" : r < 0.68 ? "rock" : r < 0.76 ? "stump" : r < 0.9 ? "mogul" : r < 0.96 ? "jump" : "dog";
      objs.push({ k, x: skier.x + (Math.random() - 0.5) * span, y: y + Math.random() * 18 });
    }
  }
  let lastSpawnY = 1600;

  function resize() {
    const r = cv.getBoundingClientRect();
    W = Math.max(200, Math.floor(r.width)); H = Math.max(150, Math.floor(r.height));
    cv.width = W; cv.height = H;
    ctx.imageSmoothingEnabled = false;
  }
  new ResizeObserver(resize).observe(cv);

  // ---------- Controls ----------
  cv.addEventListener("pointermove", (e) => { const r = cv.getBoundingClientRect(); mouse = [e.clientX - r.left, e.clientY - r.top]; });
  cv.addEventListener("pointerdown", (e) => {
    AppKit.closeMenus();
    if (over) { reset(); return; }
    if (e.button === 0 && skier.state === "ski" && skier.dir === 0 && skier.speed > 3) { /* click to hop */ skier.state = "jump"; skier.air = 0.45; }
  });
  addEventListener("keydown", (e) => {
    if (document.querySelector(".dlg-shade")) return;
    if (paused) { paused = false; t0 = performance.now() - elapsed; document.getElementById("Pause").hidden = true; return; }
    const k = e.key;
    if (k === "F2") { e.preventDefault(); reset(); return; }
    if (k === "F3" || k === "p" || k === "P") { paused = true; document.getElementById("Pause").hidden = false; return; }
    if (over) return;
    mouse = null;
    if (k === "ArrowLeft") { skier.dir = Math.max(-3, skier.dir - 1); if (skier.dir === -3) skier.x -= 4; }
    else if (k === "ArrowRight") { skier.dir = Math.min(3, skier.dir + 1); if (skier.dir === 3) skier.x += 4; }
    else if (k === "ArrowDown") { skier.dir = 0; }
    else if (k === "ArrowUp") { skier.dir = skier.dir <= 0 ? -3 : 3; }
    else if (k === "f" || k === "F") fast = !fast;
    else return;
    e.preventDefault();
  });

  // ---------- Update ----------
  const MAXV = [8, 6.6, 3.6, 0]; // px per frame at 60fps by |dir|
  function step(dt) {
    const s = skier;
    if (mouse && !over) {
      const sx = W / 2, sy = H / 3;
      const a = Math.atan2(mouse[0] - sx, Math.max(1, mouse[1] - sy));
      s.dir = mouse[1] < sy - 4 ? (mouse[0] < sx ? -3 : 3) : Math.max(-3, Math.min(3, Math.round(a / (Math.PI / 2) * 3.4)));
    }
    if (s.state === "fall") { s.stateT -= dt; s.speed = 0; if (s.stateT <= 0) { s.state = "ski"; s.dir = 0; } }
    else {
      const target = MAXV[Math.abs(s.dir)] * (fast && Math.abs(s.dir) <= 1 ? 1.5 : 1);
      s.speed += (target - s.speed) * Math.min(1, dt * (target > s.speed ? 1.6 : 3));
      if (s.state === "jump") { s.air -= dt; if (s.air <= 0) { s.state = "ski"; } }
    }
    const k = dt * 60;
    const vy = s.speed * Math.cos(s.dir / 3 * Math.PI / 2.4) * k;
    const vx = s.speed * Math.sin(s.dir / 3 * Math.PI / 2.4) * k * 0.9;
    s.x += vx; s.y += vy;
    dist = Math.max(dist, s.y / 16);
    while (lastSpawnY < s.y + H * 2) { spawnRow(lastSpawnY); lastSpawnY += 18; }
    objs = objs.filter((o) => o.y > s.y - H);
    // Dogs wander.
    for (const o of objs) if (o.k === "dog") o.x += Math.sin(performance.now() / 300 + o.y) * 0.6 * k;
    // Collisions (skier's feet vs object base).
    if (s.state !== "fall") {
      for (const o of objs) {
        const dx = Math.abs(o.x - s.x), dy = o.y - s.y;
        if (o.k === "jump" && dx < 14 && dy > -4 && dy < 6 && s.state !== "jump") { s.state = "jump"; s.air = 0.5 + s.speed / 12; style += 25; continue; }
        if (o.k === "mogul" && dx < 10 && Math.abs(dy) < 4 && s.state === "ski" && s.speed > 5 && Math.random() < 0.02) { s.state = "jump"; s.air = 0.25; style += 5; continue; }
        const h = HIT[o.k];
        if (!h || s.state === "jump" && o.k !== "bigtree") continue;
        if (dx < h[0] * PX && dy > -h[1] && dy < h[1] * PX) {
          s.state = "fall"; s.stateT = 0.9; s.speed = 0; style = Math.max(0, style - 10);
          s.y = o.y + h[1] * PX + 1;
          if (o.k === "dog") break;
          break;
        }
      }
    }
    // The yeti shows up past 2000m and runs faster than you unless you're really flying.
    if (!yeti && dist > 2000) yeti = { x: s.x + (Math.random() < 0.5 ? -1 : 1) * W * 0.6, y: s.y - H * 0.5, t: 0, eating: 0 };
    if (yeti) {
      yeti.t += dt;
      if (yeti.eating) {
        yeti.eating += dt;
        if (yeti.eating > 2.5 && !over) gameOver();
      } else {
        const dx = s.x - yeti.x, dy = s.y - yeti.y, d = Math.hypot(dx, dy);
        const v = 8.4 * k;
        if (d < 10) { yeti.eating = 0.001; s.state = "eaten"; s.speed = 0; }
        else { yeti.x += dx / d * v; yeti.y += dy / d * v; }
      }
    }
  }
  function gameOver() {
    over = true; running = false;
    if (dist > best) { best = Math.floor(dist); AppKit.save("rbx.ski.best", best); }
  }

  // ---------- Draw ----------
  function draw() {
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    const cx = W / 2 - skier.x, cy = H / 3 - skier.y;
    const list = objs.filter((o) => o.y + cy > -60 && o.y + cy < H + 60 && o.x + cx > -60 && o.x + cx < W + 60);
    const actors = [...list.map((o) => ({ y: o.y, draw: () => drawObj(o, cx, cy) })), { y: skier.y, draw: () => drawSkier(cx, cy) }];
    if (yeti) actors.push({ y: yeti.y, draw: () => drawYeti(cx, cy) });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();
    const t = new Date(elapsed);
    const hh = String(Math.floor(elapsed / 3600000)), mm = String(t.getUTCMinutes()).padStart(2, "0"), ss = String(t.getUTCSeconds()).padStart(2, "0"), cs = String(Math.floor(t.getUTCMilliseconds() / 10)).padStart(2, "0");
    statsEl.textContent = `Time:  ${hh}:${mm}:${ss}.${cs}\nDist:  ${Math.floor(dist)}m\nSpeed: ${Math.round(skier.speed * 3)}m/s\nStyle: ${style}` + (best ? `\nBest:  ${best}m` : "");
    if (over) {
      ctx.fillStyle = "#000"; ctx.font = "bold 14px Arial"; ctx.textAlign = "center";
      ctx.fillText("Om nom nom. Press F2 or click to ski again.", W / 2, H - 24);
    }
  }
  function drawAt(img, x, y) { ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height)); }
  function drawObj(o, cx, cy) { drawAt(sprite(SPR[o.k]), o.x + cx, o.y + cy); }
  function drawSkier(cx, cy) {
    if (skier.state === "eaten") return;
    const img = skierSprite(skier.dir, skier.state === "fall" ? "fall" : skier.state === "jump" ? "jump" : "ski");
    let lift = 0;
    if (skier.state === "jump") { lift = Math.sin(Math.min(1, skier.air) * Math.PI) * 10 + 6; ctx.fillStyle = "#e0e0e0"; ctx.fillRect(Math.round(skier.x + cx - 8), Math.round(skier.y + cy - 2), 16, 3); }
    drawAt(img, skier.x + cx, skier.y + cy - lift);
  }
  function drawYeti(cx, cy) {
    const f0 = yeti.eating ? YETI.eat : Math.floor(yeti.t * 6) % 2 ? YETI.a : YETI.b;
    const f = pad(f0);
    drawAt(sprite(f, yeti.x > skier.x, true), yeti.x + cx, yeti.y + cy);
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!W) resize();
    if (running && !paused && !document.hidden) { elapsed = now - t0; step(dt); }
    else if (paused) t0 += dt * 1000;
    draw();
  }
  addEventListener("blur", () => { if (running && !over) { paused = true; document.getElementById("Pause").hidden = false; } });

  AppKit.menubar(document.getElementById("Menu"), [
    { label: "&Game", items: [
      { label: "&New Game", key: "F2", action: reset },
      { label: "&Pause", key: "F3", action: () => { paused = true; document.getElementById("Pause").hidden = false; } },
      "-",
      { label: "E&xit", action: () => AppKit.host.close() },
    ] },
    { label: "&Help", items: [
      { label: "&How to Play", key: "F1", action: () => AppKit.alert("Ski", "Steer with the mouse or the arrow keys.\nF toggles fast skiing. Hit the jumps for style points, dodge trees and rocks.\nF3 pauses, F2 starts over.\n\nRumor has it something lives past the 2000m mark...", "info") },
      { label: "&About Ski", action: () => AppKit.alert("About Ski", "Ski 1.0\nA tribute to the classic 1991 downhill game.\nAll sprites drawn for RBXBanland.", "info") },
    ] },
  ]);
  reset();
  requestAnimationFrame(frame);
  window.__ski = { get s() { return { dist, speed: skier.speed, state: skier.state, over, yeti: yeti && { x: yeti.x - skier.x, y: yeti.y - skier.y, e: yeti.eating } }; }, warp: (m) => { skier.y = m * 16; lastSpawnY = skier.y; objs = []; } };
})();
