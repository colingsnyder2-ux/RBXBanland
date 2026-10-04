// Shared helpers for RBXBanland desktop apps: theme sync, Win98-style menus and dialogs, host window helpers.
// Every app page loads this first. Themes come from the shell's localStorage key "rbx.theme".
(() => {
  const KEY = "rbx.theme";
  const root = document.documentElement;
  const listeners = [];

  function stored() { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } }
  function parentTheme() { try { return window.parent !== window && window.parent.document.documentElement.dataset.os || ""; } catch { return ""; } }
  function current() { return parentTheme() || stored() || "win98"; }
  function apply(t) {
    t = t || "win98";
    if (root.dataset.os === t) return;
    root.dataset.os = t;
    for (const f of listeners) { try { f(t); } catch (e) { console.error(e); } }
  }
  apply(current());
  addEventListener("storage", (e) => { if (e.key === KEY) apply(e.newValue || "win98"); });
  // Same-origin parent: follow its data-os attribute directly (instant, and works even if storage is blocked).
  try {
    if (window.parent !== window) new MutationObserver(() => apply(parentTheme() || stored())).observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ["data-os"] });
  } catch { /* not same origin */ }

  // ---------- Host window (the desktop window around our iframe) ----------
  function hostWindow() {
    try {
      const fe = window.frameElement;
      return fe ? fe.closest(".window") : null;
    } catch { return null; }
  }
  const host = {
    embedded: window.parent !== window,
    // Resize so the iframe's client area is w x h. Uses the shell API if it exists, else adjusts the window element.
    resizeClient(w, h) {
      try {
        const api = window.parent.RBDesktop;
        if (api && typeof api.resizeApp === "function") { api.resizeApp(window, w, h); return; }
      } catch { /* ignore */ }
      const win = hostWindow();
      const fe = window.frameElement;
      if (!win || !fe || win.classList.contains("maximized")) return;
      const dw = win.offsetWidth - fe.clientWidth, dh = win.offsetHeight - fe.clientHeight;
      win.style.width = (w + dw) + "px";
      win.style.height = (h + dh) + "px";
      // Keep it on screen.
      const desk = win.parentElement.getBoundingClientRect();
      const r = win.getBoundingClientRect();
      if (r.right > desk.right) win.style.left = Math.max(0, desk.width - r.width) + "px";
      if (r.bottom > desk.bottom) win.style.top = Math.max(0, desk.height - r.height) + "px";
    },
    minimize() {
      try {
        const api = window.parent.RBDesktop;
        if (api && typeof api.minimizeApp === "function") { api.minimizeApp(window); return; }
      } catch { /* ignore */ }
      hostWindow()?.querySelector(".tb-min")?.click();
    },
    close() {
      try {
        const api = window.parent.RBDesktop;
        if (api && typeof api.closeApp === "function") { api.closeApp(window); return; }
      } catch { /* ignore */ }
      const btn = hostWindow()?.querySelector(".tb-close");
      if (btn) btn.click(); else window.close();
    },
  };

  // ---------- Menus ----------
  // AppKit.menubar(el, [{ label: "&Game", items: [{ label: "&New", key: "F2", action, checked: () => bool, disabled: () => bool }, "-", ...] }])
  function amp(label) {
    const i = label.indexOf("&");
    if (i < 0) return { html: esc(label), key: "" };
    return { html: esc(label.slice(0, i)) + "<u>" + esc(label[i + 1]) + "</u>" + esc(label.slice(i + 2)), key: label[i + 1].toLowerCase() };
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

  let openMenu = null;
  function closeMenus() {
    if (!openMenu) return;
    openMenu.btn.classList.remove("open");
    openMenu.pop.remove();
    openMenu = null;
  }
  addEventListener("pointerdown", (e) => { if (openMenu && !e.target.closest(".mb-pop, .mb-item")) closeMenus(); }, true);
  addEventListener("blur", closeMenus);

  function buildPop(items, btn) {
    const pop = document.createElement("div");
    pop.className = "mb-pop";
    pop.setAttribute("role", "menu");
    const rows = [];
    for (const it of items) {
      if (it === "-") { pop.insertAdjacentHTML("beforeend", '<div class="mb-sep"></div>'); continue; }
      const a = amp(it.label);
      const row = document.createElement("div");
      row.className = "mb-row";
      row.setAttribute("role", "menuitem");
      const dis = it.disabled && it.disabled();
      const chk = it.checked && it.checked();
      if (dis) row.classList.add("disabled");
      row.innerHTML = `<span class="mb-check">${chk ? (it.radio ? "●" : "✓") : ""}</span><span class="mb-label">${a.html}</span><span class="mb-key">${esc(it.key || "")}</span>`;
      row.dataset.k = a.key;
      row.addEventListener("pointerenter", () => setActive(pop, row));
      row.addEventListener("click", () => { if (dis) return; closeMenus(); it.action && it.action(); });
      rows.push(row);
      pop.appendChild(row);
    }
    return pop;
  }
  function setActive(pop, row) {
    for (const r of pop.querySelectorAll(".mb-row.active")) r.classList.remove("active");
    if (row) row.classList.add("active");
  }

  function menubar(el, menus) {
    el.classList.add("menubar");
    el.setAttribute("role", "menubar");
    const btns = menus.map((m) => {
      const a = amp(m.label);
      const b = document.createElement("div");
      b.className = "mb-item";
      b.innerHTML = a.html;
      b.dataset.k = a.key;
      el.appendChild(b);
      const show = () => {
        closeMenus();
        const items = typeof m.items === "function" ? m.items() : m.items;
        const pop = buildPop(items, b);
        document.body.appendChild(pop);
        const r = b.getBoundingClientRect();
        pop.style.left = Math.min(r.left, innerWidth - pop.offsetWidth - 2) + "px";
        pop.style.top = r.bottom + "px";
        b.classList.add("open");
        openMenu = { btn: b, pop, index: btns.indexOf(b) };
      };
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); if (openMenu && openMenu.btn === b) closeMenus(); else show(); });
      b.addEventListener("pointerenter", () => { if (openMenu && openMenu.btn !== b) show(); });
      b._show = show;
      return b;
    });
    // Keyboard: Alt+letter opens a menu, arrows move, Enter activates, Esc closes.
    addEventListener("keydown", (e) => {
      if (e.altKey && !e.ctrlKey && e.key.length === 1) {
        const b = btns.find((x) => x.dataset.k === e.key.toLowerCase());
        if (b) { e.preventDefault(); b._show(); const f = openMenu.pop.querySelector(".mb-row:not(.disabled)"); setActive(openMenu.pop, f); }
        return;
      }
      if (!openMenu) return;
      const rows = [...openMenu.pop.querySelectorAll(".mb-row")];
      const cur = rows.findIndex((r) => r.classList.contains("active"));
      const go = (d) => { const n = rows.length; for (let i = 1; i <= n; i++) { const r = rows[(cur + d * i + n * 2) % n]; if (!r.classList.contains("disabled")) { setActive(openMenu.pop, r); return; } } };
      if (e.key === "Escape") { closeMenus(); }
      else if (e.key === "ArrowDown") go(1);
      else if (e.key === "ArrowUp") go(-1);
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const i = (openMenu.index + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length; btns[i]._show(); setActive(openMenu.pop, openMenu.pop.querySelector(".mb-row:not(.disabled)")); }
      else if (e.key === "Enter") { if (cur >= 0) rows[cur].click(); }
      else if (e.key.length === 1) { const r = rows.find((x) => x.dataset.k === e.key.toLowerCase() && !x.classList.contains("disabled")); if (r) r.click(); }
      else return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    return { close: closeMenus };
  }

  // Context-style popup menu at a point.
  function popup(x, y, items) {
    closeMenus();
    const fake = document.createElement("div");
    const pop = buildPop(items, fake);
    document.body.appendChild(pop);
    pop.style.left = Math.min(x, innerWidth - pop.offsetWidth - 2) + "px";
    pop.style.top = Math.min(y, innerHeight - pop.offsetHeight - 2) + "px";
    openMenu = { btn: fake, pop, index: -1 };
  }

  // ---------- Dialogs ----------
  // AppKit.dialog({ title, html | node, buttons: [{ label, default, cancel, action(dlg) -> false keeps open }], onOpen(dlg) }) -> Promise(label)
  function dialog(opts) {
    return new Promise((resolve) => {
      const shade = document.createElement("div");
      shade.className = "dlg-shade";
      const d = document.createElement("div");
      d.className = "dlg";
      d.setAttribute("role", "dialog");
      d.innerHTML = `<div class="dlg-title"><span>${esc(opts.title || "")}</span><button class="dlg-x" aria-label="Close"><svg width="8" height="7" viewBox="0 0 8 7"><path d="M0 0h2v1h1v1h2V1h1V0h2v1H7v1H6v1H5v1h1v1h1v1h1v1H6V6H5V5H3v1H2v1H0V6h1V5h1V4h1V3H2V2H1V1H0z"/></svg></button></div><div class="dlg-body"></div><div class="dlg-btns"></div>`;
      const body = d.querySelector(".dlg-body");
      if (opts.node) body.appendChild(opts.node); else body.innerHTML = opts.html || "";
      let restore = null;
      const done = (label) => {
        shade.remove(); removeEventListener("keydown", onKey, true);
        if (restore && !document.querySelector(".dlg-shade")) host.resizeClient(restore[0], restore[1]);
        resolve(label);
      };
      const btns = d.querySelector(".dlg-btns");
      const list = opts.buttons || [{ label: "OK", default: true }];
      let def = null, cancel = null;
      for (const b of list) {
        const el = document.createElement("button");
        el.className = "btn" + (b.default ? " default" : "");
        el.textContent = b.label;
        el.addEventListener("click", () => { if (b.action && b.action(d) === false) return; done(b.label); });
        btns.appendChild(el);
        if (b.default) def = el;
        if (b.cancel) cancel = el;
      }
      if (!list.length) btns.remove();
      d.querySelector(".dlg-x").addEventListener("click", () => (cancel || def) ? (cancel || def).click() : done(null));
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); (cancel || def) ? (cancel || def).click() : done(null); }
        else if (e.key === "Enter" && def && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON") { e.preventDefault(); e.stopPropagation(); def.click(); }
      };
      addEventListener("keydown", onKey, true);
      shade.appendChild(d);
      document.body.appendChild(shade);
      // Draggable by its title bar, within the app area.
      const t = d.querySelector(".dlg-title");
      t.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        const r = d.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
        d.style.position = "absolute";
        const mv = (ev) => { d.style.left = Math.max(0, Math.min(innerWidth - 40, ev.clientX - ox)) + "px"; d.style.top = Math.max(0, Math.min(innerHeight - 20, ev.clientY - oy)) + "px"; };
        const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
        addEventListener("pointermove", mv); addEventListener("pointerup", up);
        mv(e);
      });
      if (opts.onOpen) opts.onOpen(d);
      // Small apps (Minesweeper, Calculator) grow their window while a bigger dialog is up.
      const needW = d.offsetWidth + 16, needH = d.offsetHeight + 16;
      if (host.embedded && (needW > innerWidth || needH > innerHeight)) {
        restore = [innerWidth, innerHeight];
        host.resizeClient(Math.max(innerWidth, needW), Math.max(innerHeight, needH));
      }
      const first = d.querySelector("input, textarea, select") || def;
      if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); });
    });
  }
  function alert(title, text, icon) {
    const n = document.createElement("div");
    n.className = "dlg-msg";
    n.innerHTML = (icon ? `<span class="dlg-icon dlg-icon-${icon}"></span>` : "") + `<div>${esc(text).replace(/\n/g, "<br>")}</div>`;
    return dialog({ title, node: n, buttons: [{ label: "OK", default: true, cancel: true }] });
  }
  function confirm(title, text, labels = ["Yes", "No", "Cancel"], icon = "warn") {
    const n = document.createElement("div");
    n.className = "dlg-msg";
    n.innerHTML = `<span class="dlg-icon dlg-icon-${icon}"></span><div>${esc(text).replace(/\n/g, "<br>")}</div>`;
    return dialog({ title, node: n, buttons: labels.map((l, i) => ({ label: l, default: i === 0, cancel: i === labels.length - 1 })) });
  }

  // ---------- Storage helpers ----------
  function load(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

  // Save a Blob as a download.
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  window.AppKit = {
    theme: () => root.dataset.os,
    onTheme(f) { listeners.push(f); },
    host, menubar, popup, closeMenus, dialog, alert, confirm, esc, load, save, download,
  };
})();
