// RBXBanland server: access-token gate, JSON API (node:sqlite) and the static site.
// Every response carries COOP/COEP/CORP so the emulator gets SharedArrayBuffer, and .wasm/.zip get the right types.
// Usage: node server.mjs [port]      (see README.md)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./lib/config.mjs";
import { openDb } from "./lib/db.mjs";
import { createApi } from "./lib/api.mjs";
import { gatePage } from "./lib/gate.mjs";
import { createGame } from "./lib/game.mjs";
import { hmac, safeEqual, sha256, parseCookies, cookie, RateLimiter } from "./lib/auth.mjs";
import { clientIp as netClientIp, startHttps, printBanner } from "./lib/net.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "site");
const { cfg, created, file: cfgFile } = loadConfig(here);
const port = Number(process.argv[2] || process.env.PORT || cfg.port || 8080);
// RBX_DATA_DIR lets tests use a throwaway database; the real one lives in server/data.
const db = openDb(process.env.RBX_DATA_DIR ? path.resolve(process.env.RBX_DATA_DIR) : path.join(here, "data"));
const catalog = JSON.parse(fs.readFileSync(path.join(here, "catalog.json"), "utf8"));
const places = new Map(JSON.parse(fs.readFileSync(path.join(root, "data", "maps.json"), "utf8")).maps.map((m) => [m.id, m]));
const secure = !!cfg.secureCookies;
const api = createApi({ db, cfg, catalog, places, secure });
const game = createGame({ db, root }); // game agent: avatar overlay zips, multiplayer servers

const GATE_COOKIE = "rbxgate";
const gateValue = hmac(cfg.secret, "gate:" + cfg.accessToken);
const gateLimiter = new RateLimiter(10, 15 * 60000);

const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".zip": "application/zip", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
  ".wav": "audio/wav", ".mp3": "audio/mpeg",
};
// A CSP for our own pages. The emulator (emu*/) and the game page are left alone so they can use workers/wasm freely.
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
  "connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'; object-src 'none'";

function baseHeaders(res) {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
}

function clientIp(req) {
  return netClientIp(req, cfg.trustProxy);
}

function safeNext(n) {
  n = String(n || "/");
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

function readForm(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 4096) req.destroy(); });
    req.on("end", () => resolve(new URLSearchParams(data)));
    req.on("error", () => resolve(new URLSearchParams()));
  });
}

function sendGate(res, status, opts) {
  const body = gatePage(opts);
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": CSP });
  res.end(body);
}

function grantGate(res, next) {
  res.writeHead(303, {
    "Set-Cookie": cookie(GATE_COOKIE, gateValue, { maxAge: 180 * 86400, secure }),
    Location: safeNext(next), "Cache-Control": "no-store",
  });
  res.end();
}

function sessionUser(cookies) {
  const tok = cookies.rbxsess;
  if (!tok) return { user: null, sessionHash: null };
  const h = sha256(tok);
  const user = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(h, Date.now());
  return { user: user || null, sessionHash: user ? h : null };
}

function serveStatic(req, res, urlPath) {
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const file = path.join(root, path.normalize(urlPath));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }).end("not found"); return; }
    const ext = path.extname(file).toLowerCase();
    const rel = path.relative(root, file).replace(/\\/g, "/");
    const cache = ext === ".zip" || ext === ".wasm" || rel.startsWith("img/catalog/") ? "private, max-age=86400" : "no-cache";
    const headers = {
      "Content-Type": types[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": cache,
      "Last-Modified": st.mtime.toUTCString(),
    };
    if (ext === ".html" && !/^emu/.test(rel) && rel !== "play.html") headers["Content-Security-Policy"] = CSP;
    const ims = Date.parse(req.headers["if-modified-since"] || "");
    if (ims && ims >= Math.floor(st.mtimeMs / 1000) * 1000) { res.writeHead(304, { "Cache-Control": cache }).end(); return; }
    res.writeHead(200, headers);
    if (req.method === "HEAD") { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}

async function handler(req, res) {
  baseHeaders(res);
  let url, urlPath;
  try {
    url = new URL(req.url, "http://x");
    urlPath = decodeURIComponent(url.pathname);
  } catch { res.writeHead(400).end(); return; }
  const cookies = parseCookies(req.headers.cookie);
  const ip = clientIp(req);
  const gated = safeEqual(cookies[GATE_COOKIE] || "", gateValue);

  // ---- Gate ----
  if (urlPath === "/__gate" && req.method === "POST") {
    const form = await readForm(req);
    const next = safeNext(form.get("next"));
    if (gateLimiter.blocked(ip)) return sendGate(res, 429, { next, error: "Too many tries. Wait a few minutes and try again." });
    if (safeEqual(String(form.get("token") || "").trim(), cfg.accessToken)) { gateLimiter.reset(ip); return grantGate(res, next); }
    gateLimiter.hit(ip);
    return sendGate(res, 401, { next, error: "The password you typed is incorrect." });
  }
  // Shareable link: /?key=TOKEN sets the cookie and strips the key from the address bar.
  if (req.method === "GET" && url.searchParams.has("key")) {
    if (!gateLimiter.blocked(ip) && safeEqual(url.searchParams.get("key").trim(), cfg.accessToken)) {
      url.searchParams.delete("key");
      return grantGate(res, url.pathname + url.search);
    }
    gateLimiter.hit(ip);
  }
  if (!gated) {
    const wantsHtml = /text\/html/.test(req.headers.accept || "") || urlPath.endsWith("/") || urlPath.endsWith(".html");
    if (wantsHtml && req.method === "GET") return sendGate(res, 401, { next: safeNext(url.pathname + url.search) });
    res.writeHead(401, { "Content-Type": "text/plain", "Cache-Control": "no-store" }).end("RBXBanland: access token required");
    return;
  }

  // ---- API ----
  if (urlPath.startsWith("/api/")) {
    const { user, sessionHash } = sessionUser(cookies);
    return api({ req, res, url, user, sessionHash, ip });
  }
  if (game(req, res, urlPath)) return;
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
  serveStatic(req, res, urlPath);
}

const server = http.createServer(handler);
// Listens on every interface (LAN included). Optional HTTPS listener: see lib/net.mjs and README.md.
const httpsPort = Number(process.env.RBX_HTTPS_PORT || cfg.httpsPort || 0);
server.listen(port, () => {
  printBanner({ port, httpsPort, token: cfg.accessToken, cfgFile, created });
});
startHttps({ ...cfg, httpsPort }, here, handler);
