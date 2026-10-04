# Credits and licenses for site/apps

Everything is served from this site. Nothing is hotlinked at runtime.

## Shared
- `_lib/app.js`, `_lib/win.css`: written for RBXBanland. They handle theme sync with `rbx.theme`, Win9x menus and dialogs, and host-window helpers.

## Program icons (`*/icon.png`)
- Original Windows 98 icons (Microsoft) from Alex Meub's "Windows 98 Icon Viewer", https://win98icons.alexmeub.com/. The user approved period Windows icons for this private site.
  - minesweeper/icon.png: `minesweeper-0`
  - banamp/icon.png: `cd_audio_cd_a-0`
  - paint/icon.png: `paint_old-0`
  - notepad/icon.png: `notepad-1`
  - calculator/icon.png: `calculator-0`
  - solitaire/icon.png: `game_solitaire-0`
  - pipes/icon.png: `monitor_windows`
- skiban/icon.png: drawn for this project.

## Minesweeper
- All art (tiles, digits, LED counters, smiley faces) is drawn in code in `minesweeper/mine.js`. It was traced by eye to match the original Windows 98 Minesweeper (Microsoft). The reference was the sprite sheet in 1j01/98 (https://github.com/1j01/98). No image files were copied.

## Amp
- The player, skin and pixel font are original code and art. The look is a tribute to Winamp 2.x, but no Winamp/Nullsoft assets are used.
- Bundled music in `banamp/music/`. Every track is **CC0 1.0** (public domain dedication) from OpenGameArt.org:
  - `junkala-stage1.ogg`, `junkala-boss-fight.ogg`, `junkala-stage-select.ogg`: Juhani Junkala, "4 Chiptunes (Adventure)", https://opengameart.org/node/74001 (CC0)
  - `mintodog-space-city.mp3`: MintoDog, "Space City", https://opengameart.org/content/space-city (CC0)
  - `omfgdude-chill-lofi.mp3`: omfgdude, "Chill lofi inspired", https://opengameart.org/content/chill-lofi-inspired (CC0)
  - `holizna-retro-soundtrack.ogg`: HoliznaCC0, "Retro Soundtrack" from "Retro Wave (Collection)", https://opengameart.org/content/retro-wave-collection (CC0)
  - `famousworm-dance.mp3`: Sudocolon, "Dance", https://opengameart.org/content/dance-0 (CC0)
  - `sudocolon-plan.mp3`: Sudocolon, "Plan", https://opengameart.org/content/plan (CC0)
  - `sudocolon-vision.mp3`: Sudocolon, "Vision", https://opengameart.org/content/vision (CC0)

## Paint
- `paint/vendor/jspaint/`: tool icons (`tools.png`), option images and cursors from JS Paint by Isaiah Odhner, https://github.com/1j01/jspaint. MIT License, see `paint/vendor/jspaint/LICENSE.txt`. The layout reference was JS Paint's `mspaint-win98-reference.png`.
- All Paint code is original.

## Notepad, Calculator
- Original code. Calculator was laid out against `calculator-reference-screenshot.png` from 1j01/98, used only as a reference.

## Solitaire
- Card faces: `solitaire/vendor/js-solitaire/cards.png`, decoded from `src/sprite.js` of js-solitaire by Radovan Janjic, https://github.com/rjanjic/js-solitaire. MIT License, see `solitaire/vendor/js-solitaire/LICENSE`.
- Card backs are drawn in code (`solitaire/backs.js`). Game code is original.

## Tetris
- Local vendored single-file Tetris source from https://github.com/tetrisjs/tetrisjs.github.io. MIT License, see `tetrisban/LICENSE.txt`.
- RBXBanland supplies the app registration, icon, and English-first default language.

## Hearts
- Local vendored HTML5 Hearts source by Yujian Yao, https://github.com/yyjhao/html5-hearts. BSD-style license, see `heartsban/LICENSE.txt`.
- jQuery and RequireJS remain local copies from the source distribution; GitHub ribbon and analytics removed.
- RBXBanland supplies the app registration and icon.

## 3D Pipes
- `pipes/vendor/pipes/`: "3D Pipes Screensaver" by Isaiah Odhner, https://github.com/1j01/pipes. MIT License, see `pipes/vendor/pipes/LICENSE`. It bundles three.js r98 (MIT, (c) three.js authors) plus OrbitControls and TeapotBufferGeometry from the three.js examples (MIT). The textures in `pipes/images/textures/` come from the same repo.
- `pipes/index.html` is a rewritten host page that uses only local scripts and drops the GitHub ribbon and the CDN.

## Ski
- Original code and pixel sprites by RBXBanland app builder.
- SkiFree (1991, Chris Pirih) is the reference; no SkiFree code or assets are copied.
- Local `main.wasm` and `wasm_exec.js` are the source port's browser build; wrapper/icon by RBXBanland.


## Breakout

- Original code, gameplay, visuals, and vector icon by RBXBanland app builder.
- No external runtime assets or libraries.

## Block

- Original code, gameplay, visuals, and vector icon by RBXBanland app builder.
- No external runtime assets or libraries.

## WordPad

- Original code, UI, editor behavior, and vector icon by RBXBanland app builder.
- No external runtime assets or libraries; document persistence uses browser local storage only.

## Snake

- Original code, gameplay, visuals, and vector icon by RBXBanland app builder.
- No external runtime assets or libraries.

## Buddy

- Original code, UI, conversation text, and vector icon by RBXBanland app builder.
- No external runtime assets, libraries, accounts, or network messaging.

## Pinball

- Local MIT-licensed Space Cadet tribute source by nipunbatra, https://github.com/nipunbatra/pinball.
- Single-file local game; no runtime network dependency. Based on 3D Pinball for Windows - Space Cadet.

## Clippy

- Original code, character art, UI, and vector icon by RBXBanland app builder.
- No external runtime assets or libraries.

