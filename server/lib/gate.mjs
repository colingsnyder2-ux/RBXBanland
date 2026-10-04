// The Windows 98 style "Enter Network Password" page shown to visitors without the access cookie.
// Fully self-contained (inline CSS, no external files) because every static file sits behind the gate.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function gatePage({ next = "/", error = "" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Enter Network Password</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: #008080; display: flex; align-items: center; justify-content: center; padding: 16px;
    font: 11px Tahoma, "MS Sans Serif", Geneva, sans-serif; color: #000;
  }
  .win {
    width: 100%; max-width: 420px; background: #c0c0c0; padding: 3px;
    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #dfdfdf, inset -2px -2px #808080, inset 2px 2px #fff;
  }
  .title {
    display: flex; align-items: center; justify-content: space-between; padding: 3px 3px 3px 4px;
    background: linear-gradient(90deg, #000080, #1084d0); color: #fff; font-weight: bold;
  }
  .title b { display: flex; align-items: center; gap: 4px; }
  .x {
    width: 16px; height: 14px; background: #c0c0c0; color: #000; font: bold 10px/12px Tahoma, sans-serif; text-align: center;
    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
  }
  .body { display: flex; gap: 14px; padding: 14px 12px 10px; }
  .keys { flex: 0 0 40px; }
  .main { flex: 1; min-width: 0; }
  p { margin: 0 0 12px; line-height: 1.4; }
  .row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .row label { flex: 0 0 82px; }
  .row span { flex: 1; }
  input[type=password] {
    width: 100%; height: 21px; padding: 2px 3px; font: 11px Tahoma, sans-serif; background: #fff; border: 0;
    box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a; outline: none;
  }
  .check { display: flex; align-items: center; gap: 6px; margin: 4px 0 0 90px; color: #444; }
  .buttons { display: flex; flex-direction: column; gap: 6px; flex: 0 0 76px; }
  button {
    min-width: 75px; height: 23px; font: 11px Tahoma, sans-serif; background: #c0c0c0; border: 0; color: #000;
    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
  }
  button:active { box-shadow: inset 1px 1px #0a0a0a, inset -1px -1px #fff, inset 2px 2px #808080, inset -2px -2px #dfdfdf; }
  button.default { outline: 1px solid #000; outline-offset: -1px; }
  button:focus-visible { outline: 1px dotted #000; outline-offset: -4px; }
  .err { color: #a00000; font-weight: bold; }
  .foot { margin-top: 14px; color: #fff; text-align: center; font-size: 10px; text-shadow: 0 1px 0 #004040; }
  @media (max-width: 420px) { .body { flex-wrap: wrap; } .buttons { flex-direction: row; flex-basis: 100%; justify-content: flex-end; } .keys { display: none; } .row label { flex-basis: 70px; } .check { margin-left: 0; } }
</style>
</head>
<body>
<div>
  <form class="win" method="post" action="/__gate" autocomplete="off">
    <div class="title"><b>Enter Network Password</b><span class="x" aria-hidden="true">&times;</span></div>
    <div class="body">
      <svg class="keys" viewBox="0 0 32 32" width="40" height="40" shape-rendering="crispEdges" aria-hidden="true">
        <rect x="3" y="6" width="12" height="12" fill="#ffd200" stroke="#000"/><rect x="7" y="10" width="4" height="4" fill="#c0c0c0" stroke="#000"/>
        <rect x="15" y="10" width="14" height="4" fill="#ffd200" stroke="#000"/><rect x="23" y="14" width="3" height="5" fill="#ffd200" stroke="#000"/>
        <rect x="27" y="14" width="2" height="4" fill="#ffd200" stroke="#000"/>
        <rect x="5" y="20" width="22" height="8" fill="#808080" stroke="#000"/><rect x="7" y="22" width="18" height="1" fill="#c0c0c0"/>
      </svg>
      <div class="main">
        <p>Please type your access token to enter <b>RBXBanland</b>.</p>
        ${error ? `<p class="err">${esc(error)}</p>` : ""}
        <div class="row"><label>Resource:</label><span>\\\\RBXBANLAND\\WWW</span></div>
        <div class="row"><label for="token">Password:</label><span><input type="password" id="token" name="token" autofocus required maxlength="200"></span></div>
        <input type="hidden" name="next" value="${esc(next)}">
        <div class="check">&#9745; Save this password in your password list</div>
      </div>
      <div class="buttons">
        <button type="submit" class="default">OK</button>
        <button type="reset">Cancel</button>
      </div>
    </div>
  </form>
  <div class="foot">RBXBanland is a private fan project. Ask whoever sent you here for the token.</div>
</div>
</body>
</html>`;
}
