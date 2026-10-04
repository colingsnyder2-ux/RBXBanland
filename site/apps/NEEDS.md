# Requests from the apps side (site/apps) to the shell/server owners

All of these are optional. Each app already has a working fallback.

1. **Shell: resize and close API for app windows.**
   - Minesweeper changes size with difficulty. Calculator, BanAmp and small apps also grow while a dialog is open.
   - Today `_lib/app.js` falls back to setting `style.width/height` on the `.window` that wraps `window.frameElement`, and to clicking its `.tb-close` / `.tb-min`.
   - Proposed API: `RBDesktop.resizeApp(frameWindow, clientW, clientH)`, `RBDesktop.closeApp(frameWindow)` and `RBDesktop.minimizeApp(frameWindow)`. Sizes are the iframe client area.
   - Apps call these automatically once they exist.
2. **Shell: `RBDesktop.setWallpaper(dataUrl, "tile" | "center")`.** Paint's "Set As Wallpaper" menu items stay disabled until this exists.
3. **Server: MIME types.**
   - Please add `.ogg` → `audio/ogg`, `.woff2` → `font/woff2` and `.webmanifest`.
   - BanAmp's bundled `.ogg` tracks currently play as `application/octet-stream` (with nosniff). That works in Chromium only because media elements sniff. Firefox/Safari may refuse.
4. **Server/CSP: `media-src`.** The CSP has no `blob:`. BanAmp therefore plays user-dropped files through a service worker (`apps/banamp/sw.js`, scope `apps/banamp/`) that serves them from Cache Storage.
   - If you'd rather not have a service worker, adding `media-src 'self' blob:` would allow a simpler path.
   - The service worker only intercepts `apps/banamp/local/*`.
5. **Vaporwave theme.** The apps style `html[data-os="vaporwave"]` (BanAmp, Solitaire, dialogs). They pick it up automatically when the shell sets that value.
