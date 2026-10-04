// RBXBanland desktop shell: icons, taskbar, Start menu, clock, themes, the logon dialog and a small window manager.
// App pages run in iframes and talk to us through window.parent.RBDesktop (see RB.open / RB.play in common.js).
const RBDesktop = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const THEMES = { win95: "Windows 95", win98: "Windows 98", winxp: "Windows XP", win7: "Windows 7", vaporwave: "Vaporwave" };
  const VERSION = { win95: "95", win98: "98", winxp: "XP", win7: "7", vaporwave: "\u30F4\u30A7\u30A4\u30D1\u30FC" };
  // Themed icons are written "@name" and resolve to img/icons/<theme>/<name>.png (32 px) or <name>-16.png.
  const iconSrc = (spec, size = 32) => !String(spec || "").startsWith("@") ? spec
    : `img/icons/${theme()}/${spec.slice(1)}${size <= 16 ? "-16" : ""}.png`;
  const iconImg = (spec, size = 32, cls = "") => String(spec || "").startsWith("@")
    ? `<img${cls ? ` class="${cls}"` : ""} data-icon="${spec.slice(1)}" data-size="${size}" src="${iconSrc(spec, size)}" alt="">`
    : `<img${cls ? ` class="${cls}"` : ""} src="${RB.esc(spec)}" alt="">`;
  function applyIcons(root = document) {
    // Win7's superbar and XP's start button draw icons bigger than 16 px: use the 32 px source there.
    const big = theme() === "win7" ? "#Taskbar img" : theme() === "winxp" ? "#StartButton img" : null;
    for (const im of root.querySelectorAll("img[data-icon]")) {
      im.src = iconSrc("@" + im.dataset.icon, big && im.matches(big) ? 32 : +im.dataset.size || 32);
    }
  }
  const MIN_W = 280, MIN_H = 160;
  const mobile = matchMedia("(max-width: 700px), (pointer: coarse) and (max-width: 900px)");
  const windows = new Map(); // id -> win
  let nextId = 1, topZ = 10, user = null, focused = null;

  // Desktop shortcuts. The website itself lives inside the Internet Explorer window.
  const ICONS = [
    { app: "computer", title: "My Computer", icon: "@computer" },
    { app: "browser", title: "Internet Explorer", icon: "@ie" },
    { app: "site", title: "RBXBanland Home", icon: "img/icons/shortcut.svg" },
    { app: "chat", title: "RBXChat", icon: "@chat" },
    { app: "studio", title: "ROBLOX Studio 2008", icon: "@studio" },
    { app: "readme", title: "README.TXT", icon: "@notepad" },
    { app: "recycle", title: "Recycle Bin", icon: "@recycle" },
  ];
  // Start menu: programs, then the site's pages as IE favorites.
  const PROGRAMS = [
    { app: "browser", title: "Internet Explorer", icon: "@ie" },
    { app: "chat", title: "RBXChat", icon: "@chat" },
    { app: "readme", title: "Notepad - README", icon: "@notepad" },
    { app: "studio", title: "ROBLOX Studio 2008", icon: "@studio" },
  ];
  // Extra apps from site/apps/apps.json (written by the apps agent). Keyed "x:<id>" to avoid clashing with built-ins.
  const EXTRA = new Map();
  const FOLDER_ICON = "@folder";
  const INTERNAL = {
    computer: { title: "My Computer", icon: "@computer", w: 480, h: 320, render: renderComputer },
    readme: { title: "README.TXT - Notepad", icon: "@notepad", w: 600, h: 440, render: renderReadme },
    recycle: { title: "Recycle Bin", icon: "@recycle", w: 460, h: 300, render: renderRecycle },
  };

  // ---------- Themes ----------
  function theme() { return document.documentElement.dataset.os || "win98"; }
  function setTheme(t) {
    if (!THEMES[t]) return;
    document.documentElement.dataset.os = t;
    try { localStorage.setItem("rbx.theme", t); } catch { /* ignore */ }
    $(".sm-ver").textContent = VERSION[t];
    for (const b of document.querySelectorAll("[data-theme]")) b.setAttribute("aria-checked", String(b.dataset.theme === t));
    const link = document.getElementById("VendorCSS");
    if (link && !link.href.endsWith(`/${t}.css`)) link.href = `vendor/themes/${t}.css`;
    for (const w of document.querySelectorAll(".window")) w.classList.toggle("glass", t === "win7");
    for (const v of document.querySelectorAll(".logon-banner .ver, .boot-logo sup")) v.textContent = VERSION[t];
    launcher?.rerender();
    applyIcons();
    updateClock();
  }
  window.addEventListener("storage", (e) => { if (e.key === "rbx.theme" && e.newValue) setTheme(e.newValue); });

  // ---------- Desktop icons ----------
  function appInfo(app) {
    return INTERNAL[app] || EXTRA.get(app) || RB.apps[app] || ICONS.find((i) => i.app === app);
  }
  function renderIconList() {
    const extra = [...EXTRA.values()].filter((a) => a.desktopIcon).map((a) => ({ app: a.key, title: a.title, icon: a.icon }));
    const all = [...ICONS.slice(0, -1), ...extra, ICONS[ICONS.length - 1]]; // Recycle Bin stays last
    $("#Icons").innerHTML = all.map((ic) => {
      const info = appInfo(ic.app);
      return `<li role="option" tabindex="0" data-open="${RB.esc(ic.app)}">${iconImg(ic.icon || info.icon, 32)}<span>${RB.esc(ic.title || info.title)}</span></li>`;
    }).join("");
  }
  function renderIcons() {
    const ul = $("#Icons");
    renderIconList();
    ul.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      for (const x of ul.children) x.classList.toggle("selected", x === li);
      if (li && (e.pointerType === "touch" || mobile.matches)) launch(li.dataset.open);
    });
    ul.addEventListener("dblclick", (e) => { const li = e.target.closest("li"); if (li) launch(li.dataset.open); });
    ul.addEventListener("keydown", (e) => { const li = e.target.closest("li"); if (li && e.key === "Enter") launch(li.dataset.open); });
    $("#Desktop").addEventListener("pointerdown", (e) => {
      if (!e.target.closest("#Icons li")) for (const x of ul.children) x.classList.remove("selected");
    });
  }
  function launch(app) {
    if (INTERNAL[app]) return openInternal(app);
    if (app === "studio") return msgBox({ title: "ROBLOX Studio", icon: "error",
      text: "RobloxStudio.exe has encountered a problem and needs to close. We are sorry for the inconvenience.\n\n(Studio isn't hooked up yet. Maybe one day!)" });
    if (!user) { showLogon(); return; }
    if (EXTRA.has(app)) openExtra(EXTRA.get(app));
    else if (app === "browser" || app === "site") browse(HOME);
    else open(app);
  }

  // ---------- Windows ----------
  function cascade(w, h) {
    const desk = $("#Desktop").getBoundingClientRect();
    const n = [...windows.values()].filter((x) => !x.minimized).length;
    const x = Math.max(0, Math.min(90 + n * 26, desk.width - w));
    const y = Math.max(0, Math.min(20 + n * 26, desk.height - h));
    return { x, y };
  }



  // background: create without focusing or a taskbar button (the game window while it loads; see revealWindow).
  // controls: "all" or "close" (dialogs). cls: extra classes on the window.
  function createWindow({ app, title, icon, w = 760, h = 560, url, content, resizable = true, background = false, controls = "all", cls = "" }) {
    const id = "w" + nextId++;
    const desk = $("#Desktop").getBoundingClientRect();
    w = Math.min(w, desk.width - 8); h = Math.min(h, desk.height - 8);
    const { x, y } = cascade(w, h);
    const el = document.createElement("div");
    el.className = "window" + (theme() === "win7" ? " glass" : "") + (cls ? " " + cls : "");
    el.id = id;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", title);
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    el.innerHTML = `
      <div class="title-bar">
        <div class="title-bar-text">${iconImg(icon, 16, "title-icon")}<span class="title-label"></span></div>
        <div class="title-bar-controls">
          ${controls === "all" ? `<button type="button" class="tb-min" aria-label="Minimize" title="Minimize"></button>` : ""}
          ${resizable && controls === "all" ? `<button type="button" class="tb-max" aria-label="Maximize" title="Maximize"></button>` : ""}
          <button type="button" class="tb-close" aria-label="Close" title="Close"></button>
        </div>
      </div>
      <div class="window-body"></div>
      ${resizable ? ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => `<div class="rs rs-${d}" data-dir="${d}"></div>`).join("") : ""}`;
    const win = { id, app, el, title, icon, minimized: false, maximized: false, prev: null, url };
    $(".title-label", el).textContent = title;
    const body = $(".window-body", el);
    if (url) {
      const iframe = document.createElement("iframe");
      iframe.title = title;
      iframe.setAttribute("allow", "fullscreen; autoplay; cross-origin-isolated; gamepad");
      iframe.src = url;
      body.appendChild(iframe);
      win.iframe = iframe;
      iframe.addEventListener("load", () => hookFrame(win));
    } else if (content) {
      body.appendChild(content);
      body.classList.add("internal");
    }
    $("#Windows").appendChild(el);

    // Taskbar button
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "task";
    btn.setAttribute("role", "tab");
    btn.innerHTML = `${iconImg(icon, 16)}<span></span>`;
    $("span", btn).textContent = title;
    btn.title = title;
    btn.addEventListener("click", () => {
      if (focused === win && !win.minimized) minimize(win); else focus(win);
    });
    win.taskBtn = btn;
    if (!background) { $("#Tasks").appendChild(btn); applyIcons(btn); }

    el.addEventListener("pointerdown", () => focus(win), true);
    $(".tb-min", el)?.addEventListener("click", (e) => { e.stopPropagation(); minimize(win); });
    $(".tb-max", el)?.addEventListener("click", (e) => { e.stopPropagation(); toggleMax(win); });
    $(".tb-close", el).addEventListener("click", (e) => { e.stopPropagation(); close(win); });
    const bar = $(".title-bar", el);
    if (resizable) bar.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) toggleMax(win); });
    bar.addEventListener("pointerdown", (e) => startDrag(e, win));
    for (const h of el.querySelectorAll(".rs")) h.addEventListener("pointerdown", (e) => startResize(e, win, h.dataset.dir));

    windows.set(id, win);
    if (background) {
      win.loading = true;
      el.classList.add("loading");
      el.style.zIndex = 1;
      $(".title-bar", el).classList.add("inactive");
      return win;
    }
    if (mobile.matches && resizable) toggleMax(win, true);
    focus(win);
    el.classList.add("opening");
    setTimeout(() => el.classList.remove("opening"), 200);
    return win;
  }

  // Shows a window created with background: true.
  function revealWindow(win) {
    if (!win.loading) return;
    win.loading = false;
    win.el.classList.remove("loading");
    $("#Tasks").appendChild(win.taskBtn);
    applyIcons(win.taskBtn);
    focus(win);
    win.el.classList.add("opening");
    setTimeout(() => win.el.classList.remove("opening"), 200);
  }

  function setTitle(win, title) {
    win.title = title;
    $(".title-label", win.el).textContent = title;
    $("span", win.taskBtn).textContent = title;
    win.taskBtn.title = title;
    win.el.setAttribute("aria-label", title);
  }

  // Same-origin app page loaded: follow its <title>, and focus the window when it is clicked.
  function hookFrame(win) {
    let doc;
    try { doc = win.iframe.contentDocument; } catch { return; }
    if (!doc) return;
    if (win.app !== "play") {
      const sync = () => setTitle(win, (doc.title || "").replace(/\s*-\s*RBXBanland$/, "") || appInfo(win.app)?.title || "RBXBanland");
      sync();
      if (doc.head) new MutationObserver(sync).observe(doc.head, { subtree: true, childList: true, characterData: true });
    }
    doc.addEventListener("pointerdown", () => focus(win), true);
    doc.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#StartMenu").hidden) closeStart(); });
  }
  // Clicking into an iframe blurs our window; use that to focus its desktop window.
  window.addEventListener("blur", () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a.tagName === "IFRAME") {
        const win = windows.get(a.closest(".window")?.id);
        if (win) focus(win);
      }
    });
  });

  // Flash an app's taskbar button (new chat message) unless it is already in front.
  function notify(app, strong) {
    const win = findApp(app);
    if (!win || (focused === win && !win.minimized && document.hasFocus())) return;
    win.taskBtn.classList.add("flash");
    if (strong) win.taskBtn.classList.add("flash-strong");
  }

  function focus(win) {
    if (!win) return;
    win.taskBtn?.classList.remove("flash", "flash-strong");
    if (win.loading) return;
    if (win.minimized) { win.minimized = false; win.el.hidden = false; }
    if (focused !== win) {
      win.el.style.zIndex = ++topZ;
    }
    focused = win;
    for (const w of windows.values()) {
      w.el.classList.toggle("active", w === win);
      $(".title-bar", w.el).classList.toggle("inactive", w !== win);
      w.taskBtn.classList.toggle("active", w === win);
      w.taskBtn.setAttribute("aria-selected", String(w === win));
    }
    closeStart();
  }
  function focusTop() {
    const vis = [...windows.values()].filter((w) => !w.minimized && !w.loading).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex);
    if (vis[0]) focus(vis[0]);
    else {
      focused = null;
      for (const w of windows.values()) { w.el.classList.remove("active"); $(".title-bar", w.el).classList.add("inactive"); w.taskBtn.classList.remove("active"); }
    }
  }
  function minimize(win) {
    win.touch?.release();
    win.minimized = true;
    win.el.hidden = true;
    if (focused === win) { focused = null; focusTop(); }
    win.taskBtn.classList.remove("active");
  }
  function toggleMax(win, force) {
    if (win.aspect) return toggleMaxAspect(win, force);
    const max = force ?? !win.maximized;
    if (max && !win.maximized) {
      win.prev = { left: win.el.style.left, top: win.el.style.top, width: win.el.style.width, height: win.el.style.height };
    }
    win.maximized = max;
    win.el.classList.toggle("maximized", max);
    if (!max && win.prev) Object.assign(win.el.style, win.prev);
    const b = $(".tb-max", win.el);
    if (b) { b.title = max ? "Restore" : "Maximize"; b.setAttribute("aria-label", b.title); }
  }
  function close(win) {
    if (!windows.has(win.id)) return;
    if (win.app === "play") {
      // Tear down the emulator explicitly so it stops using the CPU right away.
      clearTimeout(win.fallback);
      try { win.iframe.src = "about:blank"; } catch { /* ignore */ }
      if (launcher && launcher.game === win) { const L = launcher; launcher = null; close(L.win); }
    }
    win.touch?.release();
    win.onClose?.();
    win.el.remove();
    win.taskBtn.remove();
    windows.delete(win.id);
    if (focused === win) { focused = null; focusTop(); }
  }
  function closeAll() { for (const w of [...windows.values()]) close(w); }

  function startDrag(e, win) {
    if (e.button !== 0 || e.target.closest("button") || win.maximized || mobile.matches) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = win.el.offsetLeft, oy = win.el.offsetTop;
    const desk = $("#Desktop").getBoundingClientRect();
    track(e, (ev) => {
      const x = Math.min(Math.max(ox + ev.clientX - sx, 60 - win.el.offsetWidth), desk.width - 60);
      const y = Math.min(Math.max(oy + ev.clientY - sy, 0), desk.height - 24);
      win.el.style.left = x + "px";
      win.el.style.top = y + "px";
    });
  }
  function startResize(e, win, dir) {
    if (e.button !== 0 || win.maximized) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const r = { x: win.el.offsetLeft, y: win.el.offsetTop, w: win.el.offsetWidth, h: win.el.offsetHeight };
    if (win.aspect) {
      // Keep the client area at the game's aspect ratio so it never letterboxes.
      const f = frameOf(win), ratio = win.aspect;
      const cw0 = r.w - f.w, ch0 = r.h - f.h;
      track(e, (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let cwByX = cw0 + (dir.includes("e") ? dx : dir.includes("w") ? -dx : 0);
        let chByY = ch0 + (dir.includes("s") ? dy : dir.includes("n") ? -dy : 0);
        let cw;
        if (dir === "n" || dir === "s") cw = chByY * ratio;
        else if (dir === "e" || dir === "w") cw = cwByX;
        else cw = Math.max(cwByX, chByY * ratio); // corners: follow whichever moved more
        const c = snapClient(win.client.w, win.client.h, Math.max(240, cw));
        const w = c.w + f.w, h = c.h + f.h;
        const x = dir.includes("w") ? r.x + r.w - w : r.x;
        const y = dir.includes("n") ? Math.max(0, r.y + r.h - h) : r.y;
        Object.assign(win.el.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
      });
      return;
    }
    track(e, (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let { x, y, w, h } = r;
      if (dir.includes("e")) w = Math.max(MIN_W, r.w + dx);
      if (dir.includes("s")) h = Math.max(MIN_H, r.h + dy);
      if (dir.includes("w")) { w = Math.max(MIN_W, r.w - dx); x = r.x + r.w - w; }
      if (dir.includes("n")) { h = Math.max(MIN_H, r.h - dy); y = Math.max(0, r.y + r.h - h); h = r.y + r.h - y; }
      Object.assign(win.el.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
    });
  }
  // Pointer tracking with iframes disabled underneath so they don't swallow the moves.
  function track(e, onMove) {
    const desk = $("#Desktop");
    desk.classList.add("dragging");
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const move = (ev) => onMove(ev);
    const up = () => {
      desk.classList.remove("dragging");
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  function findApp(app) { return [...windows.values()].find((w) => w.app === app); }

  // ---------- Extra apps (site/apps/apps.json) ----------
  // Each entry: { id, title, icon, url, width, height, resizable, startMenuFolder, desktopIcon }.
  // url and icon are resolved relative to apps.json and must stay on this site.
  function localPath(raw, base) {
    if (typeof raw !== "string" || !raw || /^\s*(javascript|data|vbscript):/i.test(raw)) return null;
    let u;
    try { u = new URL(raw, base); } catch { return null; }
    if (u.origin !== location.origin) return null;
    return u.pathname.replace(/^\/+/, "") + u.search + u.hash;
  }
  function sanitizeApp(a, base) {
    if (!a || typeof a !== "object" || typeof a.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(a.id)) return null;
    const url = localPath(a.url, base);
    if (!url) { console.warn("apps.json: bad url for", a.id); return null; }
    const num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) && +v > 0 ? +v : d));
    return {
      key: "x:" + a.id, id: a.id, url,
      title: String(a.title || a.id).slice(0, 60),
      icon: localPath(a.icon, base) || "@app",
      w: num(a.width, 640, 160, 1600), h: num(a.height, 480, 120, 1200),
      resizable: a.resizable !== false,
      folder: typeof a.startMenuFolder === "string" ? a.startMenuFolder.trim().slice(0, 40) : "",
      desktopIcon: a.desktopIcon === true,
    };
  }
  async function loadManifest() {
    const base = new URL("apps/apps.json", location.href);
    let data;
    try {
      const r = await fetch(base, { cache: "no-cache" });
      if (!r.ok) return;
      data = await r.json();
    } catch (e) { console.warn("apps.json:", e.message); return; }
    const list = Array.isArray(data) ? data : Array.isArray(data?.apps) ? data.apps : [];
    EXTRA.clear();
    for (const raw of list) {
      const a = sanitizeApp(raw, base);
      if (a && !EXTRA.has(a.key)) EXTRA.set(a.key, a);
    }
    renderIconList();
    renderPrograms();
  }
  function openExtra(a, url) {
    const existing = findApp(a.key);
    if (existing) {
      if (url && url !== existing.url) { existing.iframe.src = url; existing.url = url; }
      focus(existing);
      return existing;
    }
    return createWindow({ app: a.key, title: a.title, icon: a.icon, w: a.w, h: a.h, url: url || a.url, resizable: a.resizable });
  }
  const extraFor = (app) => EXTRA.get(app) || EXTRA.get("x:" + app);

  // Opens a site page in the Internet Explorer window (creating it if needed).
  function open(app, url) {
    if (INTERNAL[app]) return openInternal(app);
    const ex = extraFor(app);
    if (ex) return openExtra(ex, url ? localPath(url, location.href) : null);
    const info = RB.apps[app];
    if (!info || app === "play") return null;
    if (info.window) {
      const existing = findApp(app);
      if (existing) {
        if (url && url !== info.url) existing.iframe.src = url;
        focus(existing);
        return existing;
      }
      return createWindow({ app, title: info.title, icon: info.icon, w: info.w, h: info.h, url: url || info.url });
    }
    return browse(url || info.url);
  }

  // ---------- The "Internet Explorer" window that hosts the whole website ----------
  const FAKE_HOST = "http://www.rbxbanland.com/";
  const HOME = "home.html";
  const fakeUrl = (local) => FAKE_HOST + String(local || "").replace(/^\/+/, "");
  // Turns whatever is typed into the address bar into a local page (or the "cannot display" page).
  function resolveAddress(typed) {
    let s = String(typed || "").trim();
    if (!s) return HOME;
    if (!/^[a-z]+:\/\//i.test(s)) s = /^(www\.)?rbxbanland\.com/i.test(s) || !/\./.test(s.split("/")[0]) || /\.html?\b/.test(s) ? "http://www.rbxbanland.com/" + s.replace(/^(www\.)?rbxbanland\.com\/?/i, "") : "http://" + s;
    let u;
    try { u = new URL(s); } catch { return "ie-error.html?url=" + encodeURIComponent(typed); }
    if (/(^|\.)rbxbanland\.com$/i.test(u.hostname) || u.hostname === location.hostname) {
      const path = u.pathname.replace(/^\/+/, "") || HOME;
      return path === "index.html" ? HOME : path + u.search + u.hash;
    }
    return "ie-error.html?url=" + encodeURIComponent(u.href);
  }
  function localOf(iframe) {
    try {
      const l = iframe.contentWindow.location;
      if (l.href === "about:blank") return null;
      return l.pathname.replace(/^\/+/, "") + l.search + l.hash;
    } catch { return null; }
  }

  function browse(url) {
    let win = findApp("browser");
    if (win) {
      win.go(url);
      focus(win);
      return win;
    }
    const content = document.createElement("div");
    content.className = "ie";
    content.innerHTML = `
      <div class="ie-menubar" role="menubar">
        <div class="ie-menu"><button type="button"><u>F</u>ile</button><ul>
          <li><button type="button" data-cmd="home">Home Page</button></li><li><button type="button" data-cmd="close">Close</button></li></ul></div>
        <div class="ie-menu"><button type="button"><u>E</u>dit</button><ul>
          <li><button type="button" data-cmd="copyurl">Copy Address</button></li></ul></div>
        <div class="ie-menu"><button type="button"><u>V</u>iew</button><ul>
          <li><button type="button" data-cmd="stop">Stop</button></li><li><button type="button" data-cmd="refresh">Refresh</button></li></ul></div>
        <div class="ie-menu"><button type="button">F<u>a</u>vorites</button><ul>
          ${RB.nav.map(([href, label]) => `<li><button type="button" data-go="${href}">${iconImg("@fav", 16)}${RB.esc(label)}</button></li>`).join("")}
          <li><button type="button" data-go="about.html">About RBXBanland</button></li></ul></div>
        <div class="ie-menu"><button type="button"><u>H</u>elp</button><ul>
          <li><button type="button" data-cmd="about">About Internet Explorer</button></li></ul></div>
        <div class="ie-throbber" aria-hidden="true"><span class="brick"></span></div>
      </div>
      <div class="ie-toolbar">
        <button type="button" data-cmd="back" title="Back"><i class="ico ico-back"></i><span>Back</span></button>
        <button type="button" data-cmd="forward" title="Forward"><i class="ico ico-fwd"></i><span>Forward</span></button>
        <button type="button" data-cmd="stop" title="Stop"><i class="ico ico-stop"></i><span>Stop</span></button>
        <button type="button" data-cmd="refresh" title="Refresh"><i class="ico ico-refresh"></i><span>Refresh</span></button>
        <button type="button" data-cmd="home" title="Home"><i class="ico ico-home"></i><span>Home</span></button>
        <span class="ie-tsep"></span>
        <button type="button" data-go="games.html" title="Games"><img src="img/icons/games.svg" alt=""><span>Games</span></button>
        <button type="button" data-go="catalog.html" title="Catalog"><img src="img/icons/catalog.svg" alt=""><span>Catalog</span></button>
        <button type="button" data-go="forums.html" title="Forums"><img src="img/icons/forums.svg" alt=""><span>Forums</span></button>
      </div>
      <form class="ie-address"><label for="ieAddr">A<u>d</u>dress</label>
        <span class="ie-addr-wrap">${iconImg("@fav", 16)}<input id="ieAddr" type="text" spellcheck="false" autocomplete="off"></span>
        <button type="submit" class="ie-go">&#10140; Go</button></form>
      <div class="ie-view"><iframe title="RBXBanland" allow="fullscreen; autoplay; cross-origin-isolated; gamepad"></iframe></div>
      <div class="ie-status"><span class="ie-status-text">Done</span><span class="ie-progress"><span></span></span><span class="ie-zone">${iconImg("@ie", 16)}Internet</span></div>`;
    const iframe = $("iframe", content);
    const addr = $("#ieAddr", content);
    const statusText = $(".ie-status-text", content);
    const hist = [];
    let idx = -1, pendingHist = null, loading = false;

    function setLoading(on, target) {
      loading = on;
      content.classList.toggle("loading", on);
      statusText.textContent = on ? `Opening page ${fakeUrl(target || "")}...` : "Done";
      updateButtons();
    }
    function updateButtons() {
      $('[data-cmd="back"]', $(".ie-toolbar", content)).disabled = idx <= 0;
      $('[data-cmd="forward"]', $(".ie-toolbar", content)).disabled = idx >= hist.length - 1;
      $('.ie-toolbar [data-cmd="stop"]', content).disabled = !loading;
    }
    function nav(local, histIndex) {
      pendingHist = histIndex ?? null;
      setLoading(true, local);
      addr.value = fakeUrl(local);
      // replace() keeps our iframe navigations out of the real browser's history.
      try { iframe.contentWindow.location.replace(local); } catch { iframe.src = local; }
    }
    win = createWindow({ app: "browser", title: "RBXBanland - Microsoft Internet Explorer", icon: "@ie", w: 980, h: 700, content });
    win.iframe = iframe;
    win.go = (url) => nav(resolveAddress(url));
    $(".window-body", win.el).classList.add("ie-body");

    iframe.addEventListener("load", () => {
      const local = localOf(iframe);
      if (!local) return;
      if (pendingHist !== null) idx = pendingHist;
      else if (hist[idx] !== local) { hist.splice(idx + 1); hist.push(local); idx = hist.length - 1; }
      pendingHist = null;
      addr.value = local.startsWith("ie-error.html") ? new URLSearchParams(local.split("?")[1]).get("url") || fakeUrl(local) : fakeUrl(local);
      setLoading(false);
      let doc;
      try { doc = iframe.contentDocument; } catch { return; }
      const syncTitle = () => {
        const t = (doc.title || "RBXBanland").replace(/\s*-\s*RBXBanland$/, "");
        setTitle(win, `${t} - Microsoft Internet Explorer`);
        $("span", win.taskBtn).textContent = t + " - Microsoft Inte...";
      };
      syncTitle();
      if (doc.head) new MutationObserver(syncTitle).observe(doc.head, { subtree: true, childList: true, characterData: true });
      doc.addEventListener("pointerdown", () => { focus(win); closeMenus(); }, true);
      // Show link targets in the status bar, like the real thing.
      doc.addEventListener("mouseover", (e) => {
        const a = e.target.closest?.("a[href]");
        if (!a || loading) return;
        const h = a.getAttribute("href");
        statusText.textContent = h.startsWith("#") ? "" : /^https?:/.test(h) ? h : fakeUrl(new URL(a.href).pathname.replace(/^\//, "") + new URL(a.href).search);
      });
      doc.addEventListener("mouseout", (e) => { if (e.target.closest?.("a[href]") && !loading) statusText.textContent = "Done"; });
      // In-page navigation (link clicks): show the throbber until the next load.
      iframe.contentWindow.addEventListener("beforeunload", () => { if (!loading) setLoading(true, ""); });
    });

    function closeMenus() { for (const m of content.querySelectorAll(".ie-menu.open")) m.classList.remove("open"); }
    content.addEventListener("click", async (e) => {
      const top = e.target.closest(".ie-menu > button");
      if (top) {
        const m = top.parentElement, was = m.classList.contains("open");
        closeMenus();
        m.classList.toggle("open", !was);
        return;
      }
      const b = e.target.closest("[data-cmd],[data-go]");
      if (!b) { if (!e.target.closest(".ie-menu")) closeMenus(); return; }
      closeMenus();
      if (b.dataset.go) return nav(b.dataset.go);
      switch (b.dataset.cmd) {
        case "back": if (idx > 0) nav(hist[idx - 1], idx - 1); break;
        case "forward": if (idx < hist.length - 1) nav(hist[idx + 1], idx + 1); break;
        case "stop": try { iframe.contentWindow.stop(); } catch { /* ignore */ } setLoading(false); break;
        case "refresh": { const l = localOf(iframe) || hist[idx] || HOME; nav(l, idx); break; }
        case "home": nav(HOME); break;
        case "close": close(win); break;
        case "copyurl": try { await navigator.clipboard.writeText(addr.value); } catch { /* ignore */ } break;
        case "about": msgBox({ title: "About Internet Explorer", icon: "info",
          html: "<b>Microsoft&reg; Internet Explorer</b><br>Version 5.0 (RBXBanland Edition)<br><br>Not really. This is a pretend browser window drawn by RBXBanland, a fan project." }); break;
      }
    });
    content.addEventListener("mouseover", (e) => {
      const top = e.target.closest(".ie-menu");
      if (top && content.querySelector(".ie-menu.open") && !top.classList.contains("open")) { closeMenus(); top.classList.add("open"); }
    });
    $(".ie-address", content).addEventListener("submit", (e) => { e.preventDefault(); nav(resolveAddress(addr.value)); });
    addr.addEventListener("focus", () => addr.select());
    nav(resolveAddress(url));
    return win;
  }

  // ---------- Playing a game: "Roblox" launcher dialog + hidden RobloxApp.exe window ----------
  // play.html (inside the game window) posts { rb: "play", kind: "progress" | "ready" | "error", ... } to us.
  const GAME_DEFAULT = { w: 800, h: 600 };
  const NO_MESSAGE_FALLBACK_MS = 25000; // an older play.html that never posts: show the window anyway
  let launcher = null; // { win, game, setProgress(pct, text, detail), fail(text) }

  // Outer size minus client (iframe) size of a window, for the current theme.
  function frameOf(win) {
    const body = $(".window-body", win.el);
    return { w: win.el.offsetWidth - body.clientWidth, h: win.el.offsetHeight - body.clientHeight };
  }
  function deskRect() { return $("#Desktop").getBoundingClientRect(); }
  // Exact-ratio sizes: with a w:h client reduced to a:b (e.g. 960x720 -> 4:3), widths are multiples of a.
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function ratioSteps(cw, ch) {
    const g = gcd(Math.round(cw), Math.round(ch)) || 1;
    const a = Math.round(cw) / g, b = Math.round(ch) / g;
    return a <= 64 && b <= 64 ? { a, b } : null; // odd sizes: fall back to rounding
  }
  // Client size at ratio cw:ch with width close to (and not above) wantW.
  function snapClient(cw, ch, wantW) {
    const st = ratioSteps(cw, ch);
    if (!st) return { w: Math.round(wantW), h: Math.round(wantW * ch / cw) };
    const n = Math.max(1, Math.floor(wantW / st.a));
    return { w: n * st.a, h: n * st.b };
  }
  // Largest client size with the given ratio that fits (maxW x maxH), never larger than cw x ch.
  function fitRatio(cw, ch, maxW, maxH) {
    const k = Math.min(1, maxW / cw, maxH / ch);
    return snapClient(cw, ch, cw * k);
  }
  // Sizes the window so its client area is exactly cw x ch CSS px (scaled down to fit), centered unless keepPos.
  function setClientSize(win, cw, ch, keepPos) {
    const f = frameOf(win), d = deskRect();
    const c = fitRatio(cw, ch, d.width - f.w, d.height - f.h);
    const w = c.w + f.w, h = c.h + f.h;
    const left = keepPos ? Math.min(Math.max(0, win.el.offsetLeft), d.width - w) : Math.round((d.width - w) / 2);
    const top = keepPos ? Math.min(Math.max(0, win.el.offsetTop), d.height - h) : Math.max(0, Math.round((d.height - h) / 2));
    Object.assign(win.el.style, { left: left + "px", top: top + "px", width: w + "px", height: h + "px" });
  }
  function toggleMaxAspect(win, force) {
    const max = force ?? !win.maximized;
    if (max && !win.maximized) win.prev = { left: win.el.style.left, top: win.el.style.top, width: win.el.style.width, height: win.el.style.height };
    win.maximized = max;
    win.el.classList.toggle("max-aspect", max);
    if (max) {
      const d = deskRect(), f = frameOf(win);
      const k = Math.min((d.width - f.w) / win.client.w, (d.height - f.h) / win.client.h);
      const c = snapClient(win.client.w, win.client.h, win.client.w * k);
      setClientSize(win, c.w, c.h);
    } else if (win.prev) Object.assign(win.el.style, win.prev);
    const b = $(".tb-max", win.el);
    if (b) { b.title = max ? "Restore" : "Maximize"; b.setAttribute("aria-label", b.title); }
  }
  window.addEventListener("resize", () => {
    const g = findApp("play");
    if (g?.aspect && g.maximized) toggleMaxAspect(g, true);
  });

  function progressHtml() {
    const t = theme();
    if (t === "winxp") return `<progress class="launcher-bar" max="100"></progress>`;
    if (t === "win7") return `<div class="launcher-bar animate" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div></div></div>`;
    return `<div class="launcher-bar progress-indicator segmented"><span class="progress-indicator-bar"></span></div>`;
  }

  function openLauncher(game) {
    const content = document.createElement("div");
    content.className = "launcher";
    content.innerHTML = `
      <div class="launcher-top">
        <img class="launcher-logo" src="img/icons/play.svg" alt="">
        <div class="launcher-text"><div class="launcher-title">Starting Roblox...</div><div class="launcher-detail">Connecting to RBXBanland...</div></div>
      </div>
      <div class="launcher-progress">${progressHtml()}</div>
      <div class="launcher-buttons"><button type="button" class="launcher-cancel">Cancel</button></div>`;
    const d = deskRect();
    const win = createWindow({ app: "launcher", title: "Roblox", icon: "img/icons/play.svg", w: 400, h: 190, content, resizable: false, controls: "close", cls: "launcher-window" });
    win.el.style.height = "auto";
    win.el.style.left = Math.round((d.width - win.el.offsetWidth) / 2) + "px";
    win.el.style.top = Math.round((d.height - win.el.offsetHeight) / 2.4) + "px";
    $(".window-body", win.el).classList.add("launcher-body");
    let failed = false, pct = 0;
    const L = {
      win, game,
      setProgress(p, text, detail) {
        if (failed) return;
        if (typeof p === "number" && isFinite(p)) pct = Math.max(0, Math.min(100, p));
        if (text) $(".launcher-title", content).textContent = text;
        if (detail !== undefined) $(".launcher-detail", content).textContent = detail || "";
        const bar = $(".launcher-bar", content);
        if (bar.tagName === "PROGRESS") bar.value = pct;
        else (bar.querySelector(".progress-indicator-bar, div") || bar).style.width = pct + "%";
        if (bar.getAttribute("role") === "progressbar") bar.setAttribute("aria-valuenow", String(Math.round(pct)));
      },
      fail(text) {
        failed = true;
        content.classList.add("failed");
        $(".launcher-title", content).textContent = "An error occurred while starting Roblox";
        $(".launcher-detail", content).textContent = text || "Something went wrong. Please try again.";
        $(".launcher-cancel", content).textContent = "OK";
        const bar = $(".launcher-bar", content);
        bar.classList.add("error");
        focus(win);
      },
      rerender() { $(".launcher-progress", content).innerHTML = progressHtml(); L.setProgress(pct); },
    };
    $(".launcher-cancel", content).addEventListener("click", () => cancelLaunch());
    win.onClose = () => { if (launcher === L) { launcher = null; if (game.loading) close(game); } };
    launcher = L;
    L.setProgress(0);
    return L;
  }
  function closeLauncher() {
    if (!launcher) return;
    const L = launcher;
    launcher = null;
    close(L.win);
  }
  function cancelLaunch() {
    const L = launcher;
    closeLauncher();
    if (L && windows.has(L.game.id)) close(L.game);
  }
  // ---------- Touch controls for the game (phones/tablets) ----------
  // A virtual joystick (WASD), Jump (Space) and zoom (I/O) over the game. Keys are dispatched as KeyboardEvents into
  // play.html's #Emu frame (the emulator listens on its window); without one we post {rb:"input"} to play.html instead.
  const coarse = matchMedia("(pointer: coarse)");
  const KEYS = { w: ["KeyW", "w", 87], a: ["KeyA", "a", 65], s: ["KeyS", "s", 83], d: ["KeyD", "d", 68],
    space: ["Space", " ", 32], i: ["KeyI", "i", 73], o: ["KeyO", "o", 79] };
  function sendKey(game, name, down) {
    const [code, key, keyCode] = KEYS[name];
    let target = null;
    try { target = game.iframe.contentDocument?.getElementById("Emu")?.contentWindow || null; } catch { /* ignore */ }
    if (target && target.KeyboardEvent) {
      target.dispatchEvent(new target.KeyboardEvent(down ? "keydown" : "keyup", { code, key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
    } else {
      try { game.iframe.contentWindow.postMessage({ rb: "input", kind: "key", code, key, keyCode, down }, location.origin); } catch { /* ignore */ }
    }
  }
  function attachTouchControls(game) {
    if (game.touch) return;
    const held = new Set();
    const set = (name, down) => {
      if (down === held.has(name)) return;
      if (down) held.add(name); else held.delete(name);
      sendKey(game, name, down);
    };
    const pad = document.createElement("div");
    pad.className = "touchpad";
    pad.innerHTML = `
      <div class="tp-stick" aria-label="Move"><div class="tp-knob"></div></div>
      <div class="tp-right">
        <button type="button" class="tp-zoom" data-key="i" aria-label="Zoom in">+</button>
        <button type="button" class="tp-zoom" data-key="o" aria-label="Zoom out">&minus;</button>
        <button type="button" class="tp-jump" data-key="space" aria-label="Jump">JUMP</button>
      </div>
      <button type="button" class="tp-hide" title="Hide touch controls">&#127918;</button>`;
    $(".window-body", game.el).appendChild(pad);
    // Joystick -> WASD
    const stick = $(".tp-stick", pad), knob = $(".tp-knob", pad);
    let sid = null;
    const moveStick = (e) => {
      const r = stick.getBoundingClientRect(), R = r.width / 2;
      let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
      dx *= k; dy *= k;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / R, ny = dy / R, T = 0.35;
      set("w", ny < -T); set("s", ny > T); set("a", nx < -T); set("d", nx > T);
    };
    const endStick = () => { sid = null; knob.style.transform = ""; for (const k of ["w", "a", "s", "d"]) set(k, false); };
    stick.addEventListener("pointerdown", (e) => { e.preventDefault(); sid = e.pointerId; stick.setPointerCapture(sid); moveStick(e); });
    stick.addEventListener("pointermove", (e) => { if (e.pointerId === sid) moveStick(e); });
    stick.addEventListener("pointerup", endStick);
    stick.addEventListener("pointercancel", endStick);
    for (const b of pad.querySelectorAll("[data-key]")) {
      const k = b.dataset.key;
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add("down"); set(k, true); });
      const up = () => { b.classList.remove("down"); set(k, false); };
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    $(".tp-hide", pad).addEventListener("click", () => pad.classList.toggle("collapsed"));
    game.touch = { pad, release: () => { for (const k of [...held]) set(k, false); } };
  }

  function gameReady(game, width, height) {
    clearTimeout(game.fallback);
    if (!game.loading) return;
    const cw = width > 0 ? width : game.client.w, ch = height > 0 ? height : game.client.h;
    game.aspect = cw / ch;
    game.client = { w: cw, h: ch };
    setClientSize(game, cw, ch);
    closeLauncher();
    revealWindow(game);
    // Phones/tablets: biggest aspect-correct size, plus on-screen controls.
    if (mobile.matches || coarse.matches) { toggleMaxAspect(game, true); attachTouchControls(game); }
    try { game.iframe.focus(); game.iframe.contentWindow.focus(); } catch { /* ignore */ }
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || typeof d !== "object" || d.rb !== "play") return;
    const game = findApp("play");
    if (!game || !game.iframe || e.source !== game.iframe.contentWindow) return;
    game.heard = true;
    if (d.kind === "progress") launcher?.setProgress(Number(d.pct), typeof d.text === "string" ? d.text.slice(0, 120) : "", typeof d.detail === "string" ? d.detail.slice(0, 200) : undefined);
    else if (d.kind === "ready") gameReady(game, Number(d.width), Number(d.height));
    else if (d.kind === "error") {
      clearTimeout(game.fallback);
      const text = typeof d.text === "string" ? d.text.slice(0, 300) : "";
      if (launcher) launcher.fail(text);
      else msgBox({ title: "Roblox", icon: "error", text: text || "The game hit an error." });
    }
  });

  // One RobloxApp.exe at a time: the emulator is heavy.
  async function play(placeId, placeName, url) {
    const info = RB.apps.play;
    const existing = findApp("play");
    if (existing) {
      if (existing.placeId === placeId) { if (existing.loading && launcher) focus(launcher.win); else focus(existing); return existing; }
      const ok = await msgBox({ title: "RobloxApp.exe", icon: "warn",
        text: `ROBLOX is already running ${existing.placeName}. Close it and start ${placeName}?`, buttons: ["Yes", "No"] });
      if (ok !== "Yes") { if (!existing.loading) focus(existing); return existing; }
      closeLauncher();
      close(existing);
    }
    // The emulator needs SharedArrayBuffer, which browsers only allow on secure (https or localhost) pages.
    if (!window.crossOriginIsolated) {
      const go = await msgBox({ title: "Roblox", icon: "warn", buttons: ["Try anyway", "Cancel"],
        text: "This page isn't loaded over a secure (https) connection, so the game engine can't start in fast mode " +
          "and probably won't run.\n\nOn a phone or another computer, use the https link from the RBXBanland tunnel " +
          "(start-rbxbanland.bat on the host PC) instead of the http://192.168... address." });
      if (go !== "Try anyway") return null;
    }
    // Client area we intend to show (CSS px), 4:3 by default, clamped to the desktop.
    const d = deskRect();
    const client = fitRatio(GAME_DEFAULT.w, GAME_DEFAULT.h, d.width - 24, d.height - 48);
    const src = `${url}${url.includes("?") ? "&" : "?"}embed=1&cw=${client.w}&ch=${client.h}`;
    const game = createWindow({ app: "play", title: info.title, icon: info.icon, w: client.w + 20, h: client.h + 40, url: src,
      background: true, cls: "game-window" });
    game.placeId = placeId;
    game.placeName = placeName;
    game.client = client;
    game.aspect = client.w / client.h;
    setTitle(game, `RobloxApp.exe - ${placeName}`);
    setClientSize(game, client.w, client.h);
    openLauncher(game);
    // An older play.html that never talks to us: reveal the window after a while instead of hanging forever.
    game.iframe.addEventListener("load", () => {
      clearTimeout(game.fallback);
      game.fallback = setTimeout(() => { if (game.loading && !game.heard) gameReady(game, client.w, client.h); }, NO_MESSAGE_FALLBACK_MS);
    }, { once: true });
    return game;
  }

  function openInternal(app) {
    const info = INTERNAL[app];
    const existing = findApp(app);
    if (existing) { focus(existing); return existing; }
    const content = document.createElement("div");
    content.className = "internal-" + app;
    info.render(content);
    return createWindow({ app, title: info.title, icon: info.icon, w: info.w, h: info.h, content });
  }

  // ---------- Built-in "programs" ----------
  function renderComputer(el) {
    const drives = [
      ["C:", "Local Disk (C:)", "@settings", "settings"], ["G:", "Games (G:)", "img/icons/games.svg", "games"], ["H:", "Hats & Stuff (H:)", "img/icons/catalog.svg", "catalog"],
      ["F:", "Forums on 'rbxbanland' (F:)", "img/icons/forums.svg", "forums"], ["A:", "3½ Floppy (A:)", "@notepad", "readme"],
    ];
    el.innerHTML = `<div class="explorer-bar">Address <span class="addr">My Computer</span></div>
      <ul class="explorer">${drives.map(([, name, icon, app]) =>
        `<li tabindex="0" data-open="${app}">${iconImg(icon, 32)}<span>${RB.esc(name)}</span></li>`).join("")}</ul>
      <div class="statusbar">${drives.length} object(s)</div>`;
    el.addEventListener("dblclick", (e) => { const li = e.target.closest("[data-open]"); if (li) launch(li.dataset.open); });
    el.addEventListener("keydown", (e) => { const li = e.target.closest("[data-open]"); if (li && e.key === "Enter") launch(li.dataset.open); });
    el.addEventListener("click", (e) => {
      const li = e.target.closest("[data-open]");
      for (const x of el.querySelectorAll("[data-open]")) x.classList.toggle("selected", x === li);
      if (li && mobile.matches) launch(li.dataset.open);
    });
  }
  function renderReadme(el) {
    el.innerHTML = `<div class="menubar"><u>F</u>ile &nbsp; <u>E</u>dit &nbsp; <u>S</u>earch &nbsp; <u>H</u>elp</div><textarea class="notepad" readonly spellcheck="false" wrap="off"></textarea>`;
    $("textarea", el).value = `WELCOME TO RBXBANLAND!!!
=======================

Hi! This is our little private corner of the internet where we play
OLD ROBLOX (2006-2008) together, right in the browser.

HOW TO PLAY
-----------
1. Internet Explorer opens www.rbxbanland.com for you. (Closed it?
   Double-click "Internet Explorer" or "RBXBanland Home".)
2. Click GAMES, pick a place, press the big green PLAY button.
3. A "RobloxApp.exe" window opens. The first launch downloads about
   180 MB and boots Windows-in-your-browser, so be patient!
   Controls: WASD / arrows to walk, Space to jump, right-drag to look.

OTHER STUFF
-----------
* AVATAR   - change your body colors, hats, face, shirt and pants.
* CATALOG  - spend your Tix and ROBUX on hats and clothes.
               You get free Tix + ROBUX every day you log in, and
               Tix for playing places.
* FORUMS   - post stuff. Be nice. Signatures are back, baby.
* FRIENDS  - add your friends. You can see who is online.
* GUESTBOOK- SIGN IT!!!
* START > THEMES - Windows 95, 98 or 7 Aero. Your call.

RBXBanland is a fan project made for fun. It is not affiliated with
Roblox Corporation.

Last updated: today. This site is always under construction.`;
  }
  function renderRecycle(el) {
    const junk = [["noob_hat.rbxm", "2 KB"], ["my_first_place (copy 3).rbxl", "88 KB"], ["builders_club_receipt.txt", "1 KB"], ["free_robux_generator.exe", "666 KB"]];
    el.innerHTML = `<div class="explorer-bar">Address <span class="addr">Recycle Bin</span></div>
      <table class="details"><thead><tr><th>Name</th><th>Size</th></tr></thead><tbody>${junk.map(([n, s]) =>
        `<tr><td>${iconImg("@notepad", 16)} ${n}</td><td>${s}</td></tr>`).join("")}</tbody></table>
      <div class="statusbar">${junk.length} object(s) <button type="button" id="EmptyBin">Empty Recycle Bin</button></div>`;
    $("#EmptyBin", el).addEventListener("click", async () => {
      const r = await msgBox({ title: "Confirm File Delete", icon: "warn", text: "Are you sure you want to delete free_robux_generator.exe? It looks important.", buttons: ["Yes", "No"] });
      if (r === "Yes") msgBox({ title: "Error Deleting File", icon: "error", text: "Cannot delete free_robux_generator.exe: There is no such thing as free ROBUX." });
    });
  }

  // ---------- Message boxes ----------
  function msgBox({ title = "RBXBanland", text = "", html = "", icon = "info", buttons = ["OK"] }) {
    return new Promise((resolve) => {
      const over = document.createElement("div");
      over.className = "msgbox-wrap";
      over.innerHTML = `<div class="window msgbox active${theme() === "win7" ? " glass" : ""}" role="alertdialog" aria-modal="true">
        <div class="title-bar"><div class="title-bar-text"><span class="title-label"></span></div>
          <div class="title-bar-controls"><button type="button" class="tb-close" aria-label="Close"></button></div></div>
        <div class="window-body">
          <div class="msg-body"><span class="msg-icon msg-${icon}" aria-hidden="true"></span><div class="msg-text"></div></div>
          <div class="msg-buttons">${buttons.map((b, i) => `<button type="button" class="msg-btn${i ? "" : " default"}">${RB.esc(b)}</button>`).join("")}</div>
        </div></div>`;
      $(".title-label", over).textContent = title;
      const t = $(".msg-text", over);
      if (html) t.innerHTML = html; else t.textContent = text;
      document.body.appendChild(over);
      over.style.zIndex = 100000 + topZ;
      const done = (v) => { over.remove(); resolve(v); };
      over.querySelectorAll(".msg-buttons .msg-btn").forEach((b, i) => b.addEventListener("click", () => done(buttons[i])));
      $(".tb-close", over).addEventListener("click", () => done(null));
      over.addEventListener("keydown", (e) => { if (e.key === "Escape") done(null); });
      $(".msg-buttons .msg-btn", over).focus();
    });
  }

  // ---------- Start menu ----------
  function renderPrograms() {
    const item = (i) => `<li><button type="button" role="menuitem" data-app="${RB.esc(i.app)}">${iconImg(i.icon, 32)}<span>${RB.esc(i.title)}</span></button></li>`;
    const extras = [...EXTRA.values()].map((a) => ({ app: a.key, title: a.title, icon: a.icon, folder: a.folder }));
    const folders = new Map();
    for (const e of extras) if (e.folder) { if (!folders.has(e.folder)) folders.set(e.folder, []); folders.get(e.folder).push(e); }
    $("#SmPrograms").innerHTML = PROGRAMS.map(item).join("") + extras.filter((e) => !e.folder).map(item).join("") +
      [...folders].map(([name, list]) => `<li class="sm-sub"><button type="button" role="menuitem" aria-haspopup="menu" class="sm-folder">
        ${iconImg(FOLDER_ICON, 32)}<span>${RB.esc(name)}</span><b class="arrow">&#9656;</b></button>
        <ul class="sm-submenu" role="menu">${list.map(item).join("")}</ul></li>`).join("") +
      `<li class="sm-label">Favorites</li>` +
      RB.nav.map(([href, label]) =>
        `<li><button type="button" role="menuitem" data-go="${href}">${iconImg("@fav", 16)}<span>${RB.esc(label)}</span></button></li>`).join("");
  }
  function renderStart() {
    renderPrograms();
    const menu = $("#StartMenu");
    $("#StartButton").addEventListener("click", (e) => { e.stopPropagation(); menu.hidden ? openStart() : closeStart(); });
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.app) { closeStart(); launch(b.dataset.app); }
      else if (b.dataset.go) { closeStart(); if (user) browse(b.dataset.go); else showLogon(); }
      else if (b.dataset.internal) { closeStart(); launch(b.dataset.internal); }
      else if (b.dataset.theme) { setTheme(b.dataset.theme); closeStart(); }
      else if (b.id === "ThemeMenuBtn" || b.classList.contains("sm-folder")) {
        const li = b.parentElement, was = li.classList.contains("open");
        for (const o of menu.querySelectorAll(".sm-sub.open")) o.classList.remove("open");
        li.classList.toggle("open", !was);
      }
      else if (b.id === "LogOffBtn" || b.classList.contains("sm-logoff")) { closeStart(); logOff(); }
      else if (b.id === "ShutDownBtn" || b.classList.contains("sm-shutdown")) { closeStart(); shutDown(); }
    });
    // Win7-style search box: filters the programs column.
    $("#SmSearch").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const li of $("#SmPrograms").children) li.hidden = !!q && !li.textContent.toLowerCase().includes(q);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!menu.hidden && !e.target.closest("#StartMenu, #StartButton")) closeStart();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) { closeStart(); $("#StartButton").focus(); }
    });
    $("#QuickLaunch").addEventListener("click", (e) => {
      const b = e.target.closest("[data-quick]");
      if (!b) return;
      if (b.dataset.quick === "desktop") showDesktop(); else launch(b.dataset.quick);
    });
    $("#ShowDesktop").addEventListener("click", showDesktop);
  }
  function openStart() {
    const menu = $("#StartMenu");
    menu.hidden = false;
    $("#StartButton").classList.add("pressed");
    $("#StartButton").setAttribute("aria-expanded", "true");
    $("button", menu)?.focus({ preventScroll: true });
  }
  function closeStart() {
    const menu = $("#StartMenu");
    if (menu.hidden) return;
    menu.hidden = true;
    $("#SmSearch").value = "";
    for (const li of $("#SmPrograms").children) li.hidden = false;
    menu.querySelector(".sm-sub")?.classList.remove("open");
    $("#StartButton").classList.remove("pressed");
    $("#StartButton").setAttribute("aria-expanded", "false");
  }
  function showDesktop() {
    const anyVisible = [...windows.values()].some((w) => !w.minimized);
    for (const w of windows.values()) if (anyVisible) minimize(w);
    if (!anyVisible) for (const w of windows.values()) focus(w);
  }

  // ---------- Tray ----------
  function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const date = now.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
    $("#Clock").innerHTML = theme() === "win7" ? `<span>${time}</span><span>${date}</span>` : `<span>${time}</span>`;
    $("#Clock").title = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  function renderUser() {
    const name = user ? user.username : "Guest";
    $("#SmUser").textContent = name;
    $("#SmUser2").textContent = name;
    $("#SmUser3").textContent = user ? name : "";
    $("#TrayMoney").innerHTML = user
      ? `<span class="robux" title="ROBUX">R$${RB.num(user.robux)}</span><span class="tix" title="Tix">${RB.num(user.tix)}T</span>` : "";
    const av = $("#SmAvatar");
    av.innerHTML = "";
    if (user) RB.items().then((items) => RBAvatar.headshot(av, user.avatar, items, 48)).catch(() => {});
  }
  async function refreshUser() {
    user = await RB.me(true).catch(() => null);
    renderUser();
  }

  // ---------- Logon / log off / shut down ----------
  function showLogon(message) {
    if ($("#Logon")) return;
    closeStart();
    const over = $("#Overlay");
    over.hidden = false;
    over.innerHTML = `<form class="window logon active${theme() === "win7" ? " glass" : ""}" id="Logon" autocomplete="on">
      <div class="title-bar"><div class="title-bar-text">Welcome to RBXBanland</div>
        <div class="title-bar-controls"><button type="button" class="tb-help" aria-label="Help" title="Help"></button></div></div>
      <div class="window-body">
      <div class="logon-banner"><span class="brick"></span><span class="word">RBX<i>Banland</i></span><span class="ver">${VERSION[theme()]}</span></div>
      <div class="logon-body">
        ${iconImg("@logoff", 32, "keyicon")}
        <div class="logon-fields">
          <p id="LogonMsg">${message ? RB.esc(message) : "Type a user name and password to log on to RBXBanland."}</p>
          <div class="tabs" role="tablist">
            <button type="button" class="tab active" data-mode="login" role="tab">Log On</button>
            <button type="button" class="tab" data-mode="register" role="tab">New Account</button>
          </div>
          <label><span><u>U</u>ser name:</span><input type="text" name="username" autocomplete="username" maxlength="20" required pattern="[A-Za-z0-9_]{3,20}" title="3-20 letters, numbers or underscores"></label>
          <label><span><u>P</u>assword:</span><input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
          <label class="confirm" hidden><span><u>C</u>onfirm:</span><input name="confirm" type="password" autocomplete="new-password" maxlength="128"></label>
          <div class="logon-error" role="alert"></div>
        </div>
        <div class="logon-buttons">
          <button type="submit" class="default">OK</button>
          <button type="button" id="LogonCancel">Cancel</button>
        </div>
      </div>
      </div>
    </form>`;
    const form = $("#Logon");
    let mode = "login";
    const err = $(".logon-error", form);
    form.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-mode]");
      if (tab) {
        mode = tab.dataset.mode;
        for (const t of form.querySelectorAll(".tab")) t.classList.toggle("active", t === tab);
        $(".confirm", form).hidden = mode !== "register";
        form.confirm.required = mode === "register";
        form.password.autocomplete = mode === "register" ? "new-password" : "current-password";
        $("#LogonMsg").textContent = mode === "register"
          ? "Pick a user name (3-20 letters, numbers or _) and a password (6+ characters)."
          : "Type a user name and password to log on to RBXBanland.";
        err.textContent = "";
        form.username.focus();
      }
    });
    $("#LogonCancel").addEventListener("click", () => { err.textContent = "You must log on to use RBXBanland. (Nice try though.)"; });
    $(".tb-help", form).addEventListener("click", () => msgBox({ title: "Help", text: "New here? Click \"New Account\", pick a name and password, then press OK. Forgot your password? Ask whoever runs this server." }));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      if (mode === "register" && form.password.value !== form.confirm.value) { err.textContent = "The passwords don't match."; return; }
      const btn = $("button.default", form);
      btn.disabled = true;
      try {
        await RB.api(mode, { method: "POST", body: { username: form.username.value.trim(), password: form.password.value } });
        over.hidden = true;
        over.innerHTML = "";
        await start();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    });
    form.username.focus();
  }

  async function logOff() {
    const r = await msgBox({ title: "Log Off RBXBanland", icon: "question", text: `Are you sure you want to log off ${user ? user.username : ""}?`, buttons: ["Yes", "No"] });
    if (r !== "Yes") return;
    await RB.logout();
  }
  function loggedOut() {
    closeAll();
    user = null;
    RB._me = null;
    renderUser();
    showLogon("You have been logged off.");
  }

  async function shutDown() {
    const r = await msgBox({ title: "Shut Down RBXBanland", icon: "question",
      html: "What do you want the computer to do?<br><br>&#9675; Stand by<br>&#9679; <b>Shut down</b><br>&#9675; Restart",
      buttons: ["OK", "Cancel"] });
    if (r !== "OK") return;
    closeAll();
    const s = document.createElement("div");
    s.className = "safe-off";
    s.innerHTML = `<p>It's now safe to turn off<br>your computer.</p><small>(click anywhere to turn it back on)</small>`;
    document.body.appendChild(s);
    s.addEventListener("click", () => location.reload());
  }

  // ---------- Startup ----------
  function bootSplash() {
    let seen = false;
    try { seen = sessionStorage.getItem("rbx.booted"); sessionStorage.setItem("rbx.booted", "1"); } catch { /* ignore */ }
    if (seen) return Promise.resolve();
    const s = document.createElement("div");
    s.className = "boot";
    s.innerHTML = `<div class="boot-logo"><span class="brick"></span><span class="word">RBX<i>Banland</i><sup>${VERSION[theme()]}</sup></span></div><div class="boot-bar"><span></span></div>`;
    document.body.appendChild(s);
    return new Promise((resolve) => {
      const end = () => { s.classList.add("gone"); setTimeout(() => s.remove(), 300); resolve(); };
      s.addEventListener("click", end);
      setTimeout(end, 1500);
    });
  }

  async function start() {
    try { user = await RB.me(true); } catch (e) {
      msgBox({ title: "Network Error", icon: "error", text: e.message });
      return;
    }
    renderUser();
    if (!user) { showLogon(); return; }
    try {
      if (!sessionStorage.getItem("rbx.hit")) { await RB.api("hits", { method: "POST" }); sessionStorage.setItem("rbx.hit", "1"); }
    } catch { /* ignore */ }
    let firstTime = false;
    try { firstTime = !localStorage.getItem("rbx.readme"); localStorage.setItem("rbx.readme", "1"); } catch { /* ignore */ }
    browse(HOME);
    if (firstTime && !mobile.matches) openInternal("readme");
    if (RB._bonus) {
      msgBox({ title: "Daily Login Bonus!", icon: "info",
        html: `Welcome back, <b>${RB.esc(user.username)}</b>!<br><br>You got <b>${RB_num(RB._bonus.tix)} Tix</b> and <b>R$${RB_num(RB._bonus.robux)}</b> for logging in today.` });
      RB._bonus = null;
    }
    if (user.friendRequests) {
      setTimeout(() => msgBox({ title: "Friends", icon: "info", text: `You have ${user.friendRequests} friend request${user.friendRequests === 1 ? "" : "s"}! Open Friends to see ${user.friendRequests === 1 ? "it" : "them"}.` }), 400);
    }
  }
  const RB_num = (n) => RB.num(n);

  function init() {
    setTheme(theme());
    renderIcons();
    renderStart();
    updateClock();
    setInterval(updateClock, 10000);
    // Refresh currency/online state now and then (purchases in app windows call refreshUser directly).
    setInterval(() => { if (user && !document.hidden) refreshUser(); }, 120000);
    mobile.addEventListener?.("change", () => { if (mobile.matches) for (const w of windows.values()) toggleMax(w, true); });
    loadManifest();
    bootSplash().then(start);
  }

  const api = { open, play, notify, reloadApps: loadManifest, apps: () => [...EXTRA.values()].map((a) => ({ ...a })), setTheme, theme, refreshUser, loggedOut, msgBox, openInternal, get user() { return user; } };
  window.RBDesktop = api;
  init();
  return api;
})();
