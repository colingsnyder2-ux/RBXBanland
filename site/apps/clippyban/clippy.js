// ClippyBan: original interactive desktop toy. All character art drawn in code.
(() => {
  "use strict";
  const cv = document.getElementById("Scene"), ctx = cv.getContext("2d"), bubble = document.getElementById("Bubble"), fill = document.getElementById("Fill"), scoreEl = document.getElementById("Score"), tip = document.getElementById("Tip");
  const lines = {
    letter: ["It looks like you're writing a letter.", "Would you like me to add 47 exclamation marks?", "Dear Human,\nI hope this finds you extremely well."],
    website: ["It looks like you're making a web page.", "Have you tried adding a dancing under-construction GIF?", "HTML stands for How To Make Laughs."],
    game: ["It looks like you're playing a game.", "Excellent choice. I have hidden the rules.", "Press buttons. Acquire glory."],
    nothing: ["It looks like you're doing nothing.", "Would you like help doing that?", "Nothing completed successfully."],
    pet: ["*happy paperclip noises*", "Please continue. I am very shiny.", "Petting bonus activated."]
  };
  let W = 0, H = 0, helpful = 0, interrupts = 0, mood = 0, action = "pet", t0 = performance.now(), bubbleT = 0, blink = 0, last = t0;
  function resize() { const r = cv.getBoundingClientRect(); W = Math.max(240, Math.floor(r.width)); H = Math.max(180, Math.floor(r.height)); cv.width = W; cv.height = H; }
  new ResizeObserver(resize).observe(cv);
  function say(text) { bubble.textContent = text; bubbleT = 4; }
  function doAction(name) { action = name; const options = lines[name] || lines.pet, text = options[Math.floor(Math.random() * options.length)]; say(text); if (name === "pet") helpful += 2; else { helpful++; interrupts++; } mood = Math.min(100, mood + (name === "pet" ? 8 : 5)); scoreEl.textContent = `Helpful: ${helpful}\nInterruptions: ${interrupts}`; tip.textContent = helpful > 18 ? "Tip: You may now be qualified to manage a small office." : ["Tip: Clippy loves attention. Probably too much.", "Tip: Try every button. Clippy keeps receipts.", "Tip: Productivity is a state of mind."][helpful % 3]; }
  function drawClippy(x, y, s, blinkNow) {
    ctx.save(); ctx.translate(x, y + Math.sin((performance.now() - t0) / 360) * 3); ctx.scale(s, s); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#5e6265"; ctx.lineWidth = 11; ctx.beginPath(); ctx.arc(0, 0, 56, -2.55, 2.3); ctx.stroke(); ctx.strokeStyle = "#d2d5d7"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 56, -2.55, 2.3); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(-17, -12, 7, 10, 0, 0, Math.PI * 2); ctx.ellipse(17, -12, 7, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#111"; if (!blinkNow) { ctx.beginPath(); ctx.arc(-16, -11, 3, 0, Math.PI * 2); ctx.arc(16, -11, 3, 0, Math.PI * 2); ctx.fill(); } else { ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-22, -12); ctx.lineTo(-11, -12); ctx.moveTo(11, -12); ctx.lineTo(22, -12); ctx.stroke(); }
    ctx.strokeStyle = "#111"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 1, 20, .15, Math.PI - .15); ctx.stroke(); ctx.fillStyle = "#d9a441"; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function draw() {
    const vapor = AppKit.theme() === "vaporwave"; ctx.fillStyle = vapor ? "#36216f" : "#78b8ea"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = vapor ? "#3d754a" : "#5a9a47"; ctx.fillRect(0, H * .63, W, H * .37); ctx.fillStyle = vapor ? "#2b5b35" : "#3f7735"; for (let x = -20; x < W + 20; x += 36) ctx.fillRect(x, H * .63, 2, H * .37);
    ctx.fillStyle = "rgba(255,255,255,.6)"; for (let x = 30; x < W; x += 90) { ctx.beginPath(); ctx.arc(x, 35 + (x % 3) * 8, 18, 0, Math.PI * 2); ctx.arc(x + 18, 34, 22, 0, Math.PI * 2); ctx.fill(); }
    const s = Math.min(1.25, Math.max(.7, W / 480)), bob = Math.sin((performance.now() - t0) / 360) * 3; drawClippy(W * .58, H * .57 + bob, s, blink > 0);
    if (action === "pet") { ctx.fillStyle = "#ffe873"; ctx.font = `${Math.round(12 * s)}px Arial`; ctx.fillText("♥", W * .58 + 55 * s, H * .42); }
    fill.style.width = `${mood}%`; if (bubbleT > 0) bubbleT -= (performance.now() - last) / 1000; else if (Math.random() < .008) say("Need any help? No? I will wait here.");
  }
  function frame(now) { requestAnimationFrame(frame); const dt = now - last; last = now; if (blink > 0) blink -= dt / 1000; else if (Math.random() < .006) blink = .15; draw(); }
  document.querySelectorAll(".ask").forEach((b) => b.addEventListener("click", () => doAction(b.dataset.act)));
  cv.addEventListener("pointerdown", () => doAction("pet"));
  addEventListener("keydown", (e) => { if (e.key === "F2") { helpful = 0; interrupts = 0; mood = 0; say("Fresh page, fresh possibilities."); scoreEl.textContent = "Helpful: 0\nInterruptions: 0"; } });
  AppKit.menubar(document.getElementById("Menu"), [{ label: "&Clippy", items: [{ label: "&New Session", key: "F2", action: () => { helpful = 0; interrupts = 0; mood = 0; say("Fresh page, fresh possibilities."); scoreEl.textContent = "Helpful: 0\nInterruptions: 0"; } }, { label: "&Snooze", key: "F4", action: () => say("I will be quiet for four seconds. Probably.") }, "-", { label: "E&xit", action: () => AppKit.host.close() }] }, { label: "&Help", items: [{ label: "&About ClippyBan", action: () => AppKit.alert("About ClippyBan", "ClippyBan 1.0\nAn original paperclip toy for RBXBanland.\nAll art and code are local and drawn in code.", "info") }] }]);
  resize(); requestAnimationFrame(frame);
})();
