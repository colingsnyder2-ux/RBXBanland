// Loads server/config.json, creating it with a random access token and cookie secret on first run.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = { startingTix: 100, startingRobux: 10, dailyTix: 50, dailyRobux: 5, playTix: 10, playTixPerDay: 5 };

export function newAccessToken() {
  // Short, readable, typeable: four groups of four.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const chars = [...crypto.randomBytes(16)].map((b) => alphabet[b % alphabet.length]).join("");
  return chars.match(/.{4}/g).join("-");
}

export function loadConfig(dir) {
  const file = path.join(dir, "config.json");
  let cfg = {};
  if (fs.existsSync(file)) cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = false, created = false;
  if (!cfg.accessToken) { cfg.accessToken = newAccessToken(); changed = created = true; }
  if (!cfg.secret) { cfg.secret = crypto.randomBytes(32).toString("hex"); changed = true; }
  for (const [k, v] of Object.entries(DEFAULTS)) if (cfg[k] == null) { cfg[k] = v; changed = true; }
  if (changed) fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  return { cfg, created, file };
}
