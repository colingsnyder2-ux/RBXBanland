# Game client integration (play.html)

The website side is done; this is the contract `play.html` can rely on. I haven't changed play.html's
launch logic. The only additions are CSS rules in `css/site.css` that hide the site header/footer and the "Back to place"
link when play.html runs inside the desktop's `RobloxApp.exe` window (`html.rb-embedded.rb-play`, set by `RB.mount`).

## How a game gets launched

1. The place page (`game.html`) calls `RB.play(map)` (in `js/common.js`) when Play is clicked.
2. `RB.play` first does `POST /api/places/<id>/visit`. **The visit is already counted here**, so play.html
   must NOT post a visit itself (it would double count).
3. Then it opens `play.html?id=<placeId>` in a desktop window titled `RobloxApp.exe - <Place Name>`
   (an iframe with `allow="fullscreen; autoplay; cross-origin-isolated; gamepad"`), or navigates to it when the site
   isn't running inside the desktop. Only one RobloxApp.exe runs at a time. Closing the window sets the
   iframe to `about:blank` so the emulator stops right away.

## Launcher protocol (desktop <-> play.html)

`RBDesktop.play()` now opens a themed "Roblox" launcher dialog and an invisible `RobloxApp.exe - <place>` window.
The window is opacity 0, click-through and behind everything, but it stays in the DOM and keeps rendering.
Its iframe loads `play.html?id=<place>&embed=1&cw=<W>&ch=<H>`, where W x H is the client area we plan to show:
800x600, scaled down to fit the desktop and kept at 4:3.

play.html posts to `window.parent` (we check `event.source` is that iframe):
- `{ rb: "play", kind: "progress", pct: 0-100, text: "Booting Windows...", detail?: "..." }` updates the launcher
  (`text` = big line, `detail` = small line, `pct` = bar).
- `{ rb: "play", kind: "ready", width, height }` closes the launcher and reveals the window, sized so the iframe is exactly
  width x height CSS px (scaled down only if it doesn't fit). The window gets its taskbar button and focus, and the iframe gets focus.
- `{ rb: "play", kind: "error", text }` shows the error in the launcher. Its OK button closes everything.

Notes:
- Cancel or X on the launcher closes both windows and blanks the game iframe (`about:blank`). So does closing the game window.
- Resizing and maximizing keep the client area at the ready message's width:height ratio, snapped to whole pixels
  (4:3 means widths are multiples of 4). play.html should just fill its viewport; it will never see letterboxing from us.
- Fallback: if the iframe never posts anything within 25 s of loading, the window is revealed anyway (for an older play.html).
- Visits are still recorded by the place page before launching.

## (a) Player name and avatar

- **Name, nothing to change:** whenever any page loads `/api/me`, `common.js` writes the logged-in
  username to `localStorage["rb.name"]`. play.html already reads `RB.playerName()`, so it gets the account
  name. Usernames are `[A-Za-z0-9_]{3,20}`, so they are safe to put in the Lua `-script` string.
- **Name, authoritative (recommended):** `const me = await RB.me();` resolves to `null` or
  `{ username, avatar, ... }`. Use `me.username`.
- **Avatar:** either `me.avatar` from above, or `GET /api/avatar/<username>` (needs only the gate cookie, not a
  session, so it also works from a worker or another page):

```json
{
  "username": "builderman",
  "avatar": {
    "colors": { "head": 24, "torso": 23, "leftArm": 24, "rightArm": 24, "leftLeg": 119, "rightLeg": 119 },
    "hats": ["ArrowHat.rbxm"], "face": "DefaultFace.rbxm", "head": "DefaultHead.rbxm",
    "shirt": "NoShirt.rbxm", "pants": "NoPants.rbxm", "tshirt": "NoTShirt.rbxm", "extra": "NoExtra.rbxm"
  },
  "novetus": {
    "hat1": "ArrowHat.rbxm", "hat2": "NoHat.rbxm", "hat3": "NoHat.rbxm",
    "headColor": 24, "torsoColor": 23, "leftArmColor": 24, "rightArmColor": 24, "leftLegColor": 119, "rightLegColor": 119,
    "tshirt": "NoTShirt.rbxm", "shirt": "NoShirt.rbxm", "pants": "NoPants.rbxm",
    "face": "DefaultFace.rbxm", "head": "DefaultHead.rbxm", "extra": "NoExtra.rbxm"
  },
  "charcustomBase": "shareddata/charcustom/"
}
```

`novetus` is already in `InitalizeClientAppearance(Player, Hat1ID, Hat2ID, Hat3ID, HeadColorID, TorsoColorID,
LeftArmColorID, RightArmColorID, LeftLegColorID, RightLegColorID, TShirtID, ShirtID, PantsID, FaceID, HeadID, ItemID)`
order (script2008M.lua). Files are referenced as `rbxasset://../../../shareddata/charcustom/<folder>/<file>` with
folders `hats, faces, heads, tshirts, shirts, pants, custom` (`custom` = the "extra" slot, e.g. GirlTorso.rbxm). **The game zip needs those .rbxm files and the textures/meshes
they reference** (`hats/textures`, `hats/fonts`, `shirts/textures`, `pants/textures`, the face and t-shirt PNGs).
They are not on the website. Only PNG icons were copied, to `site/img/catalog/`. The full list of possible
items is `server/catalog.json` (`items[].id` = `<folder>/<file>`), currently 448 items, about 75 MB in Novetus.

Suggested wiring in play.html (your call):

```js
const me = await RB.me();
const name = me ? me.username : RB.playerName();
const app = me ? (await (await fetch("api/avatar/" + encodeURIComponent(me.username))).json()).novetus : null;
// pass `app` into solo.lua, e.g. as _G.SoloAppearance = {...}, and call InitalizeClientAppearance-style code
```

## (b) Visits

Nothing needed from play.html: `RB.play()` posts the visit before opening the window. If you ever launch
games another way, call `POST /api/places/<id>/visit` with `Content-Type: application/json` and body `{}`
(response `{placeId, visits, total, reward}`, limited to one counted visit per user and place every 30 s).

## Other notes

- The emulator requested `data/wasm-jit-modules.zip`, which returns 404. Not mine; just mentioning it.
- The server still serves `.wasm`/`.zip` with the right types and COOP/COEP/CORP on everything, and the gate
  cookie is sent with all same-origin requests (workers included).

# Extra desktop apps (`site/apps/apps.json`)

The desktop (`js/desktop.js`) fetches `apps/apps.json` once at startup (no-cache), and again whenever
`RBDesktop.reloadApps()` is called. A missing file or invalid JSON is ignored. Format: a JSON array (or `{ "apps": [...] }`):

```json
[
  { "id": "minesweeper", "title": "Minesweeper", "icon": "minesweeper/icon.png", "url": "minesweeper/index.html",
    "width": 300, "height": 380, "resizable": false, "startMenuFolder": "Games", "desktopIcon": true }
]
```

- `id`: required. Pattern `[A-Za-z0-9][A-Za-z0-9_-]{0,40}`; the first entry wins if two share an id.
- `url` / `icon`: resolved **relative to apps.json**, so `minesweeper/index.html` means `site/apps/minesweeper/index.html`.
  They must stay on this site; anything off-site is rejected. The icon defaults to a generic app icon (16-32 px PNG/SVG is ideal).
- `width` / `height`: initial window size (default 640x480). `resizable: false` hides the maximize button and the resize handles.
- `startMenuFolder`: put the app in a Start menu submenu with this name. Without it, the app is listed under Programs.
- `desktopIcon: true`: also show a desktop icon.
- Each app opens as one window (singleton) with an iframe to `url`. The window title follows the page's `<title>`, falling back to `title`.
  Users must be logged in to open apps.
- Inside the app page, `<script src="../../js/common.js">` (adjust the depth) gives you `RB.api(...)`, `RB.me()` and `RB.esc()`.
  `RB.desktop()` returns the desktop API: `open(id or "x:"+id, url?)`, `notify(appKey, strong)` (flashes the taskbar button), `theme()`
  (`win95`/`win98`/`winxp`/`win7`/`vaporwave`) and `msgBox({title, text, icon, buttons})`. The theme is also in `localStorage["rbx.theme"]`,
  and a `storage` event fires when it changes.
- All responses are behind the gate and carry COOP/COEP `require-corp`. Same-origin files are fine. Don't load cross-origin
  scripts, images or fonts; vendor them into `site/apps/`.
