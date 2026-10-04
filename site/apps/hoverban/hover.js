// HoverBan: original arcade hovercraft chase. Collect every beacon, dodge mines, beat the clock.
(() => {
  "use strict";
  const cv = document.getElementById("Arena"), ctx = cv.getContext("2d"), hud = document.getElementById("Hud");
  let W = 0, H = 0, raf = 0, last = performance.now(), elapsed = 0, paused = false, over = false, won = false;
  let player, beacons, mines, bots, sparks, keys = Object.create(null), best = AppKit.load("rbx.hover.best", 0);
  const WORLD = { w: 1800, h: 1100 }, TAU = Math.PI * 2;
  const colors = { bg: "#001b2e", grid: "#06445b", line: "#0b7891", neon: "#00d9ff", pink: "#ff3ea5", gold: "#ffe75e", white: "#d9fbff" };

  function resize() { const r = cv.getBoundingClientRect(); W = Math.max(260, Math.floor(r.width)); H = Math.max(160, Math.floor(r.height)); cv.width = W; cv.height = H; ctx.imageSmoothingEnabled = false; }
  new ResizeObserver(resize).observe(cv);
  function reset() {
    player = { x: 900, y: 550, vx: 0, vy: 0, a: -Math.PI / 2, hp: 3, pulse: 0, boost: 100, got: 0, score: 0, hit: 0 };
    beacons = []; mines = []; bots = []; sparks = []; elapsed = 0; paused = false; over = false; won = false; last = performance.now();
    for (let i = 0; i < 12; i++) beacons.push({ x: 120 + (i * 311) % 1560, y: 120 + (i * 197) % 860, spin: Math.random() * TAU, got: false });
    for (let i = 0; i < 22; i++) mines.push({ x: 100 + (i * 487) % 1600, y: 90 + (i * 271) % 920, hot: Math.random() * 4 });
    bots = [{ x: 280, y: 230, a: .2, c: "#ff6b6b" }, { x: 1510, y: 850, a: 2.8, c: "#b381ff" }, { x: 1340, y: 280, a: 1.5, c: "#70ff9b" }];
  }
  function burst(x, y, color, n = 12) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 30 + Math.random() * 120; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: .45 + Math.random() * .55, color }); } }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function hurt() {
    if (player.hit > 0 || over) return;
    player.hp--; player.hit = 1; player.vx *= -.65; player.vy *= -.65; burst(player.x, player.y, colors.pink, 20);
    if (player.hp <= 0) { over = true; won = false; } 
  }
  function update(dt) {
    if (paused || over) return;
    elapsed += dt; player.hit = Math.max(0, player.hit - dt); player.pulse = Math.max(0, player.pulse - dt);
    if (elapsed >= 90) { over = true; won = false; }
    const ix = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), iy = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0);
    const moving = ix || iy, boost = keys.Shift && player.boost > 0 && moving;
    if (moving) { const n = Math.hypot(ix, iy); player.vx += ix / n * (boost ? 520 : 330) * dt; player.vy += iy / n * (boost ? 520 : 330) * dt; player.a = Math.atan2(player.vy, player.vx); }
    player.boost = clamp(player.boost + (boost ? -25 : 11) * dt, 0, 100);
    const drag = Math.pow(.0007, dt); player.vx *= drag; player.vy *= drag;
    const max = boost ? 390 : 250, speed = Math.hypot(player.vx, player.vy); if (speed > max) { player.vx = player.vx / speed * max; player.vy = player.vy / speed * max; }
    player.x = clamp(player.x + player.vx * dt, 38, WORLD.w - 38); player.y = clamp(player.y + player.vy * dt, 38, WORLD.h - 38);
    if (player.x === 38 || player.x === WORLD.w - 38) player.vx *= -.55; if (player.y === 38 || player.y === WORLD.h - 38) player.vy *= -.55;
    for (const b of beacons) if (!b.got && dist(player, b) < 34) { b.got = true; player.got++; player.score += 250; burst(b.x, b.y, colors.gold, 18); if (player.got === beacons.length) { over = true; won = true; if (player.score > best) { best = player.score; AppKit.save("rbx.hover.best", best); } } }
    for (const m of mines) { m.hot += dt; if (dist(player, m) < 27) hurt(); }
    if (player.pulse <= 0 && keys[" "]) { player.pulse = 4; burst(player.x, player.y, colors.neon, 35); for (const m of mines) if (dist(player, m) < 130) { m.x = -999; player.score += 40; } keys[" "] = false; }
    for (const b of bots) { b.a += Math.sin(elapsed * 1.4 + b.x) * dt * .8; b.x += Math.cos(b.a) * 95 * dt; b.y += Math.sin(b.a) * 95 * dt; if (b.x < 55 || b.x > WORLD.w - 55) b.a = Math.PI - b.a; if (b.y < 55 || b.y > WORLD.h - 55) b.a = -b.a; if (dist(player, b) < 32) hurt(); }
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= .95; s.vy *= .95; s.t -= dt; } sparks = sparks.filter((s) => s.t > 0);
  }
  function screen() { const zoom = Math.min(W / 720, H / 470); return { z: zoom, x: W / 2 - player.x * zoom, y: H / 2 - player.y * zoom }; }
  function draw() {
    const dark = AppKit.theme() === "vaporwave" ? "#120029" : colors.bg, c = screen(); ctx.fillStyle = dark; ctx.fillRect(0, 0, W, H); ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.z, c.z);
    ctx.fillStyle = "#02283d"; ctx.fillRect(0, 0, WORLD.w, WORLD.h); ctx.strokeStyle = colors.grid; ctx.lineWidth = 1 / c.z;
    for (let x = 0; x <= WORLD.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); } for (let y = 0; y <= WORLD.h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); }
    ctx.strokeStyle = colors.line; ctx.lineWidth = 5 / c.z; ctx.strokeRect(20, 20, WORLD.w - 40, WORLD.h - 40);
    for (const b of beacons) if (!b.got) { const pulse = 1 + Math.sin(elapsed * 5 + b.spin) * .15; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(elapsed * 1.4 + b.spin); ctx.scale(pulse, pulse); ctx.strokeStyle = colors.gold; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(14, 0); ctx.lineTo(0, 16); ctx.lineTo(-14, 0); ctx.closePath(); ctx.stroke(); ctx.restore(); }
    for (const m of mines) if (m.x > 0) { ctx.fillStyle = Math.sin(m.hot * 7) > .3 ? colors.pink : "#66104c"; ctx.beginPath(); ctx.arc(m.x, m.y, 11, 0, TAU); ctx.fill(); ctx.strokeStyle = colors.pink; ctx.lineWidth = 2; ctx.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(m.x + Math.cos(a) * 12, m.y + Math.sin(a) * 12); ctx.lineTo(m.x + Math.cos(a) * 17, m.y + Math.sin(a) * 17); ctx.stroke(); } }
    for (const b of bots) drawCraft(b.x, b.y, b.a, b.c, .72); for (const s of sparks) { ctx.globalAlpha = clamp(s.t * 2, 0, 1); ctx.fillStyle = s.color; ctx.fillRect(s.x - 2, s.y - 2, 4, 4); } ctx.globalAlpha = 1; drawCraft(player.x, player.y, player.a, player.hit > 0 && Math.floor(player.hit * 12) % 2 ? "#fff" : colors.neon, 1);
    if (player.pulse > 3.7) { ctx.strokeStyle = colors.neon; ctx.globalAlpha = (4 - player.pulse) * 3; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(player.x, player.y, (4 - player.pulse) * 150, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.restore();
    hud.textContent = `HOVERBAN  //  ARENA RUN\nBEACONS: ${player.got}/${beacons.length}   HP: ${"♥".repeat(player.hp)}${"·".repeat(3 - player.hp)}\nTIME: ${Math.max(0, 90 - elapsed).toFixed(1).padStart(4, "0")}s   SCORE: ${player.score}\nBOOST: ${"█".repeat(Math.round(player.boost / 10))}${"░".repeat(10 - Math.round(player.boost / 10))}${best ? `   BEST: ${best}` : ""}`;
    if (over) { ctx.fillStyle = "rgba(0,0,0,.68)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = won ? colors.gold : colors.pink; ctx.font = "bold 20px Arial"; ctx.textAlign = "center"; ctx.fillText(won ? "ARENA CLEARED" : player.hp ? "TIME OUT" : "CRAFT DESTROYED", W / 2, H / 2 - 10); ctx.fillStyle = colors.white; ctx.font = "12px 'Courier New'"; ctx.fillText(`Score ${player.score} · F2 or click for rematch`, W / 2, H / 2 + 16); ctx.textAlign = "left"; }
    if (paused) { ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = colors.white; ctx.font = "bold 18px Arial"; ctx.textAlign = "center"; ctx.fillText("PAUSED", W / 2, H / 2); ctx.textAlign = "left"; }
  }
  function drawCraft(x, y, a, color, scale) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(scale, scale); ctx.fillStyle = "#06111a"; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-13, -14); ctx.lineTo(-7, 0); ctx.lineTo(-13, 14); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = color; ctx.fillRect(-4, -7, 14, 14); ctx.fillStyle = colors.white; ctx.fillRect(2, -4, 5, 8); ctx.strokeStyle = colors.gold; ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-22, -16); ctx.moveTo(-12, 10); ctx.lineTo(-22, 16); ctx.stroke(); ctx.restore(); }
  function frame(now) { raf = requestAnimationFrame(frame); const dt = Math.min(.05, (now - last) / 1000); last = now; if (!W) resize(); if (!document.hidden) update(dt); draw(); }
  addEventListener("keydown", (e) => { if (document.querySelector(".dlg-shade")) return; keys[e.key] = true; if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault(); if (e.key === "F2") reset(); if (e.key === "F3" || e.key.toLowerCase() === "p") paused = !paused; });
  addEventListener("keyup", (e) => { keys[e.key] = false; });
  cv.addEventListener("pointerdown", () => { AppKit.closeMenus(); if (over) reset(); });
  addEventListener("blur", () => { if (!over) paused = true; });
  AppKit.menubar(document.getElementById("Menu"), [{ label: "&Game", items: [{ label: "&New Run", key: "F2", action: reset }, { label: "&Pause", key: "F3", action: () => { paused = !paused; } }, "-", { label: "E&xit", action: () => AppKit.host.close() }] }, { label: "&Help", items: [{ label: "&How to Play", key: "F1", action: () => AppKit.alert("HoverBan", "Collect all 12 gold beacons before 90 seconds.\nArrow keys/WASD steer. Hold Shift to boost.\nSpace fires a pulse that clears nearby mines.\nPink mines and rival craft cost HP. F3 pauses.", "info") }, { label: "&About HoverBan", action: () => AppKit.alert("About HoverBan", "HoverBan 1.0\nAn original tiny arena racer for RBXBanland.\nNo external assets or runtime libraries.", "info") }] }]);
  reset(); requestAnimationFrame(frame);
  window.__hover = { get state() { return { got: player.got, score: player.score, hp: player.hp, over }; }, reset };
})();
