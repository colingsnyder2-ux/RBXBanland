// Klondike Solitaire, Windows 98 style: draw one/three, Standard/Vegas scoring, timed game, one-level undo,
// double-click and right-click to play to the foundations, and the bouncing-cards finale.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const CW = 71, CH = 96, TOP = 6, DOWN_DY = 3, UP_DY = 15;
  const table = $("#Table"), fx = $("#Fx"), fctx = fx.getContext("2d");
  const sprite = new Image();
  sprite.src = "vendor/js-solitaire/cards.png";
  const opt = Object.assign({ draw: 1, scoring: "standard", timed: true, status: true, cumulative: false, back: 0, vegasBank: 0 }, AppKit.load("rbx.sol.opts", {}));
  const saveOpt = () => AppKit.save("rbx.sol.opts", opt);

  let cards = [], stock = [], waste = [], found = [[], [], [], []], tab = [[], [], [], [], [], [], []];
  let score = 0, time = 0, timer = null, started = false, passes = 0, undoSnap = null, won = false, wasteShown = 1;
  const red = (c) => c.suit === 0 || c.suit === 2;
  const top = (p) => p[p.length - 1];

  // ---------- Card elements ----------
  function face(c) {
    if (c.up) { c.el.style.backgroundImage = ""; c.el.style.backgroundPosition = `${-c.suit * CW}px ${-(c.rank - 1) * CH}px`; c.el.classList.remove("down"); }
    else { c.el.style.backgroundImage = `url("${CardBacks.url(opt.back)}")`; c.el.style.backgroundPosition = "0 0"; c.el.classList.add("down"); }
  }
  function makeDeck() {
    for (const c of cards) c.el.remove();
    cards = [];
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) {
      const el = document.createElement("div");
      el.className = "card";
      const c = { suit: s, rank: r, up: false, el, id: s * 13 + r - 1 };
      el._card = c;
      cards.push(c);
      table.appendChild(el);
    }
  }
  // Slots (empty pile outlines)
  const slots = { stock: mkSlot("stock"), waste: mkSlot(""), found: [0, 1, 2, 3].map(() => mkSlot("")), tab: [0, 1, 2, 3, 4, 5, 6].map(() => mkSlot("")) };
  function mkSlot(cls) { const d = document.createElement("div"); d.className = "slot " + cls; table.appendChild(d); return d; }
  slots.waste.style.display = "none";
  for (const s of slots.tab) s.style.border = "0";

  // ---------- Layout ----------
  let gap = 11;
  const colX = (i) => gap + i * (CW + gap);
  function pos(el, x, y, z) { el.style.left = x + "px"; el.style.top = y + "px"; el.style.zIndex = z; }
  function layout() {
    const W = table.clientWidth, H = table.clientHeight;
    gap = Math.max(4, Math.floor((W - 7 * CW) / 8));
    const tabY = TOP + CH + Math.max(8, Math.min(20, gap + 2));
    pos(slots.stock, colX(0), TOP, 0);
    slots.stock.classList.toggle("x", !stock.length && passes + 1 >= maxPasses());
    found.forEach((_, i) => pos(slots.found[i], colX(3 + i), TOP, 0));
    tab.forEach((_, i) => pos(slots.tab[i], colX(i), tabY, 0));
    stock.forEach((c, i) => pos(c.el, colX(0) + Math.floor(i / 10) * 2, TOP + Math.floor(i / 10), 10 + i));
    const showN = opt.draw === 3 ? Math.min(wasteShown, waste.length, 3) : 1;
    waste.forEach((c, i) => {
      const k = i - (waste.length - showN);
      pos(c.el, colX(1) + (k > 0 ? k * 12 : 0), TOP, 100 + i);
    });
    found.forEach((p, f) => p.forEach((c, i) => pos(c.el, colX(3 + f), TOP, 200 + i)));
    tab.forEach((p, t) => {
      const downs = p.filter((c) => !c.up).length, ups = p.length - downs;
      let dy = UP_DY;
      const room = H - tabY - CH - downs * DOWN_DY - 4;
      if (ups > 1 && (ups - 1) * dy > room) dy = Math.max(4, Math.floor(room / (ups - 1)));
      let y = tabY;
      p.forEach((c, i) => { pos(c.el, colX(t), y, 300 + i); y += c.up ? dy : DOWN_DY; });
    });
    fx.width = W; fx.height = H;
  }
  new ResizeObserver(() => { if (!won) layout(); }).observe(table);

  // ---------- Game ----------
  function maxPasses() { return opt.scoring === "vegas" ? (opt.draw === 1 ? 1 : 3) : Infinity; }
  function deal() {
    stopWin();
    makeDeck();
    const d = cards.slice();
    for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; }
    found = [[], [], [], []]; tab = [[], [], [], [], [], [], []]; waste = []; stock = [];
    for (let t = 0; t < 7; t++) for (let k = t; k < 7; k++) { const c = d.pop(); c.up = k === t; tab[k].push(c); }
    stock = d;
    for (const c of cards) face(c);
    passes = 0; undoSnap = null; won = false; started = false; wasteShown = 1;
    clearInterval(timer); timer = null; time = 0;
    if (opt.scoring === "vegas") { score = (opt.cumulative ? opt.vegasBank : 0) - 52; opt.vegasBank = score; saveOpt(); }
    else score = 0;
    layout(); status();
  }
  function startTimer() {
    if (started) return;
    started = true;
    timer = setInterval(() => {
      time++;
      if (opt.timed && opt.scoring === "standard" && time % 10 === 0) addScore(-2);
      status();
    }, 1000);
  }
  function addScore(n) {
    if (opt.scoring === "none") return;
    score += n;
    if (opt.scoring === "standard" && score < 0) score = 0;
    if (opt.scoring === "vegas") { opt.vegasBank = score; saveOpt(); }
  }
  function status() {
    document.documentElement.classList.toggle("nostatus", !opt.status);
    const money = opt.scoring === "vegas";
    $("#Score").textContent = opt.scoring === "none" ? "" : money ? `Score: ${score < 0 ? "-$" : "$"}${Math.abs(score)}` : `Score: ${score}`;
    $("#Time").textContent = opt.timed ? `Time: ${time}` : "";
  }
  function snapshot() {
    const ids = (p) => p.map((c) => [c.id, c.up]);
    undoSnap = { stock: ids(stock), waste: ids(waste), found: found.map(ids), tab: tab.map(ids), score, passes, wasteShown };
  }
  function undo() {
    if (!undoSnap || won) return;
    const s = undoSnap; undoSnap = null;
    const get = (p) => p.map(([id, up]) => { const c = cards[id]; c.up = up; face(c); return c; });
    stock = get(s.stock); waste = get(s.waste); found = s.found.map(get); tab = s.tab.map(get);
    score = s.score; passes = s.passes; wasteShown = s.wasteShown;
    if (opt.scoring === "vegas") { opt.vegasBank = score; saveOpt(); }
    layout(); status();
  }
  function where(c) {
    if (stock.includes(c)) return { pile: stock, kind: "stock" };
    if (waste.includes(c)) return { pile: waste, kind: "waste" };
    for (let i = 0; i < 4; i++) if (found[i].includes(c)) return { pile: found[i], kind: "found", i };
    for (let i = 0; i < 7; i++) if (tab[i].includes(c)) return { pile: tab[i], kind: "tab", i };
    return null;
  }
  function drawStock() {
    startTimer();
    snapshot();
    if (!stock.length) {
      if (!waste.length) { undoSnap = null; return; }
      if (passes + 1 >= maxPasses()) { undoSnap = null; return; }
      passes++;
      stock = waste.reverse(); waste = [];
      for (const c of stock) { c.up = false; face(c); }
      if (opt.scoring === "standard") addScore(opt.draw === 1 ? -100 : passes >= 3 ? -20 : 0);
      wasteShown = 1;
    } else {
      const n = Math.min(opt.draw, stock.length);
      for (let i = 0; i < n; i++) { const c = stock.pop(); c.up = true; face(c); waste.push(c); }
      wasteShown = n;
    }
    layout(); status();
  }
  const canFound = (c, f) => { const t = top(found[f]); return t ? t.suit === c.suit && t.rank === c.rank - 1 : c.rank === 1; };
  const canTab = (c, t) => { const p = top(tab[t]); return p ? p.up && red(p) !== red(c) && p.rank === c.rank + 1 : c.rank === 13; };
  function move(cardsMoving, from, toPile, toKind) {
    snapshot();
    from.pile.splice(from.pile.length - cardsMoving.length, cardsMoving.length);
    toPile.push(...cardsMoving);
    if (from.kind === "waste") { wasteShown = Math.max(1, wasteShown - 1); }
    if (opt.scoring === "standard") {
      if (toKind === "found" && from.kind !== "found") addScore(10);
      else if (toKind === "tab" && from.kind === "waste") addScore(5);
      else if (toKind === "tab" && from.kind === "found") addScore(-15);
    } else if (opt.scoring === "vegas") {
      if (toKind === "found" && from.kind !== "found") addScore(5);
      else if (from.kind === "found" && toKind !== "found") addScore(-5);
    }
    startTimer();
    layout(); status();
    checkWin();
  }
  function toFoundation(c) {
    const w = where(c);
    if (!w || w.kind === "stock" || top(w.pile) !== c || !c.up) return false;
    for (let f = 0; f < 4; f++) if (canFound(c, f) && w.pile !== found[f]) { move([c], w, found[f], "found"); return true; }
    return false;
  }
  function autoPlay() {
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of [waste, ...tab]) { const c = top(p); if (c && c.up && toFoundation(c)) { moved = true; break; } }
    }
  }
  function clearHint() { for (const c of cards) c.el.classList.remove("hint"); slots.stock.classList.remove("hint"); }
  function hint() {
    clearHint();
    if (won) return;
    const mark = (c) => { if (!c) return false; c.el.classList.add("hint"); setTimeout(clearHint, 1600); return true; };
    const canMove = (c, w) => found.some((p, f) => p !== w.pile && canFound(c, f)) || tab.some((p, t) => p !== w.pile && canTab(c, t));
    const tops = [waste, ...tab].map((p) => top(p)).filter(Boolean);
    for (const c of tops) { const w = where(c); if (c.up && canMove(c, w)) return mark(c); }
    for (const p of tab) { const c = top(p); if (c && !c.up) return mark(c); }
    if (stock.length || waste.length) { slots.stock.classList.add("hint"); setTimeout(clearHint, 1600); }
  }
  function flip(c) {
    snapshot(); startTimer();
    c.up = true; face(c);
    if (opt.scoring === "standard") addScore(5);
    layout(); status();
  }

  // ---------- Pointer ----------
  let drag = null, lastClick = { c: null, t: 0 };
  table.addEventListener("contextmenu", (e) => { e.preventDefault(); if (!won) autoPlay(); });
  table.addEventListener("pointerdown", (e) => {
    AppKit.closeMenus();
    if (won) { stopWin(); askAgain(); return; }
    if (e.button !== 0) return;
    const el = e.target.closest(".card");
    if (!el) {
      if (e.target === slots.stock) drawStock();
      return;
    }
    const c = el._card, w = where(c);
    if (w.kind === "stock") { drawStock(); return; }
    if (!c.up) { if (w.kind === "tab" && top(w.pile) === c) flip(c); return; }
    // Double click (our own timing, so a drag in between doesn't count).
    const now = performance.now();
    if (lastClick.c === c && now - lastClick.t < 450) { lastClick.c = null; toFoundation(c); return; }
    lastClick = { c, t: now };
    if (w.kind === "waste" && top(w.pile) !== c) return;
    if (w.kind === "found" && top(w.pile) !== c) return;
    const idx = w.pile.indexOf(c);
    const group = w.kind === "tab" ? w.pile.slice(idx) : [c];
    const r = table.getBoundingClientRect();
    drag = { group, from: w, sx: e.clientX, sy: e.clientY, started: false, origin: group.map((g) => [g.el.offsetLeft, g.el.offsetTop]), r };
    table.setPointerCapture(e.pointerId);
  });
  table.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.started && Math.abs(dx) + Math.abs(dy) < 3) return;
    drag.started = true;
    drag.group.forEach((g, i) => { g.el.classList.add("drag"); g.el.style.zIndex = 1000 + i; g.el.style.left = drag.origin[i][0] + dx + "px"; g.el.style.top = drag.origin[i][1] + dy + "px"; });
  });
  table.addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag; drag = null;
    for (const g of d.group) g.el.classList.remove("drag");
    if (!d.started) { layout(); return; }
    const lead = d.group[0], lr = rect(lead.el);
    let best = null, bestA = 0;
    const consider = (pile, kind, slot, ok) => {
      if (!ok || pile === d.from.pile) return;
      const t = top(pile), rr = t ? rect(t.el) : rect(slot);
      const a = Math.max(0, Math.min(lr.r, rr.r) - Math.max(lr.l, rr.l)) * Math.max(0, Math.min(lr.b, rr.b) - Math.max(lr.t, rr.t));
      if (a > bestA) { bestA = a; best = { pile, kind }; }
    };
    if (d.group.length === 1) found.forEach((p, f) => consider(p, "found", slots.found[f], canFound(lead, f)));
    tab.forEach((p, t) => consider(p, "tab", slots.tab[t], canTab(lead, t)));
    if (best) move(d.group, d.from, best.pile, best.kind);
    else { for (const g of d.group) g.el.classList.add("anim"); layout(); setTimeout(() => { for (const g of d.group) g.el.classList.remove("anim"); }, 200); }
  });
  const rect = (el) => ({ l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + CW, b: el.offsetTop + CH });

  // ---------- Winning ----------
  let winRaf = 0;
  function checkWin() {
    if (found.some((p) => p.length !== 13)) return;
    won = true;
    clearInterval(timer);
    if (opt.timed && opt.scoring === "standard" && time >= 30) addScore(Math.floor(700000 / time));
    status();
    setTimeout(bounce, 300);
  }
  function bounce() {
    const W = fx.width, H = fx.height;
    fctx.clearRect(0, 0, W, H);
    const order = [];
    for (let r = 12; r >= 0; r--) for (let f = 0; f < 4; f++) order.push(found[f][r]);
    let cur = null, k = 0;
    const next = () => {
      const c = order[k++];
      if (!c) return null;
      c.el.style.visibility = "hidden";
      let vx = (Math.random() * 6 + 2) * (Math.random() < 0.5 ? -1 : 1);
      return { c, x: c.el.offsetLeft, y: c.el.offsetTop, vx, vy: -Math.random() * 8 };
    };
    cur = next();
    const step = () => {
      for (let i = 0; i < 2 && cur; i++) {
        cur.vy += 0.6; cur.x += cur.vx; cur.y += cur.vy;
        if (cur.y > H - CH) { cur.y = H - CH; cur.vy = -cur.vy * 0.78; }
        fctx.drawImage(sprite, cur.c.suit * CW, (cur.c.rank - 1) * CH, CW, CH, Math.round(cur.x), Math.round(cur.y), CW, CH);
        if (cur.x < -CW || cur.x > W) cur = next();
      }
      if (cur) winRaf = requestAnimationFrame(step);
      else { winRaf = 0; setTimeout(askAgain, 300); }
    };
    winRaf = requestAnimationFrame(step);
  }
  function stopWin() {
    if (winRaf) cancelAnimationFrame(winRaf);
    winRaf = 0;
    fctx.clearRect(0, 0, fx.width, fx.height);
    for (const c of cards) c.el.style.visibility = "";
  }
  let asking = false;
  async function askAgain() {
    if (asking) return;
    asking = true; stopWin();
    const r = await AppKit.confirm("Solitaire", "Deal again?", ["Yes", "No"], "question");
    asking = false;
    if (r === "Yes") deal(); else { won = false; layout(); }
  }

  // ---------- Dialogs ----------
  function deckDialog() {
    const n = document.createElement("div");
    n.className = "backs";
    let pick = opt.back;
    for (let i = 0; i < CardBacks.count; i++) {
      const im = document.createElement("img");
      im.src = CardBacks.url(i); im.title = CardBacks.name(i); im.alt = CardBacks.name(i);
      if (i === pick) im.classList.add("on");
      im.addEventListener("click", () => { pick = i; for (const x of n.children) x.classList.toggle("on", x === im); });
      im.addEventListener("dblclick", () => { pick = i; document.querySelector(".dlg-shade .btn.default").click(); });
      n.appendChild(im);
    }
    AppKit.dialog({ title: "Select Card Back", node: n, buttons: [{ label: "OK", default: true, action: () => { opt.back = pick; saveOpt(); for (const c of cards) face(c); } }, { label: "Cancel", cancel: true }] });
  }
  function optionsDialog() {
    const n = document.createElement("div");
    n.innerHTML = `<div class="optgrid">
      <fieldset><legend>Draw</legend><div><label><input type="radio" name="dr" value="1"${opt.draw === 1 ? " checked" : ""}> Draw <u>O</u>ne</label></div><div><label><input type="radio" name="dr" value="3"${opt.draw === 3 ? " checked" : ""}> Draw <u>T</u>hree</label></div></fieldset>
      <fieldset><legend>Scoring</legend><div><label><input type="radio" name="sc" value="standard"${opt.scoring === "standard" ? " checked" : ""}> <u>S</u>tandard</label></div><div><label><input type="radio" name="sc" value="vegas"${opt.scoring === "vegas" ? " checked" : ""}> <u>V</u>egas</label></div><div><label><input type="radio" name="sc" value="none"${opt.scoring === "none" ? " checked" : ""}> <u>N</u>one</label></div></fieldset>
      </div>
      <div style="margin-top:8px;line-height:1.9">
      <label><input type="checkbox" id="OT"${opt.timed ? " checked" : ""}> T<u>i</u>med game</label><br>
      <label><input type="checkbox" id="OS"${opt.status ? " checked" : ""}> Status <u>b</u>ar</label><br>
      <label><input type="checkbox" id="OC"${opt.cumulative ? " checked" : ""}> <u>K</u>eep score (Vegas)</label></div>`;
    AppKit.dialog({ title: "Options", node: n, buttons: [{ label: "OK", default: true, action: (d) => {
      const draw = +$("input[name=dr]:checked", d).value, scoring = $("input[name=sc]:checked", d).value;
      const redeal = draw !== opt.draw || scoring !== opt.scoring;
      opt.draw = draw; opt.scoring = scoring; opt.timed = $("#OT", d).checked; opt.status = $("#OS", d).checked; opt.cumulative = $("#OC", d).checked;
      if (!opt.cumulative) opt.vegasBank = 0;
      saveOpt();
      if (redeal) deal(); else { status(); layout(); }
    } }, { label: "Cancel", cancel: true }] });
  }

  AppKit.menubar($("#Menu"), [
    { label: "&Game", items: () => [
      { label: "&Deal", key: "F2", action: deal },
      "-",
      { label: "&Hint", key: "H", action: hint },
      { label: "&Undo", key: "Ctrl+Z", disabled: () => !undoSnap, action: undo },
      { label: "De&ck...", action: deckDialog },
      { label: "&Options...", action: optionsDialog },
      "-",
      { label: "E&xit", action: () => AppKit.host.close() },
    ] },
    { label: "&Help", items: [
      { label: "&Contents", key: "F1", action: () => AppKit.alert("Solitaire Help", "Build the four suit stacks at the top from Ace to King.\n\nIn the row below, stack cards in descending order, alternating red and black. Only a King can go in an empty column.\n\nClick the deck to deal. Double-click a card to send it to a suit stack; right-click anywhere to send every card that can go.\n\nGame > Hint highlights a legal move for a moment.\nGame > Deck picks a card back. Game > Options sets draw three and Vegas scoring.", "info") },
      "-",
      { label: "&About Solitaire", action: () => AppKit.alert("About Solitaire", "Solitaire\nRBXBanland Edition, Version 4.10.1998\n\nCard faces from js-solitaire by Radovan Janjic (MIT).", "info") },
    ] },
  ]);
  addEventListener("keydown", (e) => {
    if (document.querySelector(".dlg-shade")) return;
    if (e.key === "F2") { e.preventDefault(); deal(); }
    else if (e.key.toLowerCase() === "h") { e.preventDefault(); hint(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (won && (e.key === "Escape" || e.key === "Enter" || e.key === " ")) { stopWin(); askAgain(); }
  });

  deal();
  window.__sol = {
    get state() { return { stock: stock.length, waste: waste.length, found: found.map((p) => p.length), tab: tab.map((p) => p.length), score, won }; },
    cheatWin() { // test hook: move everything to foundations
      found = [0, 1, 2, 3].map((s) => cards.filter((c) => c.suit === s).sort((a, b) => a.rank - b.rank));
      stock = []; waste = []; tab = tab.map(() => []);
      for (const c of cards) { c.up = true; face(c); }
      layout(); checkWin();
    },
  };
})();
