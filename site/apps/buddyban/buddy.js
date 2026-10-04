// BuddyBan: original local-only AIM-era messenger toy.
(() => {
  "use strict";
  const log = document.getElementById("Log"), text = document.getElementById("Text"), title = document.getElementById("Title"), status = document.getElementById("Status");
  const buddies = { sam: { name:"SamBan", state:"online", desc:"totally real human", replies:["yo", "lol", "brb", "that rules", "whoa"] }, mike: { name:"mike_2001", state:"away", desc:"brb pizza", replies:["one sec", "pizza acquired", "cant talk rn", "back soon"] }, roblox: { name:"R0BLOX_K1NG", state:"online", desc:"building stuff", replies:["check my place", "lol nice", "brb scripting", "add me"] }, ghost: { name:"GhostUser", state:"offline", desc:"offline", replies:[] } };
  let active = "sam", away = false, unread = 0;
  function add(who, value, nudge = false) { const el = document.createElement("div"); el.className = nudge ? "nudge" : `msg${who === "You" ? " me" : ""}`; el.innerHTML = nudge ? "⚡ NUDGE! ⚡" : `<b>${who}:</b> ${AppKit.esc(value)}`; log.appendChild(el); log.scrollTop = log.scrollHeight; }
  function intro() { log.innerHTML = ""; const b = buddies[active]; add("BuddyBan", `Signed on with ${b.name}.`); if (b.state === "offline") add(b.name, "This buddy is offline. Your message will wait in the void."); else add(b.name, b.replies[0] || "..."); }
  function select(id) { active = id; document.querySelectorAll(".buddy").forEach((b) => b.classList.toggle("active", b.dataset.id === id)); const b = buddies[id]; title.textContent = `${b.name} — ${b.state}`; intro(); unread = 0; }
  function send() { const value = text.value.trim(); if (!value) return; const b = buddies[active]; add("You", value); text.value = ""; if (b.state === "offline") return; setTimeout(() => { add(b.name, b.replies[Math.floor(Math.random() * b.replies.length)]); }, 220); }
  function nudge() { add("You", "sent a nudge", true); if (buddies[active].state !== "offline") setTimeout(() => add(buddies[active].name, "hey! stop shaking my window", true), 140); }
  document.querySelectorAll(".buddy").forEach((b) => b.addEventListener("click", () => select(b.dataset.id)));
  document.getElementById("Send").addEventListener("click", send); document.getElementById("Nudge").addEventListener("click", nudge); text.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  AppKit.menubar(document.getElementById("Menu"), [{ label:"&Buddy", items:[{ label:"&New Message", key:"N", action:() => { text.focus(); } }, { label:"Set &Away", key:"A", checked:() => away, action:() => { away = !away; status.textContent = away ? "Away" : "Online"; } }, "-", { label:"E&xit", action:() => AppKit.host.close() }] }, { label:"&Help", items:[{ label:"&About BuddyBan", action:() => AppKit.alert("About BuddyBan", "BuddyBan 1.0\nAn original local-only AIM-era messenger toy.\nNo messages leave this page.", "info") }] }]);
  intro();
})();
