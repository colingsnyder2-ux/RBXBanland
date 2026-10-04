// Calculator, Windows 98 standard mode. Immediate-execution logic like the original (2 + 3 * 4 = 20).
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const KEYS = [
    // label, x, y, red?, wide?, action, title
    ["Backspace", 55, 36, 1, 1, "back"], ["CE", 121, 36, 1, 1, "ce"], ["C", 187, 36, 1, 1, "c"],
    ["MC", 10, 73, 1, 0, "mc"], ["7", 55, 73, 0, 0, "7"], ["8", 94, 73, 0, 0, "8"], ["9", 133, 73, 0, 0, "9"], ["/", 172, 73, 1, 0, "/"], ["sqrt", 211, 73, 0, 0, "sqrt"],
    ["MR", 10, 105, 1, 0, "mr"], ["4", 55, 105, 0, 0, "4"], ["5", 94, 105, 0, 0, "5"], ["6", 133, 105, 0, 0, "6"], ["*", 172, 105, 1, 0, "*"], ["%", 211, 105, 0, 0, "%"],
    ["MS", 10, 137, 1, 0, "ms"], ["1", 55, 137, 0, 0, "1"], ["2", 94, 137, 0, 0, "2"], ["3", 133, 137, 0, 0, "3"], ["-", 172, 137, 1, 0, "-"], ["1/x", 211, 137, 0, 0, "inv"],
    ["M+", 10, 169, 1, 0, "mplus"], ["0", 55, 169, 0, 0, "0"], ["+/-", 94, 169, 0, 0, "neg"], [".", 133, 169, 0, 0, "."], ["+", 172, 169, 1, 0, "+"], ["=", 211, 169, 1, 0, "="],
  ];
  const calc = $("#Calc");
  for (const [label, x, y, red, wide, act] of KEYS) {
    const b = document.createElement("button");
    b.className = "btn k" + (red ? " r" : "") + (wide ? " wide" : "");
    b.style.left = x + "px"; b.style.top = y + "px";
    b.textContent = label; b.dataset.act = act;
    b.addEventListener("click", () => press(act));
    b.addEventListener("pointerdown", (e) => e.preventDefault()); // keep keyboard focus on the page
    calc.appendChild(b);
  }

  let entry = "0";        // what the user is typing / the shown value
  let acc = null;         // left operand
  let op = null;          // pending operator
  let fresh = true;       // next digit starts a new number
  let lastOp = null, lastArg = null; // for repeated "="
  let mem = 0, hasMem = false;
  let error = null;
  let grouping = AppKit.load("rbx.calc.group", false);

  const val = () => parseFloat(entry);
  function fmt(n) {
    if (!isFinite(n)) return null;
    let s;
    if (n !== 0 && (Math.abs(n) >= 1e16 || Math.abs(n) < 1e-15)) {
      s = n.toExponential(15).replace(/\.?0+e/, "e").replace("e+", "e+");
      return s;
    }
    s = String(parseFloat(n.toPrecision(16)));
    if (s.includes("e")) s = parseFloat(s).toFixed(20).replace(/0+$/, "");
    return s;
  }
  function show() {
    const d = $("#Display");
    if (error) { d.textContent = error; return; }
    let s = entry;
    if (!/e/.test(s) && !s.includes(".")) s += ".";
    if (grouping && !/e/.test(s)) {
      const [i, f] = s.split(".");
      const neg = i.startsWith("-");
      s = (neg ? "-" : "") + i.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + f;
    }
    d.textContent = s;
    $("#Mem").textContent = hasMem ? "M" : "";
  }
  function setNum(n) {
    const s = fmt(n);
    if (s == null) { fail(n === Infinity || n === -Infinity ? "Cannot divide by zero." : "Invalid input for function."); return false; }
    entry = s; return true;
  }
  function fail(msg) { error = msg; acc = null; op = null; fresh = true; }
  function apply(a, o, b) {
    switch (o) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? (a === 0 ? NaN : Infinity) : a / b;
    }
    return b;
  }
  function press(k) {
    if (error && k !== "c" && k !== "ce") { if (/^[0-9.]$/.test(k)) { error = null; entry = "0"; fresh = true; } else return; }
    if (/^[0-9]$/.test(k)) {
      if (fresh) { entry = k; fresh = false; }
      else if (entry.replace(/[-.]/g, "").length < 32) entry = entry === "0" ? k : entry + k;
      if (op === null && lastOp) { /* typing after "=" starts a new calculation */ }
    } else if (k === ".") {
      if (fresh) { entry = "0."; fresh = false; } else if (!entry.includes(".")) entry += ".";
    } else if (k === "back") {
      if (!fresh) { entry = entry.length > 1 && !(entry.length === 2 && entry.startsWith("-")) ? entry.slice(0, -1) : "0"; }
    } else if (k === "ce") { entry = "0"; fresh = true; error = null; }
    else if (k === "c") { entry = "0"; acc = null; op = null; fresh = true; lastOp = null; error = null; }
    else if (k === "neg") {
      if (entry !== "0" && entry !== "0.") entry = entry.startsWith("-") ? entry.slice(1) : "-" + entry;
    } else if ("+-*/".includes(k)) {
      if (op && !fresh) { if (!setNum(apply(acc, op, val()))) { show(); return; } }
      acc = val(); op = k; fresh = true; lastOp = null;
    } else if (k === "=") {
      if (op) {
        const b = val();
        lastOp = op; lastArg = b;
        if (setNum(apply(acc, op, b))) { acc = null; op = null; }
      } else if (lastOp) setNum(apply(val(), lastOp, lastArg));
      fresh = true;
    } else if (k === "sqrt") {
      if (val() < 0) fail("Invalid input for function."); else setNum(Math.sqrt(val()));
      fresh = true;
    } else if (k === "inv") {
      if (val() === 0) fail("Cannot divide by zero."); else setNum(1 / val());
      fresh = true;
    } else if (k === "%") {
      // Windows-style percent: x% of the left operand.
      setNum(acc != null ? acc * val() / 100 : 0); fresh = true;
    } else if (k === "mc") { mem = 0; hasMem = false; }
    else if (k === "mr") { setNum(mem); fresh = true; }
    else if (k === "ms") { mem = val(); hasMem = mem !== 0; fresh = true; }
    else if (k === "mplus") { mem += val(); hasMem = mem !== 0; fresh = true; }
    show();
  }

  addEventListener("keydown", (e) => {
    if (document.querySelector(".dlg-shade")) return;
    const c = e.ctrlKey || e.metaKey;
    let k = null;
    if (c) {
      const m = { l: "mc", r: "mr", m: "ms", p: "mplus" }[e.key.toLowerCase()];
      if (m) k = m;
      else if (e.key.toLowerCase() === "c") { e.preventDefault(); copy(); return; }
      else if (e.key.toLowerCase() === "v") return; // handled by paste event
    } else if (/^[0-9]$/.test(e.key)) k = e.key;
    else if (e.key === "." || e.key === ",") k = ".";
    else if ("+-*/".includes(e.key)) k = e.key;
    else if (e.key === "Enter" || e.key === "=") k = "=";
    else if (e.key === "Escape") k = "c";
    else if (e.key === "Delete") k = "ce";
    else if (e.key === "Backspace") k = "back";
    else if (e.key === "%") k = "%";
    else if (e.key === "@") k = "sqrt";
    else if (e.key.toLowerCase() === "r") k = "inv";
    else if (e.key === "F9") k = "neg";
    if (!k) return;
    e.preventDefault();
    press(k);
    const b = document.querySelector(`[data-act="${CSS.escape(k)}"]`);
    if (b) { b.classList.add("pressed"); setTimeout(() => b.classList.remove("pressed"), 100); }
  });
  function copy() {
    const s = error ? "" : entry;
    try { navigator.clipboard.writeText(s); } catch { /* ignore */ }
  }
  function pasteText(t) {
    for (const ch of String(t).trim()) {
      if (/[0-9.]/.test(ch)) press(ch);
      else if ("+-*/".includes(ch)) press(ch);
      else if (ch === "=") press("=");
      else if (ch === "c" || ch === "C") press("c");
      else if (ch === "%") press("%");
    }
  }
  addEventListener("paste", (e) => { pasteText(e.clipboardData.getData("text")); e.preventDefault(); });
  AppKit.menubar($("#Menu"), [
    { label: "&Edit", items: [
      { label: "&Copy", key: "Ctrl+C", action: copy },
      { label: "&Paste", key: "Ctrl+V", action: async () => { try { pasteText(await navigator.clipboard.readText()); } catch { /* blocked */ } } },
    ] },
    { label: "&View", items: () => [
      { label: "S&tandard", radio: true, checked: () => true },
      { label: "&Scientific", radio: true, disabled: () => true },
      "-",
      { label: "&Digit grouping", checked: () => grouping, action: () => { grouping = !grouping; AppKit.save("rbx.calc.group", grouping); show(); } },
    ] },
    { label: "&Help", items: [
      { label: "&Help Topics", action: () => AppKit.alert("Calculator Help", "Click the buttons or use the keyboard.\n\nEsc = C, Del = CE, Enter = '=', @ = sqrt, R = 1/x, F9 = +/-\nCtrl+L/R/M/P = MC/MR/MS/M+", "info") },
      "-",
      { label: "&About Calculator", action: () => AppKit.alert("About Calculator", "Calculator\nRBXBanland Edition, Version 4.10.1998", "info") },
    ] },
  ]);
  show();
  AppKit.host.resizeClient(256, document.body.offsetHeight);
  window.__calc = { press, get display() { return $("#Display").textContent; } };
})();
