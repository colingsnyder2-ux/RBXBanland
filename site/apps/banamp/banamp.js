// BanAmp: a classic two-point-x style MP3 player. Web Audio graph: <audio> -> preamp -> 10-band EQ -> analyser -> volume -> balance.
// Local files are served back through sw.js (Cache Storage) so they play under the site's strict CSP.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
  const BAND_LABELS = ["60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K"];
  const PRESETS = {
    "Classical": [0, 0, 0, 0, 0, 0, -4.5, -4.5, -4.5, -6], "Club": [0, 0, 4, 3, 3, 3, 2, 0, 0, 0],
    "Dance": [6, 4.5, 1.5, 0, 0, -3.5, -4.5, -4.5, 0, 0], "Flat": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "Full Bass": [6, 6, 6, 3.5, 1, -3, -5, -6, -6.5, -6.5], "Full Bass & Treble": [4.5, 3.5, 0, -4.5, -3, 1, 5, 6.5, 7, 7],
    "Full Treble": [-6, -6, -6, -2.5, 1.5, 6.5, 9.5, 9.5, 9.5, 10], "Laptop Speakers / Headphones": [3, 6.5, 3, -2, -1.5, 1, 3, 6, 8, 9],
    "Large Hall": [6.5, 6.5, 3.5, 3.5, 0, -3, -3, -3, 0, 0], "Live": [-3, 0, 2.5, 3, 3, 3, 2.5, 1.5, 1.5, 1.5],
    "Party": [4.5, 4.5, 0, 0, 0, 0, 0, 0, 4.5, 4.5], "Pop": [-1, 3, 4.5, 5, 3.5, 0, -1, -1, -1, -1],
    "Reggae": [0, 0, 0, -3, 0, 4, 4, 0, 0, 0], "Rock": [5, 3, -3.5, -5, -2, 2.5, 5.5, 7, 7, 7],
    "Ska": [-1.5, -3, -2.5, 0, 2.5, 3.5, 5.5, 6, 7, 6], "Soft": [3, 1, 0, -1.5, 0, 2.5, 5, 6, 7, 7.5],
    "Soft Rock": [2.5, 2.5, 1.5, 0, -2.5, -3.5, -2, 0, 1.5, 5.5], "Techno": [5, 3.5, 0, -3.5, -3, 0, 5, 6, 6, 5.5],
    "Vaporwave": [4, 3, 1, -2, -3, -1, 2, 3, 2, 1],
  };
  const LS = "rbx.banamp";
  const S = Object.assign({
    vol: 0.75, bal: 0, eq: new Array(10).fill(0), pre: 0, eqOn: true, eqAuto: false, shuffle: false, repeat: false,
    double: false, showEQ: true, showPL: true, shade: false, vis: 0, remaining: false, list: null, cur: 0,
  }, AppKit.load(LS, {}));
  const save = () => AppKit.save(LS, { ...S, list: playlist.map(({ id, title, url, dur, local, size, license, kbps }) => ({ id, title, url, dur, local, size, license, kbps })), cur: current });

  // ---------- Colors from the skin ----------
  let GREEN = "#00e400", GREEN_DIM = "#0d3a12";
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    GREEN = cs.getPropertyValue("--green").trim() || GREEN;
    GREEN_DIM = cs.getPropertyValue("--green-dim").trim() || GREEN_DIM;
  }

  // ---------- Pixel labels ----------
  function labels() {
    for (const el of $$("[data-text]")) {
      const tog = el.closest(".tog");
      if (tog) { el.replaceChildren(PixFont.canvas(el.dataset.text, tog.classList.contains("on") ? "#3bff4a" : "#8a8aa6")); continue; }
      const dark = el.closest(".presets, .plb");
      const title = el.closest(".tb-title");
      const col = title ? "#efe6c4" : dark ? "#1a1a26" : el.classList.contains("unit") ? "#c8c8dc" : GREEN;
      el.replaceChildren(PixFont.canvas(el.dataset.text, col));
    }
    for (const b of $$(".clutter button")) b.replaceChildren(PixFont.canvas(b.dataset.l || (b.dataset.l = b.textContent), "#a8a8c4"));
    // EQ labels
    const L = $("#EqLabels");
    L.innerHTML = '<div class="sep"></div>';
    const put = (text, x, y, col = "#c8c8dc") => { const c = PixFont.canvas(text, col); c.style.left = x + "px"; c.style.top = y + "px"; L.appendChild(c); };
    put("PREAMP", 10, 104);
    const sm = (text, x, y) => { const c = PixFont.small(text, "#c8c8dc"); c.style.left = x + "px"; c.style.top = y + "px"; L.appendChild(c); };
    sm("+12DB", 44, 39); sm("+0DB", 48, 67); sm("-12DB", 44, 95);
    BAND_LABELS.forEach((t, i) => sm(t, 78 + i * 18 + 7 - ((t.length * 4 - 1) >> 1), 104));
    drawMS();
  }
  function drawMS() {
    const ch = channels;
    $("#Mono").replaceChildren(PixFont.canvas("MONO", ch === 1 ? GREEN : GREEN_DIM));
    $("#Stereo").replaceChildren(PixFont.canvas("STEREO", ch === 2 ? GREEN : GREEN_DIM));
  }

  // ---------- Audio graph ----------
  const audio = new Audio();
  audio.preload = "auto";
  let ac = null, preGain, filters, analyser, volGain, panner, channels = 0;
  function ensureAudio() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    ac = new AudioContext();
    const src = ac.createMediaElementSource(audio);
    preGain = ac.createGain();
    filters = FREQS.map((f, i) => {
      const b = ac.createBiquadFilter();
      b.type = i === 0 ? "lowshelf" : i === FREQS.length - 1 ? "highshelf" : "peaking";
      b.frequency.value = f; b.Q.value = 1.2;
      return b;
    });
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
    volGain = ac.createGain();
    panner = ac.createStereoPanner();
    let n = src.connect(preGain);
    for (const f of filters) n = n.connect(f);
    n.connect(analyser); analyser.connect(volGain); volGain.connect(panner); panner.connect(ac.destination);
    applyEQ(); applyVol();
  }
  function applyEQ() {
    if (!ac) return;
    filters.forEach((f, i) => { f.gain.value = S.eqOn ? S.eq[i] : 0; });
    preGain.gain.value = S.eqOn ? Math.pow(10, S.pre / 20) : 1;
  }
  function applyVol() {
    if (!ac) return;
    volGain.gain.value = S.vol * S.vol;
    panner.pan.value = S.bal;
  }

  // ---------- Playlist ----------
  let playlist = [], current = -1, sel = new Set(), anchor = -1, scrollTop = 0;
  let state = "stopped"; // stopped | playing | paused
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const fmt = (t) => { t = Math.max(0, Math.floor(t || 0)); const h = (t / 3600) | 0, m = ((t % 3600) / 60) | 0, s = t % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };

  async function loadBundled() {
    try {
      const r = await fetch("tracks.json", { cache: "no-cache" });
      return (await r.json()).map((t) => ({ id: "b:" + t.file, title: `${t.artist} - ${t.title}`, url: "music/" + t.file, dur: t.dur, local: false, license: t.license, kbps: t.kbps }));
    } catch { return []; }
  }
  async function init() {
    readColors(); labels();
    const bundled = await loadBundled();
    if (Array.isArray(S.list) && S.list.length) {
      playlist = S.list.filter((t) => t && t.url);
      for (const b of bundled) if (!playlist.some((t) => t.id === b.id)) playlist.push(b);
      playlist = playlist.filter((t) => t.local || bundled.some((b) => b.id === t.id));
    } else playlist = bundled;
    current = Math.min(Math.max(0, S.cur | 0), playlist.length - 1);
    renderList(); updateAll(); layout();
    if (current >= 0) { audio.src = playlist[current].url; audio.load(); }
    registerSW();
    requestAnimationFrame(frame);
  }

  function renderList() {
    const L = $("#List");
    const rowsVisible = Math.max(1, Math.floor(L.clientHeight / 13));
    const maxTop = Math.max(0, playlist.length - rowsVisible);
    scrollTop = Math.max(0, Math.min(scrollTop, maxTop));
    const frag = document.createDocumentFragment();
    for (let i = scrollTop; i < Math.min(playlist.length, scrollTop + rowsVisible + 1); i++) {
      const t = playlist[i];
      const row = document.createElement("div");
      row.className = "pl-row" + (i === current ? " cur" : "") + (sel.has(i) ? " sel" : "");
      row.dataset.i = i;
      row.setAttribute("role", "option");
      row.innerHTML = `<span class="t">${i + 1}. ${AppKit.esc(t.title)}</span><span class="d">${t.dur ? fmt(t.dur) : ""}</span>`;
      frag.appendChild(row);
    }
    L.replaceChildren(frag);
    const sc = $("#PlScroll"), th = $(".pl-thumb", sc);
    const travel = sc.clientHeight - th.offsetHeight;
    th.style.top = (maxTop ? Math.round(travel * scrollTop / maxTop) : 0) + "px";
    drawPlTotal();
  }
  function drawPlTotal() {
    const c = $("#PlTotal"), x = c.getContext("2d");
    x.clearRect(0, 0, c.width, c.height);
    const total = playlist.reduce((a, t) => a + (t.dur || 0), 0);
    const selDur = [...sel].reduce((a, i) => a + (playlist[i]?.dur || 0), 0);
    PixFont.draw(x, `${fmt(selDur)}/${fmt(total)}`, 0, 0, GREEN);
  }
  const listEl = $("#List");
  listEl.addEventListener("pointerdown", (e) => {
    const row = e.target.closest(".pl-row");
    listEl.focus();
    if (!row) { sel.clear(); renderList(); return; }
    const i = +row.dataset.i;
    if (e.shiftKey && anchor >= 0) { sel.clear(); for (let k = Math.min(anchor, i); k <= Math.max(anchor, i); k++) sel.add(k); }
    else if (e.ctrlKey || e.metaKey) { sel.has(i) ? sel.delete(i) : sel.add(i); anchor = i; }
    else if (e.button === 2 && sel.has(i)) { /* keep selection for the context menu */ }
    else { sel.clear(); sel.add(i); anchor = i; }
    renderList();
  });
  listEl.addEventListener("dblclick", (e) => { const row = e.target.closest(".pl-row"); if (row) playIndex(+row.dataset.i); });
  listEl.addEventListener("wheel", (e) => { e.preventDefault(); scrollTop += Math.sign(e.deltaY) * 3; renderList(); }, { passive: false });
  listEl.addEventListener("contextmenu", (e) => {
    e.preventDefault(); e.stopPropagation();
    AppKit.popup(e.clientX, e.clientY, [
      { label: "&Play item", action: () => { const i = [...sel][0]; if (i != null) playIndex(i); }, disabled: () => !sel.size },
      { label: "&Remove item(s)", action: removeSelected, disabled: () => !sel.size },
      "-",
      { label: "File &info...", action: () => fileInfo([...sel][0] ?? current), disabled: () => !sel.size },
    ]);
  });
  listEl.addEventListener("keydown", (e) => {
    const n = playlist.length;
    if (!n) return;
    const last = anchor >= 0 ? anchor : 0;
    const visible = Math.floor(listEl.clientHeight / 13);
    let to = null;
    if (e.key === "ArrowDown") to = Math.min(n - 1, last + 1);
    else if (e.key === "ArrowUp") to = Math.max(0, last - 1);
    else if (e.key === "PageDown") to = Math.min(n - 1, last + visible);
    else if (e.key === "PageUp") to = Math.max(0, last - visible);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = n - 1;
    else if (e.key === "Enter") { if (sel.size) playIndex([...sel][0]); e.preventDefault(); e.stopPropagation(); return; }
    else if (e.key === "Delete") { removeSelected(); e.preventDefault(); return; }
    else if (e.key === "a" && e.ctrlKey) { playlist.forEach((_, i) => sel.add(i)); renderList(); e.preventDefault(); return; }
    else return;
    e.preventDefault(); e.stopPropagation();
    sel.clear(); sel.add(to); anchor = to;
    if (to < scrollTop) scrollTop = to; else if (to >= scrollTop + visible) scrollTop = to - visible + 1;
    renderList();
  });
  // Scrollbar thumb drag
  $(".pl-thumb").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const sc = $("#PlScroll"), th = e.currentTarget, y0 = e.clientY, t0 = th.offsetTop;
    const visible = Math.floor(listEl.clientHeight / 13), maxTop = Math.max(0, playlist.length - visible);
    const travel = sc.clientHeight - th.offsetHeight;
    const mv = (ev) => { const z = zoom(); scrollTop = Math.round(Math.max(0, Math.min(travel, t0 + (ev.clientY - y0) / z)) / (travel || 1) * maxTop); renderList(); };
    const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });

  function removeSelected() {
    if (!sel.size) return;
    const removed = [...sel].sort((a, b) => b - a);
    for (const i of removed) {
      const t = playlist[i];
      if (t.local) forgetLocal(t);
      playlist.splice(i, 1);
      if (i < current) current--;
      else if (i === current) { if (state !== "stopped") stop(); current = Math.min(current, playlist.length - 1); }
    }
    sel.clear(); anchor = -1;
    renderList(); updateAll(); save();
  }

  // ---------- Transport ----------
  function playIndex(i) {
    if (i < 0 || i >= playlist.length) return;
    ensureAudio();
    current = i;
    audio.src = playlist[i].url;
    errorText = "";
    audio.play().catch((e) => showError(e));
    state = "playing"; marqueeX = 0;
    renderList(); updateAll(); save();
  }
  function play() {
    ensureAudio();
    if (!playlist.length) { openFiles(); return; }
    if (current < 0) current = 0;
    if (state === "paused") { audio.play().catch(showError); state = "playing"; updateAll(); return; }
    if (state === "playing") { audio.currentTime = 0; return; }
    playIndex(current);
  }
  function pause() {
    if (state === "playing") { audio.pause(); state = "paused"; }
    else if (state === "paused") { audio.play().catch(showError); state = "playing"; }
    updateAll();
  }
  function stop() {
    audio.pause();
    try { audio.currentTime = 0; } catch { /* ignore */ }
    state = "stopped";
    updateAll();
  }
  function step(d) {
    if (!playlist.length) return;
    let i;
    if (S.shuffle && playlist.length > 1) { do { i = (Math.random() * playlist.length) | 0; } while (i === current); }
    else {
      i = current + d;
      if (i >= playlist.length) i = 0;
      if (i < 0) i = playlist.length - 1;
    }
    if (state === "stopped") { current = i; audio.src = playlist[i].url; marqueeX = 0; renderList(); updateAll(); save(); }
    else playIndex(i);
  }
  audio.addEventListener("ended", () => {
    if (S.shuffle && playlist.length > 1) return step(1);
    if (current + 1 < playlist.length) return playIndex(current + 1);
    if (S.repeat) return playIndex(0);
    stop();
  });
  audio.addEventListener("loadedmetadata", () => {
    const t = playlist[current];
    if (t && isFinite(audio.duration) && Math.abs((t.dur || 0) - audio.duration) > 0.5) { t.dur = audio.duration; renderList(); save(); }
    detectChannels();
  });
  let errorText = "";
  function showError(e) {
    if (e && e.name === "AbortError") return;
    errorText = "ERROR: " + (e && e.name === "NotAllowedError" ? "CLICK PLAY TO START AUDIO" : "CANNOT PLAY THIS FILE");
    state = "stopped"; marqueeX = 0; updateAll();
  }
  audio.addEventListener("error", () => { if (audio.src) showError({ name: "MediaError" }); });

  // Channel count isn't exposed by <audio>; sniff it from the analyser by checking whether L and R differ.
  function detectChannels() {
    channels = 2;
    if (!ac) { drawMS(); return; }
    try {
      const sp = ac.createChannelSplitter(2), a = ac.createAnalyser(), b = ac.createAnalyser();
      a.fftSize = b.fftSize = 512;
      filters[filters.length - 1].connect(sp); sp.connect(a, 0); sp.connect(b, 1);
      const da = new Float32Array(512), db = new Float32Array(512);
      let checks = 0, diff = 0;
      const t = setInterval(() => {
        a.getFloatTimeDomainData(da); b.getFloatTimeDomainData(db);
        for (let i = 0; i < 512; i += 4) diff += Math.abs(da[i] - db[i]);
        if (++checks >= 6) { clearInterval(t); try { filters[filters.length - 1].disconnect(sp); } catch { /* ignore */ } channels = diff > 0.01 ? 2 : 1; drawMS(); }
      }, 150);
    } catch { drawMS(); }
  }

  // ---------- Displays ----------
  const ctxOf = (id) => $(id).getContext("2d");
  const cStatus = ctxOf("#Status"), cTime = ctxOf("#Time"), cVis = ctxOf("#Vis"), cMarq = ctxOf("#Marquee");
  const cKbps = ctxOf("#Kbps"), cKhz = ctxOf("#Khz"), cPlTime = ctxOf("#PlTime"), cGraph = ctxOf("#EqGraph");
  let marqueeX = 0, marqueeOverride = null, blink = true;

  function drawStatus() {
    const x = cStatus;
    x.clearRect(0, 0, 9, 9);
    x.fillStyle = state === "playing" ? GREEN : state === "paused" ? "#e8c000" : "#c03020";
    if (state === "playing") { for (let i = 0; i < 4; i++) x.fillRect(2 + i, 1 + i, 1, 7 - 2 * i); }
    else if (state === "paused") { x.fillRect(2, 1, 2, 7); x.fillRect(5, 1, 2, 7); }
    else x.fillRect(2, 1, 6, 6);
  }
  function drawTime() {
    const x = cTime;
    x.clearRect(0, 0, 63, 13);
    if (state === "stopped") return;
    if (state === "paused" && !blink) return;
    const d = audio.duration || playlist[current]?.dur || 0;
    let t = audio.currentTime || 0;
    let neg = false;
    if (S.remaining && d) { t = Math.max(0, d - t); neg = true; }
    t = Math.floor(t);
    let m = Math.floor(t / 60), s = t % 60;
    if (m > 99) m = 99;
    const str = String(m).padStart(2, "0") + String(s).padStart(2, "0");
    if (neg) PixFont.digit(x, "-", 0, 0, GREEN, null);
    PixFont.digit(x, str[0], 12, 0, GREEN, null);
    PixFont.digit(x, str[1], 24, 0, GREEN, null);
    x.fillStyle = GREEN; x.fillRect(36, 3, 2, 2); x.fillRect(36, 8, 2, 2);
    PixFont.digit(x, str[2], 42, 0, GREEN, null);
    PixFont.digit(x, str[3], 54, 0, GREEN, null);
  }
  function marqueeText() {
    if (marqueeOverride) return marqueeOverride;
    if (errorText) return errorText;
    const t = playlist[current];
    if (!t) return "BANAMP 2.91 - DROP SOME TUNES IN THE PLAYLIST";
    return `${current + 1}. ${t.title} (${fmt(t.dur || audio.duration || 0)})`;
  }
  function drawMarquee() {
    const x = cMarq;
    x.clearRect(0, 0, 154, 6);
    const txt = marqueeText();
    const w = PixFont.width(txt);
    if (marqueeOverride || w <= 154) { PixFont.draw(x, txt, 0, 0, GREEN); return; }
    const full = txt + "  ***  ", fw = PixFont.width(full);
    const off = marqueeX % fw;
    PixFont.draw(x, full + full, -off, 0, GREEN);
  }
  function drawInfo() {
    cKbps.clearRect(0, 0, 17, 6); cKhz.clearRect(0, 0, 11, 6);
    const t = playlist[current];
    if (!t || state === "stopped" && !audio.duration) return;
    const d = t.dur || audio.duration;
    const kbps = t.kbps || (t.size && d ? Math.round(t.size * 8 / d / 1000) : 0);
    if (kbps) PixFont.draw(cKbps, String(Math.min(999, kbps)).padStart(3, " "), 0, 0, GREEN);
    PixFont.draw(cKhz, String(t.khz || 44), 0, 0, GREEN);
  }
  function drawPlTime() {
    cPlTime.clearRect(0, 0, 30, 6);
    if (state === "stopped") return;
    PixFont.draw(cPlTime, fmt(audio.currentTime), 0, 0, GREEN);
  }

  // Visualizer
  const bars = new Float32Array(19), peaks = new Float32Array(19), peakHold = new Uint8Array(19);
  let freqData = null, timeData = null;
  const VIS_COLORS = Array.from({ length: 16 }, (_, y) => `hsl(${Math.round(y / 15 * 120)} 100% ${y < 3 ? 48 : 45}%)`);
  function drawVis() {
    const x = cVis;
    x.fillStyle = "#000"; x.fillRect(0, 0, 76, 16);
    x.fillStyle = "#151520";
    for (let yy = 1; yy < 16; yy += 2) for (let xx = 1; xx < 76; xx += 2) x.fillRect(xx, yy, 1, 1);
    if (S.vis === 2) return;
    const live = ac && analyser && state === "playing";
    if (S.vis === 1) {
      if (!live) { x.fillStyle = VIS_COLORS[8]; x.fillRect(0, 8, 76, 1); return; }
      if (!timeData) timeData = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(timeData);
      let prev = null;
      for (let i = 0; i < 76; i++) {
        const v = timeData[Math.floor(i * timeData.length / 76 / 2)];
        const y = Math.max(0, Math.min(15, Math.round((v - 128) / 128 * 10 + 8)));
        x.fillStyle = VIS_COLORS[Math.min(15, Math.abs(y - 8) * 2 > 15 ? 0 : 15 - Math.abs(y - 8) * 2)];
        const a = prev == null ? y : prev;
        x.fillRect(i, Math.min(a, y), 1, Math.abs(a - y) + 1);
        prev = y;
      }
      return;
    }
    if (live) {
      if (!freqData) freqData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(freqData);
      const ny = ac.sampleRate / 2, n = freqData.length;
      for (let b = 0; b < 19; b++) {
        const f0 = 40 * Math.pow(16000 / 40, b / 19), f1 = 40 * Math.pow(16000 / 40, (b + 1) / 19);
        const i0 = Math.max(1, Math.floor(f0 / ny * n)), i1 = Math.max(i0 + 1, Math.ceil(f1 / ny * n));
        let m = -200;
        for (let i = i0; i < i1 && i < n; i++) m = Math.max(m, freqData[i]);
        const h = Math.max(0, Math.min(16, (m + 88) / 58 * 16));
        bars[b] = Math.max(h, bars[b] - 0.9);
      }
    } else for (let b = 0; b < 19; b++) bars[b] = Math.max(0, bars[b] - 0.9);
    for (let b = 0; b < 19; b++) {
      const h = Math.round(bars[b]);
      for (let k = 0; k < h; k++) { x.fillStyle = VIS_COLORS[16 - h + k]; x.fillRect(b * 4, 16 - h + k, 3, 1); }
      if (bars[b] >= peaks[b]) { peaks[b] = bars[b]; peakHold[b] = 12; }
      else if (peakHold[b]) peakHold[b]--;
      else peaks[b] = Math.max(0, peaks[b] - 0.25);
      const p = Math.round(peaks[b]);
      if (p > 0) { x.fillStyle = "#c8c8d0"; x.fillRect(b * 4, Math.min(15, 16 - p), 3, 1); }
    }
  }
  $("#Vis").addEventListener("click", () => { S.vis = (S.vis + 1) % 3; save(); });
  $("#Time").addEventListener("click", () => { S.remaining = !S.remaining; save(); drawTime(); });

  let lastTick = 0, lastMarq = 0, lastBlink = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - lastTick < 1000 / 40) return;
    lastTick = ts;
    if (ts - lastBlink > 500) { blink = !blink; lastBlink = ts; }
    if (ts - lastMarq > 180) { marqueeX += 6; lastMarq = ts; drawMarquee(); }
    drawTime(); drawVis(); drawPlTime(); updatePos();
  }

  function updateAll() {
    drawStatus(); drawTime(); drawMarquee(); drawInfo(); drawPlTime(); updatePos(); drawGraph();
    $("#BtnShuffle").classList.toggle("on", S.shuffle);
    $("#BtnRepeat").classList.toggle("on", S.repeat);
    $("#BtnEQ").classList.toggle("on", S.showEQ);
    $("#BtnPL").classList.toggle("on", S.showPL);
    $("#EqOn").classList.toggle("on", S.eqOn);
    $("#EqAuto").classList.toggle("on", S.eqAuto);
    $$(".clutter button")[3].classList.toggle("on", S.double);
    for (const t of $$(".tog")) {
      const on = t.classList.contains("on"), sp = $("[data-text]", t);
      if (sp && sp.dataset.lit !== String(on)) { sp.dataset.lit = String(on); sp.replaceChildren(PixFont.canvas(sp.dataset.text, on ? "#3bff4a" : "#8a8aa6")); }
    }
    setSlider($("#Volume"), S.vol);
    setSlider($("#Balance"), (S.bal + 1) / 2);
    $("#Volume").style.setProperty("--track", `hsl(${Math.round(120 - 120 * S.vol)} 85% 32%)`);
    $("#Balance").style.setProperty("--track", `hsl(${Math.round(120 - 120 * Math.abs(S.bal))} 85% 32%)`);
    bands.forEach((b, i) => setBand(b, i === 0 ? S.pre : S.eq[i - 1]));
    document.title = playlist[current] && state !== "stopped" ? `${current + 1}. ${playlist[current].title} - BanAmp` : "BanAmp";
  }

  // ---------- Sliders ----------
  const zoom = () => (S.double ? 2 : 1);
  function setSlider(el, f) {
    const th = $(".thumb", el);
    th.style.left = Math.round(f * (el.clientWidth - th.offsetWidth)) + "px";
  }
  function dragSlider(el, onMove, onEnd) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add("held");
      const th = $(".thumb", el);
      const r = el.getBoundingClientRect();
      const z = r.width / el.offsetWidth;
      const grab = e.target === th ? (e.clientX - th.getBoundingClientRect().left) / z : th.offsetWidth / 2;
      const calc = (ev) => Math.max(0, Math.min(1, ((ev.clientX - r.left) / z - grab) / (el.offsetWidth - th.offsetWidth)));
      onMove(calc(e));
      const mv = (ev) => onMove(calc(ev));
      const up = (ev) => { el.classList.remove("held"); el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); onEnd && onEnd(calc(ev)); };
      el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
    });
  }
  dragSlider($("#Volume"), (f) => { S.vol = f; applyVol(); marqueeOverride = `VOLUME: ${Math.round(f * 100)}%`; updateAll(); }, () => { marqueeOverride = null; save(); drawMarquee(); });
  dragSlider($("#Balance"), (f) => {
    let b = f * 2 - 1; if (Math.abs(b) < 0.08) b = 0;
    S.bal = b; applyVol();
    marqueeOverride = b === 0 ? "BALANCE: CENTER" : `BALANCE: ${Math.round(Math.abs(b) * 100)}% ${b < 0 ? "LEFT" : "RIGHT"}`;
    updateAll();
  }, () => { marqueeOverride = null; save(); drawMarquee(); });
  $("#Volume").addEventListener("wheel", (e) => { e.preventDefault(); S.vol = Math.max(0, Math.min(1, S.vol - Math.sign(e.deltaY) * 0.04)); applyVol(); updateAll(); save(); }, { passive: false });

  let seeking = null;
  function updatePos() {
    const el = $("#Pos"), th = $(".thumb", el);
    const d = audio.duration;
    const live = state !== "stopped" && isFinite(d) && d > 0;
    el.classList.toggle("live", live);
    if (!live) return;
    const f = seeking != null ? seeking : audio.currentTime / d;
    th.style.left = Math.round(f * (el.clientWidth - 29)) + "px";
  }
  dragSlider($("#Pos"), (f) => {
    if (state === "stopped" || !isFinite(audio.duration)) return;
    seeking = f;
    const d = audio.duration;
    marqueeOverride = `SEEK TO: ${fmt(f * d)}/${fmt(d)} (${Math.round(f * 100)}%)`;
    updatePos(); drawMarquee();
  }, (f) => {
    if (seeking == null) return;
    seeking = null; marqueeOverride = null;
    try { audio.currentTime = f * audio.duration; } catch { /* ignore */ }
    drawMarquee();
  });

  // ---------- Equalizer ----------
  const bandsEl = $("#Bands");
  const bands = [];
  for (let i = 0; i <= 10; i++) {
    const b = document.createElement("div");
    b.className = "band";
    b.style.left = (i === 0 ? 21 : 78 + (i - 1) * 18) + "px";
    b.innerHTML = '<div class="fill"></div><div class="thumb"></div>';
    b.title = i === 0 ? "Preamp" : BAND_LABELS[i - 1] + " Hz";
    bandsEl.appendChild(b);
    bands.push(b);
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      const r = b.getBoundingClientRect(), z = r.height / b.offsetHeight;
      const calc = (ev) => { const f = Math.max(0, Math.min(1, ((ev.clientY - r.top) / z - 5.5) / 52)); let v = Math.round((12 - f * 24) * 2) / 2; if (Math.abs(v) < 0.75) v = 0; return v; };
      const set = (v) => {
        if (i === 0) S.pre = v; else S.eq[i - 1] = v;
        marqueeOverride = i === 0 ? `PREAMP: ${v > 0 ? "+" : ""}${v.toFixed(1)} DB` : `EQ: ${BAND_LABELS[i - 1]}HZ: ${v > 0 ? "+" : ""}${v.toFixed(1)} DB`;
        applyEQ(); setBand(b, v); drawGraph(); drawMarquee();
      };
      set(calc(e));
      const mv = (ev) => set(calc(ev));
      const up = () => { b.removeEventListener("pointermove", mv); b.removeEventListener("pointerup", up); marqueeOverride = null; drawMarquee(); save(); };
      b.addEventListener("pointermove", mv); b.addEventListener("pointerup", up);
    });
    b.addEventListener("dblclick", () => { if (i === 0) S.pre = 0; else S.eq[i - 1] = 0; applyEQ(); updateAll(); save(); });
  }
  function bandColor(v) { return `hsl(${Math.round(120 - (v + 12) / 24 * 120)} 90% 45%)`; }
  function setBand(b, v) {
    const top = Math.round((12 - v) / 24 * 52);
    $(".thumb", b).style.top = top + "px";
    const fill = $(".fill", b);
    fill.style.top = (top + 5) + "px"; fill.style.height = (63 - top - 5) + "px";
    fill.style.setProperty("--c", bandColor(v));
  }
  function drawGraph() {
    const x = cGraph;
    x.clearRect(0, 0, 113, 19);
    x.fillStyle = "#30303c"; x.fillRect(0, 9, 113, 1);
    // Preamp line
    x.fillStyle = "#5a5a6a"; x.fillRect(0, Math.round(9 - S.pre / 12 * 8), 113, 1);
    const pts = S.eq.map((v, i) => [2 + i * 12, 9 - v / 12 * 8]);
    // Catmull-Rom through the 10 points.
    let prevY = null;
    for (let px = 2; px <= 110; px++) {
      const t = (px - 2) / 12, i = Math.min(8, Math.floor(t)), u = t - i;
      const p0 = pts[Math.max(0, i - 1)][1], p1 = pts[i][1], p2 = pts[i + 1][1], p3 = pts[Math.min(9, i + 2)][1];
      const y = Math.round(Math.max(0, Math.min(18, 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u))));
      const a = prevY == null ? y : prevY;
      for (let yy = Math.min(a, y); yy <= Math.max(a, y); yy++) { x.fillStyle = bandColor((9 - yy) / 8 * 12); x.fillRect(px, yy, 1, 1); }
      prevY = y;
    }
  }
  function presetsMenu() {
    const r = $(".presets").getBoundingClientRect();
    AppKit.popup(r.left, r.bottom, [
      ...Object.keys(PRESETS).map((name) => ({ label: name, action: () => { S.eq = PRESETS[name].slice(); applyEQ(); updateAll(); save(); } })),
      "-",
      { label: "&Reset to flat", action: () => { S.eq = new Array(10).fill(0); S.pre = 0; applyEQ(); updateAll(); save(); } },
    ]);
  }

  // ---------- Files ----------
  let swReady = null;
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    swReady = navigator.serviceWorker.register("sw.js", { scope: "./" }).then(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((res) => {
        navigator.serviceWorker.addEventListener("controllerchange", res, { once: true });
        setTimeout(res, 3000);
      });
      return !!navigator.serviceWorker.controller;
    }).catch((e) => { console.warn("BanAmp: service worker unavailable", e); return false; });
  }
  const CACHE = "banamp-local-v1";
  async function addFiles(files) {
    files = [...files].filter((f) => /^audio\//.test(f.type) || /\.(mp3|ogg|oga|wav|flac|m4a|aac|opus|webm)$/i.test(f.name));
    if (!files.length) return;
    const ok = swReady && await swReady;
    if (!ok || !("caches" in window)) {
      AppKit.alert("BanAmp", "Local files need a service worker, which this browser blocked here.\nThe bundled tracks still play.", "error");
      return;
    }
    const cache = await caches.open(CACHE);
    const first = playlist.length;
    for (const f of files) {
      const id = uid();
      const url = "local/" + id;
      const abs = new URL(url, location.href).pathname;
      await cache.put(abs, new Response(f, { headers: { "Content-Type": f.type || "audio/mpeg" } }));
      const tags = await readTags(f);
      const title = tags || f.name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
      const item = { id: "l:" + id, title, url, dur: 0, local: true, size: f.size };
      playlist.push(item);
      probeDuration(item);
    }
    renderList(); save();
    if (state === "stopped" && first === 0) playIndex(0);
    else if (state === "stopped") { current = first; playIndex(first); }
  }
  function probeDuration(item) {
    const a = new Audio();
    a.preload = "metadata";
    a.src = item.url;
    a.addEventListener("loadedmetadata", () => { if (isFinite(a.duration)) { item.dur = a.duration; renderList(); save(); } a.src = ""; }, { once: true });
  }
  async function forgetLocal(t) {
    try { const c = await caches.open(CACHE); await c.delete(new URL(t.url, location.href).pathname); } catch { /* ignore */ }
  }
  // Minimal ID3v2 reader for "Artist - Title".
  async function readTags(file) {
    try {
      const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
      if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
      const ver = head[3];
      const size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
      const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 512 * 1024)).arrayBuffer());
      const want = ver === 2 ? { TT2: "title", TP1: "artist" } : { TIT2: "title", TPE1: "artist" };
      const out = {};
      let p = 0;
      const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
      while (p + hdr < buf.length) {
        const id = String.fromCharCode(...buf.slice(p, p + idLen));
        if (!/^[A-Z0-9]+$/.test(id)) break;
        let len;
        if (ver === 2) len = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5];
        else if (ver === 4) len = (buf[p + 4] << 21) | (buf[p + 5] << 14) | (buf[p + 6] << 7) | buf[p + 7];
        else len = (buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7];
        const body = buf.slice(p + hdr, p + hdr + len);
        if (want[id] && body.length > 1) {
          const enc = body[0], data = body.slice(1);
          const dec = enc === 0 ? new TextDecoder("latin1") : enc === 3 ? new TextDecoder("utf-8") : enc === 2 ? new TextDecoder("utf-16be") : new TextDecoder("utf-16");
          out[want[id]] = dec.decode(data).replace(/\0+$/g, "").replace(/\0/g, " ").trim();
        }
        p += hdr + len;
      }
      if (out.title) return out.artist ? `${out.artist} - ${out.title}` : out.title;
    } catch { /* ignore */ }
    return null;
  }
  function openFiles() { $("#FileIn").click(); }
  $("#FileIn").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  // Drag and drop
  let dragDepth = 0;
  addEventListener("dragenter", (e) => { if (e.dataTransfer?.types?.includes("Files")) { dragDepth++; $("#Drop").hidden = false; e.preventDefault(); } });
  addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#Drop").hidden = true; } });
  addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; $("#Drop").hidden = true; if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

  function fileInfo(i) {
    const t = playlist[i];
    if (!t) return;
    const n = document.createElement("div");
    n.style.cssText = "min-width:260px;line-height:1.6";
    n.innerHTML = `<b>${AppKit.esc(t.title)}</b><br>Length: ${t.dur ? fmt(t.dur) : "unknown"}<br>` +
      (t.size ? `Size: ${(t.size / 1048576).toFixed(2)} MB<br>` : "") +
      `Source: ${t.local ? "your computer (stored in this browser)" : "bundled with BanAmp"}` + (t.license ? `<br>License: ${AppKit.esc(t.license)}` : "");
    AppKit.dialog({ title: "BanAmp File Info", node: n });
  }

  // ---------- Layout / window ----------
  function layout() {
    $("#EQ").hidden = !S.showEQ;
    $("#PL").hidden = !S.showPL;
    $("#Main").classList.toggle("shade", S.shade);
    $("#App").classList.toggle("double", S.double);
    const h = (S.shade ? 14 : 116) + (S.showEQ ? 116 : 0) + (S.showPL ? 232 : 0);
    AppKit.host.resizeClient(275 * zoom(), h * zoom());
    updateAll(); renderList();
  }
  addEventListener("focus", () => document.body.classList.remove("blur"));
  addEventListener("blur", () => document.body.classList.add("blur"));
  AppKit.onTheme(() => { readColors(); labels(); updateAll(); renderList(); });

  function about() {
    AppKit.alert("About BanAmp", "BanAmp 2.91 (RBXBanland Edition)\n\nIt really whips the banhammer.\n\nA from-scratch tribute to the classic skinnable MP3 players of 1999.\nBundled music is CC0 - see CREDITS.md.\n\nKeys: Z prev, X play, C pause, V stop, B next, L open,\narrows seek/volume, Ctrl+D double size.", "info");
  }
  function mainMenu(x, y) {
    AppKit.popup(x, y, [
      { label: "&About BanAmp...", action: about },
      "-",
      { label: "Play &file...", key: "L", action: openFiles },
      "-",
      { label: "&Main Window", checked: () => true, disabled: () => true },
      { label: "&Equalizer", key: "Alt+G", checked: () => S.showEQ, action: () => toggle("showEQ") },
      { label: "&Playlist Editor", key: "Alt+E", checked: () => S.showPL, action: () => toggle("showPL") },
      "-",
      { label: "&Double Size", key: "Ctrl+D", checked: () => S.double, action: () => toggle("double") },
      { label: "Windowshade &mode", checked: () => S.shade, action: () => toggle("shade") },
      { label: "Time &remaining", checked: () => S.remaining, action: () => { S.remaining = !S.remaining; save(); } },
      "-",
      { label: "Spectrum analyzer", radio: true, checked: () => S.vis === 0, action: () => { S.vis = 0; save(); } },
      { label: "Oscilloscope", radio: true, checked: () => S.vis === 1, action: () => { S.vis = 1; save(); } },
      { label: "No visualization", radio: true, checked: () => S.vis === 2, action: () => { S.vis = 2; save(); } },
      "-",
      { label: "Pre&vious", key: "Z", action: () => step(-1) },
      { label: "&Play", key: "X", action: play },
      { label: "P&ause", key: "C", action: pause },
      { label: "&Stop", key: "V", action: stop },
      { label: "&Next", key: "B", action: () => step(1) },
      { label: "S&huffle", key: "S", checked: () => S.shuffle, action: () => toggle("shuffle") },
      { label: "&Repeat", key: "R", checked: () => S.repeat, action: () => toggle("repeat") },
      "-",
      { label: "E&xit", action: () => { stop(); AppKit.host.close(); } },
    ]);
  }
  function toggle(k) {
    S[k] = !S[k];
    save();
    if (k === "showEQ" || k === "showPL" || k === "double" || k === "shade") layout(); else updateAll();
  }

  const ACTIONS = {
    menu: (e) => { const r = e.currentTarget.getBoundingClientRect(); mainMenu(r.left, r.bottom); },
    opts: (e) => { const r = e.currentTarget.getBoundingClientRect(); mainMenu(r.right, r.top); },
    vismenu: (e) => { const r = e.currentTarget.getBoundingClientRect(); AppKit.popup(r.right, r.top, [
      { label: "Spectrum analyzer", radio: true, checked: () => S.vis === 0, action: () => { S.vis = 0; save(); } },
      { label: "Oscilloscope", radio: true, checked: () => S.vis === 1, action: () => { S.vis = 1; save(); } },
      { label: "No visualization", radio: true, checked: () => S.vis === 2, action: () => { S.vis = 2; save(); } }]); },
    ontop: () => AppKit.alert("BanAmp", "BanAmp is already on top of your heart.", "info"),
    info: () => fileInfo(current),
    double: () => toggle("double"),
    minimize: () => AppKit.host.minimize(),
    shade: () => toggle("shade"),
    close: () => { stop(); AppKit.host.close(); },
    prev: () => step(-1), play, pause, stop, next: () => step(1), open: openFiles,
    shuffle: () => toggle("shuffle"), repeat: () => toggle("repeat"),
    toggleEQ: () => toggle("showEQ"), togglePL: () => toggle("showPL"),
    eqOn: () => { S.eqOn = !S.eqOn; applyEQ(); updateAll(); save(); },
    eqAuto: () => toggle("eqAuto"),
    presets: presetsMenu, about,
    plAdd: (e) => { const r = e.currentTarget.getBoundingClientRect(); AppKit.popup(r.left, r.top - 60, [
      { label: "Add &file(s)...", action: openFiles },
      { label: "Add bundled &tracks", action: async () => { const b = await loadBundled(); for (const t of b) if (!playlist.some((p) => p.id === t.id)) playlist.push(t); renderList(); save(); } },
    ]); },
    plRem: (e) => { const r = e.currentTarget.getBoundingClientRect(); AppKit.popup(r.left, r.top - 60, [
      { label: "Remove &selected", action: removeSelected, disabled: () => !sel.size },
      { label: "Remove &all", action: () => { playlist.forEach((_, i) => sel.add(i)); removeSelected(); } },
    ]); },
    plSel: (e) => { const r = e.currentTarget.getBoundingClientRect(); AppKit.popup(r.left, r.top - 60, [
      { label: "Select &all", action: () => { playlist.forEach((_, i) => sel.add(i)); renderList(); } },
      { label: "Select &none", action: () => { sel.clear(); renderList(); } },
      { label: "&Invert selection", action: () => { playlist.forEach((_, i) => sel.has(i) ? sel.delete(i) : sel.add(i)); renderList(); } },
    ]); },
    plMisc: (e) => { const r = e.currentTarget.getBoundingClientRect(); AppKit.popup(r.left, r.top - 60, [
      { label: "Sort by &title", action: () => reorder((a, b) => a.title.localeCompare(b.title)) },
      { label: "&Randomize list", action: () => reorder(() => Math.random() - 0.5) },
      { label: "Re&verse list", action: () => { const cur = playlist[current]; playlist.reverse(); current = playlist.indexOf(cur); sel.clear(); renderList(); save(); } },
      "-",
      { label: "File &info...", action: () => fileInfo([...sel][0] ?? current) },
    ]); },
    plList: (e) => { const r = e.currentTarget.getBoundingClientRect(); AppKit.popup(r.left - 60, r.top - 40, [
      { label: "&New list (bundled tracks)", action: async () => { stop(); for (const t of playlist) if (t.local) forgetLocal(t); playlist = await loadBundled(); current = 0; sel.clear(); renderList(); updateAll(); save(); } },
      { label: "&Clear list", action: () => { stop(); for (const t of playlist) if (t.local) forgetLocal(t); playlist = []; current = -1; sel.clear(); renderList(); updateAll(); save(); } },
    ]); },
  };
  function reorder(fn) {
    const cur = playlist[current];
    playlist.sort(fn);
    current = playlist.indexOf(cur);
    sel.clear(); renderList(); save();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const f = ACTIONS[b.dataset.act];
    if (f) f({ currentTarget: b, event: e });
  });
  document.addEventListener("contextmenu", (e) => { e.preventDefault(); mainMenu(e.clientX, e.clientY); });
  $(".tbar").addEventListener("dblclick", (e) => { if (!e.target.closest("button")) toggle("shade"); });

  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || document.querySelector(".dlg-shade")) return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === "d") { e.preventDefault(); toggle("double"); return; }
    if (e.altKey && k === "g") { e.preventDefault(); toggle("showEQ"); return; }
    if (e.altKey && k === "e") { e.preventDefault(); toggle("showPL"); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const map = { z: () => step(-1), x: play, c: pause, v: stop, b: () => step(1), l: openFiles, s: () => toggle("shuffle"), r: () => toggle("repeat") };
    if (map[k]) { e.preventDefault(); map[k](); return; }
    if (e.target === listEl) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { if (state !== "stopped") audio.currentTime = Math.max(0, audio.currentTime + (e.key === "ArrowLeft" ? -5 : 5)); e.preventDefault(); }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { S.vol = Math.max(0, Math.min(1, S.vol + (e.key === "ArrowUp" ? 0.02 : -0.02))); applyVol(); updateAll(); save(); e.preventDefault(); }
  });

  window.__banamp = { get state() { return { state, current, n: playlist.length, time: audio.currentTime, dur: audio.duration, ch: channels }; }, playlist: () => playlist };
  init();
})();
