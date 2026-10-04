// Cloudflare "quick tunnel": a free, temporary https://<random>.trycloudflare.com address that forwards to this PC.
// https is what phones and friends need for the game (SharedArrayBuffer only works on secure pages).
// Needs cloudflared: winget install --id Cloudflare.cloudflared   (no Cloudflare account required).
// Usage: node server/tunnel.mjs [port]      (the server must already be running on that port)
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 8090);
let token = "";
try { token = JSON.parse(fs.readFileSync(path.join(here, "config.json"), "utf8")).accessToken || ""; } catch { /* first run */ }

const local = process.env.LOCALAPPDATA || "";
const candidates = [
  "cloudflared",
  path.join(local, "Microsoft", "WinGet", "Links", "cloudflared.exe"),
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
];
const exe = candidates.find((c) => { try { return spawnSync(c, ["--version"]).status === 0; } catch { return false; } });
if (!exe) {
  console.log("cloudflared is not installed.\n");
  console.log("Install it (one time), then run this again:");
  console.log("    winget install --id Cloudflare.cloudflared");
  console.log("or download it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
  process.exit(1);
}

console.log(`Starting a Cloudflare quick tunnel to http://localhost:${port} ...`);
const child = spawn(exe, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
let shown = false;
const scan = (buf) => {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !shown) {
    shown = true;
    console.log("\n  Your public RBXBanland address (works on phones, over https):\n");
    console.log(`      ${m[0]}/${token ? `?key=${token}` : ""}\n`);
    console.log("  Share it only with friends. It changes every time the tunnel restarts. Keep this window open.\n");
  }
  if (process.env.TUNNEL_VERBOSE) process.stdout.write(buf);
};
child.stdout.on("data", scan);
child.stderr.on("data", scan);
child.on("exit", (code) => { console.log(`cloudflared exited (${code}).`); process.exit(code || 0); });
process.on("SIGINT", () => child.kill());
