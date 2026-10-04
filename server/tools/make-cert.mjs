// Makes a self-signed HTTPS certificate in server/tls/ for this PC's name and LAN addresses, using OpenSSL
// (Git for Windows ships one). Then set "httpsPort": 8443 in server/config.json and restart the server.
// Phones will warn about the certificate once; the Cloudflare tunnel (server/tunnel.mjs) needs no certificate at all.
// Usage: node server/tools/make-cert.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lanAddresses } from "../lib/net.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tls");
const candidates = ["openssl", "C:\\Program Files\\Git\\usr\\bin\\openssl.exe", "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe"];
const openssl = candidates.find((c) => spawnSync(c, ["version"]).status === 0);
if (!openssl) {
  console.error("OpenSSL not found. Install Git for Windows (it includes openssl) or use the Cloudflare tunnel instead.");
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
const san = ["DNS:localhost", `DNS:${os.hostname()}`, "IP:127.0.0.1", ...lanAddresses().map((ip) => `IP:${ip}`)].join(",");
const r = spawnSync(openssl, [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "825",
  "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem"),
  "-subj", "/CN=RBXBanland", "-addext", `subjectAltName=${san}`,
], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`\nWrote ${dir}\\cert.pem and key.pem for ${san}`);
console.log('Now add  "httpsPort": 8443  to server/config.json and restart the server.');
