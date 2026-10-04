// Network helpers: LAN addresses for the startup banner, the real client IP behind a tunnel,
// and the optional HTTPS listener (needed for SharedArrayBuffer on anything but localhost).
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

// IPv4 addresses other devices on the network can reach (skips loopback/virtual adapters where obvious).
export function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VirtualBox|VMware|WSL|Loopback|docker|vboxnet/i.test(name)) continue;
    for (const a of addrs || []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) out.push(a.address);
  }
  return [...new Set(out)];
}

const isLoopback = (ip) => ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";

// cloudflared (and most local reverse proxies) connect from loopback; trust their client-IP header only then,
// so internet visitors don't all share one rate-limit bucket. Set trustProxy for other setups.
export function clientIp(req, trustProxy) {
  const remote = req.socket.remoteAddress || "?";
  if (isLoopback(remote) && req.headers["cf-connecting-ip"]) return String(req.headers["cf-connecting-ip"]).trim();
  if (trustProxy || isLoopback(remote)) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (fwd) return fwd;
  }
  return remote;
}

// Requests that arrived over https (directly or via a tunnel/proxy) get Secure cookies.
export function isHttps(req) {
  return !!req.socket.encrypted || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

// Optional HTTPS listener: config { "httpsPort": 8443 } plus server/tls/cert.pem + key.pem
// (make them with `node server/tools/make-cert.mjs`). Returns the server or null.
export function startHttps(cfg, here, handler, onListen) {
  if (!cfg.httpsPort) return null;
  const dir = path.join(here, "tls");
  const cert = path.join(dir, "cert.pem"), key = path.join(dir, "key.pem");
  if (!fs.existsSync(cert) || !fs.existsSync(key)) {
    console.log(`httpsPort is set but ${dir}\\cert.pem / key.pem are missing. Run: node server/tools/make-cert.mjs`);
    return null;
  }
  const srv = https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, handler);
  srv.listen(cfg.httpsPort, () => onListen?.(cfg.httpsPort));
  srv.on("error", (e) => console.log("HTTPS listener failed:", e.message));
  return srv;
}

export function printBanner({ port, httpsPort, token, cfgFile, created }) {
  const lan = lanAddresses();
  const line = (s = "") => console.log(s);
  line("");
  line("  RBXBanland is running!");
  line(`  ${created ? "New access token (saved in " : "Access token (from "}${cfgFile}):  ${token}`);
  line("");
  line(`  This PC:        http://localhost:${port}/?key=${token}`);
  for (const ip of lan) line(`  Same Wi-Fi:     http://${ip}:${port}/?key=${token}`);
  if (httpsPort) for (const ip of ["localhost", ...lan]) line(`  HTTPS:          https://${ip}:${httpsPort}/?key=${token}`);
  line("");
  line("  Games need a secure (https) page to run on other devices. For phones and friends outside your");
  line("  network, run the tunnel (start-rbxbanland.bat asks, or: node server/tunnel.mjs). See server/README.md.");
  line("");
}
