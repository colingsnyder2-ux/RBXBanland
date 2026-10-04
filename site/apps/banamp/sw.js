// BanAmp service worker. Serves the user's own dropped audio files back to the page under a same-origin URL
// (apps/banamp/local/<id>), so <audio> can stream them without blob: URLs (the site's CSP only allows 'self' media).
// Files live in Cache Storage, so they survive this worker being stopped. Range requests are supported for seeking.
const CACHE = "banamp-local-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !/\/apps\/banamp\/local\//.test(url.pathname)) return;
  e.respondWith(serve(e.request, url));
});

async function serve(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url.pathname);
  if (!hit) return new Response("not found", { status: 404 });
  const blob = await hit.blob();
  const type = hit.headers.get("Content-Type") || "audio/mpeg";
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store" };
  const range = req.headers.get("Range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    let start = m[1] === "" ? NaN : +m[1], end = m[2] === "" ? NaN : +m[2];
    if (isNaN(start)) { start = Math.max(0, blob.size - end); end = blob.size - 1; }
    if (isNaN(end) || end >= blob.size) end = blob.size - 1;
    if (start >= blob.size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${blob.size}` } });
    return new Response(blob.slice(start, end + 1), {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${blob.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(blob, { status: 200, headers: { ...base, "Content-Length": String(blob.size) } });
}
