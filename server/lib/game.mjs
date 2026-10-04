// Game-side routes (owned by the game agent):
//   GET /data/avatar-<username>.zip   overlay zip with that player's character items (+ textures/meshes/sounds)
//                                     at C:\shareddata\charcustom, built on the fly from clients/shareddata.
//   GET /data/avatars-all.zip         the same for every account (multiplayer: everyone sees everyone's hats).
// Items come from clients/shareddata/charcustom (scripts/build_charcustom.py copies them from Novetus).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { DEFAULT_AVATAR } from "./api.mjs";

const DRIVE_C = "home/username/.wine/drive_c";
const URL_RE = /<url>\s*h?rbxasset:\/\/[./]*shareddata\/charcustom\/([^<]+?)\s*<\/url>/g;

// ---------- minimal ZIP writer (deflate, no directories entries needed by BoxedWine) ----------
export function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = zlib.deflateRawSync(data, { level: 6 });
    const useDeflate = comp.length < data.length;
    const body = useDeflate ? comp : data;
    const crc = zlib.crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(useDeflate ? 8 : 0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(useDeflate ? 8 : 0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, body);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export function createGame({ db, root }) {
  const charDir = path.join(root, "..", "clients", "shareddata", "charcustom");
  const depCache = new Map();
  const zipCache = new Map();

  function avatarOf(u) {
    try { return u && u.avatar ? { ...structuredClone(DEFAULT_AVATAR), ...JSON.parse(u.avatar) } : structuredClone(DEFAULT_AVATAR); }
    catch { return structuredClone(DEFAULT_AVATAR); }
  }

  function itemFiles(av) {
    const ids = [
      ...(av.hats || []).map((h) => "hats/" + h), "faces/" + av.face, "heads/" + av.head, "shirts/" + av.shirt,
      "pants/" + av.pants, "tshirts/" + av.tshirt, "custom/" + (av.extra || "NoExtra.rbxm"),
      // Novetus' fallbacks ("NoHat.rbxm" etc.) so the Lua side can always insert something harmless.
      "hats/NoHat.rbxm", "faces/DefaultFace.rbxm", "heads/DefaultHead.rbxm",
    ];
    return ids;
  }

  // An item plus everything it references under shareddata/charcustom.
  function withDeps(rel, out) {
    if (out.has(rel) || !/^[A-Za-z0-9_][A-Za-z0-9_ .,'()&+-]*(\/[A-Za-z0-9_ .,'()&+-]+)*$/.test(rel) || rel.includes("..")) return;
    const file = path.join(charDir, rel);
    if (!fs.existsSync(file)) return;
    out.add(rel);
    if (!rel.endsWith(".rbxm")) return;
    let deps = depCache.get(rel);
    if (!deps) {
      const xml = fs.readFileSync(file, "latin1");
      deps = [...xml.matchAll(URL_RE)].map((m) => m[1].replace(/\/\/+/g, "/"));
      depCache.set(rel, deps);
    }
    for (const d of deps) withDeps(d, out);
  }

  function zipFor(avatars) {
    const key = avatars.map((av) => JSON.stringify(av)).join("|");
    const cached = zipCache.get(key);
    if (cached) return cached;
    const files = new Set();
    for (const av of avatars) for (const id of itemFiles(av)) withDeps(id, files);
    const entries = [...files].sort().map((rel) => ({
      name: `${DRIVE_C}/shareddata/charcustom/${rel}`, data: fs.readFileSync(path.join(charDir, rel)),
    }));
    const zip = makeZip(entries);
    zipCache.set(key, zip);
    return zip;
  }

  function sendZip(req, res, buf) {
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": buf.length, "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : buf);
  }

  // Returns true when the request was handled.
  return function handle(req, res, urlPath) {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    let m = /^\/data\/avatar-([A-Za-z0-9_]{1,20})\.zip$/.exec(urlPath);
    if (m) {
      const u = db.prepare("SELECT avatar FROM users WHERE username = ?").get(m[1]);
      sendZip(req, res, zipFor([avatarOf(u)])); // unknown users (guests) get the default look
      return true;
    }
    if (urlPath === "/data/avatars-all.zip") {
      const rows = db.prepare("SELECT avatar FROM users").all();
      sendZip(req, res, zipFor([structuredClone(DEFAULT_AVATAR), ...rows.map(avatarOf)]));
      return true;
    }
    return false;
  };
}
