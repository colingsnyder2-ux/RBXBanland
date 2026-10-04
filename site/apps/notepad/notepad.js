// Notepad. Documents live in localStorage ("rbx.notepad.docs"); you can also open/save real .txt files.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const ed = $("#Edit");
  const DOCS = "rbx.notepad.docs", CFG = "rbx.notepad.cfg";
  const cfg = Object.assign({ wrap: false, status: false, font: { face: "Lucida Console", size: 10, bold: false, italic: false }, last: null }, AppKit.load(CFG, {}));
  let docs = AppKit.load(DOCS, {});
  let cur = null; // id of the open doc, or null for Untitled
  let name = "Untitled";
  let savedText = "";
  let t = 0;
  let findState = { q: "", down: true, match: false };

  const saveCfg = () => AppKit.save(CFG, cfg);
  const changed = () => ed.value !== savedText;
  function setTitle() { document.title = `${changed() ? "* " : ""}${name} - Notepad`; $("#Doc").textContent = cur ? `Saved in BanDocs as "${name}"` : "Not saved yet"; }
  function applyCfg() {
    ed.classList.toggle("wrap", cfg.wrap);
    document.documentElement.classList.toggle("status", cfg.status && !cfg.wrap);
    const f = cfg.font;
    ed.style.font = `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}${Math.round(f.size * 96 / 72)}px "${f.face}", monospace`;
  }
  function stamp() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " " + d.toLocaleDateString();
  }

  function loadDoc(id) {
    const d = docs[id];
    if (!d) return newDoc();
    cur = id; name = d.name; ed.value = d.text; savedText = d.text;
    // The classic .LOG trick: a file starting with .LOG gets a timestamp appended every time it is opened.
    if (/^\.LOG(\r?\n|$)/.test(d.text)) { ed.value = d.text.replace(/\s*$/, "") + "\n" + stamp() + "\n"; }
    cfg.last = id; saveCfg();
    setTitle(); ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); updatePos();
  }
  function newDoc() {
    cur = null; name = "Untitled"; ed.value = ""; savedText = "";
    cfg.last = null; saveCfg(); setTitle(); ed.focus(); updatePos();
  }
  function persist(id, nm, text) {
    docs = AppKit.load(DOCS, {}); // pick up edits from other Notepad windows
    docs[id] = { name: nm, text, modified: Date.now() };
    if (!AppKit.save(DOCS, docs)) { AppKit.alert("Notepad", "There isn't enough room in this browser's storage to save the document.", "error"); return false; }
    clearTimeout(t); AppKit.save("rbx.notepad.draft", null);
    return true;
  }
  async function save() {
    if (!cur) return saveAs();
    if (!persist(cur, name, ed.value)) return false;
    savedText = ed.value; setTitle();
    return true;
  }
  async function saveAs() {
    const n = document.createElement("div");
    n.innerHTML = `<div class="row">Save in: <b>BanDocs</b> (this browser)</div><div class="docs" id="SD"></div>
      <div class="row" style="margin-top:8px">File <u>n</u>ame:&nbsp;<input type="text" id="FN" style="width:250px" value="${AppKit.esc(cur ? name : name === "Untitled" ? "*.txt" : name)}"></div>`;
    listDocs($("#SD", n), (id) => { $("#FN", n).value = docs[id].name; });
    let ok = false;
    await AppKit.dialog({
      title: "Save As", node: n,
      buttons: [{ label: "Save", default: true, action: (d) => {
        let nm = $("#FN", d).value.trim();
        if (!nm || nm === "*.txt") return false;
        if (!/\.[a-z0-9]{1,4}$/i.test(nm)) nm += ".txt";
        nm = nm.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
        const existing = Object.keys(docs).find((k) => docs[k].name.toLowerCase() === nm.toLowerCase());
        const id = existing || "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (!persist(id, nm, ed.value)) return false;
        cur = id; name = nm; savedText = ed.value; cfg.last = id; saveCfg(); setTitle(); ok = true;
      } }, { label: "Cancel", cancel: true }],
    });
    return ok;
  }
  function listDocs(box, onPick, onOpen) {
    docs = AppKit.load(DOCS, {});
    const ids = Object.keys(docs).sort((a, b) => docs[b].modified - docs[a].modified);
    box.innerHTML = ids.length ? ids.map((id) => `<div data-id="${id}"><span>${AppKit.esc(docs[id].name)}</span><span>${new Date(docs[id].modified).toLocaleDateString()}</span></div>`).join("")
      : '<div style="color:#808080">(no saved documents yet)</div>';
    box.addEventListener("click", (e) => {
      const row = e.target.closest("[data-id]"); if (!row) return;
      for (const r of box.children) r.classList.toggle("sel", r === row);
      onPick && onPick(row.dataset.id);
    });
    box.addEventListener("dblclick", (e) => { const row = e.target.closest("[data-id]"); if (row && onOpen) onOpen(row.dataset.id); });
  }
  async function askSave() {
    if (!changed()) return true;
    const r = await AppKit.confirm("Notepad", `The text in the ${name} file has changed.\n\nDo you want to save the changes?`);
    if (r === "Yes") return await save();
    return r === "No";
  }
  async function openDlg() {
    if (!(await askSave())) return;
    const n = document.createElement("div");
    n.innerHTML = `<div class="row">Look in: <b>BanDocs</b> (this browser)</div><div class="docs" id="OD"></div>`;
    let pick = null;
    listDocs($("#OD", n), (id) => { pick = id; }, (id) => { pick = id; document.querySelector(".dlg-shade .btn.default").click(); });
    const r = await AppKit.dialog({
      title: "Open", node: n,
      buttons: [
        { label: "Open", default: true, action: () => { if (!pick) return false; } },
        { label: "Delete", action: async () => {
          if (!pick) return false;
          docs = AppKit.load(DOCS, {}); delete docs[pick]; AppKit.save(DOCS, docs);
          if (cur === pick) { cur = null; setTitle(); }
          const row = n.querySelector(`[data-id="${pick}"]`); row && row.remove(); pick = null;
          return false;
        } },
        { label: "From PC...", action: () => { $("#OpenIn").click(); } },
        { label: "Cancel", cancel: true },
      ],
    });
    if (r === "Open" && pick) loadDoc(pick);
  }
  $("#OpenIn").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { AppKit.alert("Notepad", "This file is too large for Notepad to open.\n\nWould you like to use WordPad to read this file? (Just kidding, there is no WordPad.)", "warn"); return; }
    ed.value = await f.text(); savedText = ""; cur = null; name = f.name; setTitle(); updatePos();
  });
  function download() {
    AppKit.download(new Blob([ed.value.replace(/\r?\n/g, "\r\n")], { type: "text/plain" }), /\.[a-z0-9]{1,4}$/i.test(name) ? name : name + ".txt");
  }

  // ---------- Find / Replace / Go To ----------
  function findNext(q = findState.q, down = findState.down, match = findState.match) {
    if (!q) return findDlg();
    const hay = match ? ed.value : ed.value.toLowerCase(), needle = match ? q : q.toLowerCase();
    const i = down ? hay.indexOf(needle, ed.selectionEnd) : hay.lastIndexOf(needle, Math.max(0, ed.selectionStart - 1));
    if (i < 0 || (!down && i >= ed.selectionStart)) { AppKit.alert("Notepad", `Cannot find "${q}"`, "info"); return false; }
    ed.focus(); ed.setSelectionRange(i, i + q.length);
    // Scroll the match into view.
    const line = ed.value.slice(0, i).split("\n").length - 1;
    const lh = parseFloat(getComputedStyle(ed).lineHeight) || 16;
    ed.scrollTop = Math.max(0, line * lh - ed.clientHeight / 2);
    updatePos();
    return true;
  }
  function findDlg(replace) {
    const n = document.createElement("div");
    n.innerHTML = `<div class="find"><label for="FQ">Fi<u>n</u>d what:</label><input type="text" id="FQ" value="${AppKit.esc(findState.q || ed.value.slice(ed.selectionStart, ed.selectionEnd))}">
      ${replace ? '<label for="FR">Re<u>p</u>lace with:</label><input type="text" id="FR">' : ""}</div>
      <div class="row" style="margin-top:8px;gap:16px"><label><input type="checkbox" id="FM"${findState.match ? " checked" : ""}> Match <u>c</u>ase</label>
      ${replace ? "" : `<label><input type="radio" name="dir" value="up"${findState.down ? "" : " checked"}> <u>U</u>p</label><label><input type="radio" name="dir" value="down"${findState.down ? " checked" : ""}> <u>D</u>own</label>`}</div>`;
    const read = (d) => { findState.q = $("#FQ", d).value; findState.match = $("#FM", d).checked; const dir = $("input[name=dir]:checked", d); if (dir) findState.down = dir.value === "down"; };
    const buttons = [{ label: "Find Next", default: true, action: (d) => { read(d); findNext(); return false; } }];
    if (replace) {
      buttons.push({ label: "Replace", action: (d) => {
        read(d);
        const s = ed.value.slice(ed.selectionStart, ed.selectionEnd);
        if (s && (findState.match ? s === findState.q : s.toLowerCase() === findState.q.toLowerCase())) { ed.setRangeText($("#FR", d).value, ed.selectionStart, ed.selectionEnd, "end"); }
        findState.down = true; findNext(); return false;
      } });
      buttons.push({ label: "Replace All", action: (d) => {
        read(d);
        if (!findState.q) return false;
        const re = new RegExp(findState.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), findState.match ? "g" : "gi");
        ed.select(); document.execCommand("insertText", false, ed.value.replace(re, () => $("#FR", d).value));
        return false;
      } });
    }
    buttons.push({ label: "Cancel", cancel: true });
    AppKit.dialog({ title: replace ? "Replace" : "Find", node: n, buttons });
  }
  function gotoDlg() {
    const n = document.createElement("div");
    const lines = ed.value.split("\n").length;
    n.innerHTML = `<div class="row">Line number:</div><input type="text" id="GL" value="${curLine()}" style="width:220px">`;
    AppKit.dialog({ title: "Go To Line", node: n, buttons: [{ label: "OK", default: true, action: (d) => {
      const v = parseInt($("#GL", d).value, 10);
      if (!(v >= 1 && v <= lines)) { AppKit.alert("Notepad - Goto Line", "The line number is beyond the total number of lines", "info"); return false; }
      const parts = ed.value.split("\n"); let pos = 0;
      for (let i = 0; i < v - 1; i++) pos += parts[i].length + 1;
      ed.focus(); ed.setSelectionRange(pos, pos); updatePos();
    } }, { label: "Cancel", cancel: true }] });
  }
  function curLine() { return ed.value.slice(0, ed.selectionStart).split("\n").length; }
  function updatePos() {
    const before = ed.value.slice(0, ed.selectionStart);
    const ln = before.split("\n").length, col = before.length - before.lastIndexOf("\n");
    $("#Pos").textContent = `Ln ${ln}, Col ${col}`;
  }
  for (const ev of ["keyup", "click", "input", "select"]) ed.addEventListener(ev, updatePos);

  // ---------- Font dialog ----------
  function fontDlg() {
    const FACES = ["Lucida Console", "Courier New", "Consolas", "Fixedsys", "Terminal", "Arial", "Comic Sans MS", "Georgia", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana", "Microsoft Sans Serif"];
    const STYLES = ["Regular", "Italic", "Bold", "Bold Italic"];
    const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
    const f = { ...cfg.font };
    const n = document.createElement("div");
    n.innerHTML = `<div class="fontdlg"><label><u>F</u>ont:</label><label>Font st<u>y</u>le:</label><label><u>S</u>ize:</label>
      <select size="8" id="FF">${FACES.map((x) => `<option${x === f.face ? " selected" : ""}>${x}</option>`).join("")}</select>
      <select size="8" id="FS">${STYLES.map((x, i) => `<option value="${i}"${i === (f.bold ? 2 : 0) + (f.italic ? 1 : 0) ? " selected" : ""}>${x}</option>`).join("")}</select>
      <select size="8" id="FZ">${SIZES.map((x) => `<option${x === f.size ? " selected" : ""}>${x}</option>`).join("")}</select>
      <fieldset class="sample"><span id="SP">AaBbYyZz</span></fieldset></div>`;
    const upd = () => {
      f.face = $("#FF", n).value; const st = +$("#FS", n).value; f.bold = st >= 2; f.italic = st % 2 === 1; f.size = +$("#FZ", n).value;
      $("#SP", n).style.font = `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}${Math.round(f.size * 96 / 72)}px "${f.face}"`;
    };
    for (const s of n.querySelectorAll("select")) s.addEventListener("change", upd);
    upd();
    AppKit.dialog({ title: "Font", node: n, buttons: [{ label: "OK", default: true, action: () => { cfg.font = f; saveCfg(); applyCfg(); } }, { label: "Cancel", cancel: true }] });
  }

  // ---------- Menus ----------
  const exec = (c) => { ed.focus(); document.execCommand(c); };
  AppKit.menubar($("#Menu"), [
    { label: "&File", items: () => [
      { label: "&New", key: "Ctrl+N", action: async () => { if (await askSave()) newDoc(); } },
      { label: "&Open...", key: "Ctrl+O", action: openDlg },
      { label: "&Save", key: "Ctrl+S", action: save },
      { label: "Save &As...", action: saveAs },
      { label: "Save to &PC (.txt)...", action: download },
      "-",
      { label: "Page Set&up...", disabled: () => true },
      { label: "&Print...", key: "Ctrl+P", disabled: () => true },
      "-",
      { label: "E&xit", action: async () => { if (await askSave()) AppKit.host.close(); } },
    ] },
    { label: "&Edit", items: () => {
      const hasSel = ed.selectionStart !== ed.selectionEnd;
      return [
        { label: "&Undo", key: "Ctrl+Z", action: () => exec("undo") },
        "-",
        { label: "Cu&t", key: "Ctrl+X", disabled: () => !hasSel, action: () => exec("cut") },
        { label: "&Copy", key: "Ctrl+C", disabled: () => !hasSel, action: () => exec("copy") },
        { label: "&Paste", key: "Ctrl+V", action: async () => { try { const t = await navigator.clipboard.readText(); ed.focus(); document.execCommand("insertText", false, t); } catch { AppKit.alert("Notepad", "Use Ctrl+V to paste here (the browser blocked menu paste).", "info"); } } },
        { label: "De&lete", key: "Del", disabled: () => !hasSel, action: () => exec("delete") },
        "-",
        { label: "&Find...", key: "Ctrl+F", action: () => findDlg(false) },
        { label: "Find &Next", key: "F3", action: () => findNext() },
        { label: "&Replace...", key: "Ctrl+H", action: () => findDlg(true) },
        { label: "&Go To...", key: "Ctrl+G", disabled: () => cfg.wrap, action: gotoDlg },
        "-",
        { label: "Select &All", key: "Ctrl+A", action: () => { ed.focus(); ed.select(); } },
        { label: "Time/&Date", key: "F5", action: () => { ed.focus(); document.execCommand("insertText", false, stamp()); } },
      ];
    } },
    { label: "F&ormat", items: () => [
      { label: "&Word Wrap", checked: () => cfg.wrap, action: () => { cfg.wrap = !cfg.wrap; saveCfg(); applyCfg(); } },
      { label: "&Font...", action: fontDlg },
    ] },
    { label: "&View", items: () => [
      { label: "&Status Bar", checked: () => cfg.status && !cfg.wrap, disabled: () => cfg.wrap, action: () => { cfg.status = !cfg.status; saveCfg(); applyCfg(); } },
    ] },
    { label: "&Help", items: () => [
      { label: "&Help Topics", action: () => AppKit.alert("Notepad Help", "Notepad saves documents inside this browser (BanDocs), so they're here next time.\nUse File > Save to PC to download a real .txt file.\n\nTip: type .LOG on the first line and Notepad adds the time every time you open the file.", "info") },
      "-",
      { label: "&About Notepad", action: () => AppKit.alert("About Notepad", "Notepad\nRBXBanland Edition, Version 4.10.1998", "info") },
    ] },
  ]);
  addEventListener("keydown", (e) => {
    if (document.querySelector(".dlg-shade")) return;
    const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
    const run = (f) => { e.preventDefault(); f(); };
    if (c && k === "s") run(save);
    else if (c && k === "o") run(openDlg);
    else if (c && k === "n") run(async () => { if (await askSave()) newDoc(); });
    else if (c && k === "f") run(() => findDlg(false));
    else if (c && k === "h") run(() => findDlg(true));
    else if (c && k === "g" && !cfg.wrap) run(gotoDlg);
    else if (e.key === "F3") run(() => findNext());
    else if (e.key === "F5") run(() => document.execCommand("insertText", false, stamp()));
  });
  // Tab inserts a tab character instead of moving focus.
  ed.addEventListener("keydown", (e) => { if (e.key === "Tab" && !e.ctrlKey && !e.altKey) { e.preventDefault(); document.execCommand("insertText", false, "\t"); } });
  ed.addEventListener("input", () => { setTitle(); if (!cur) return; });
  // Keep a crash-safe draft of unsaved text.
  ed.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => AppKit.save("rbx.notepad.draft", { cur, name, text: ed.value, saved: !changed() }), 400); });

  applyCfg();
  const draft = AppKit.load("rbx.notepad.draft", null);
  if (draft && !draft.saved && typeof draft.text === "string") {
    cur = draft.cur && docs[draft.cur] ? draft.cur : null; name = draft.name || "Untitled";
    ed.value = draft.text; savedText = cur ? docs[cur].text : ""; setTitle(); updatePos();
  } else if (cfg.last && docs[cfg.last]) loadDoc(cfg.last);
  else newDoc();
  ed.focus();
})();
