import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("C:/Users/colin/rbxweb-tools/pw/node_modules/playwright-core");

const root = "C:/Users/colin/RBXBanland", site = path.join(root, "site"), out = path.join(site, "img/thumbs");
const mapsFile = path.join(site, "data/maps.json"), data = JSON.parse(fs.readFileSync(mapsFile, "utf8"));
const requested = new Set(process.argv.slice(2));
await import("node:child_process").then(({ execFileSync }) => execFileSync("python", [path.join(root, "scripts/extract_rbxl_scenes.py")], { stdio: "inherit" }));
const server = http.createServer((req, res) => {
  const request = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = request.startsWith("/work/") ? path.join(root, request) : path.join(site, request);
  if ((!file.startsWith(site) && !file.startsWith(path.join(root, "work"))) || !fs.existsSync(file)) return res.writeHead(404).end();
  const types = { ".js": "text/javascript", ".html": "text/html", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" };
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port, browser = await chromium.launch({ channel: "msedge", args: ["--ignore-gpu-blocklist"] });
fs.mkdirSync(out, { recursive: true });
for (const map of data.maps.filter((item) => !requested.size || requested.has(item.id))) {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  const url = `http://127.0.0.1:${port}/thumb-render.html?id=${encodeURIComponent(map.id)}&name=${encodeURIComponent(map.name)}&hue=${map.hue}`;
  await page.goto(url);
  await page.waitForFunction(() => document.title === "done", null, { timeout: 180000 });
  const png = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png").split(",")[1]);
  fs.writeFileSync(path.join(out, `${map.id}.png`), Buffer.from(png, "base64"));
  map.thumb = true;
  console.log(`OK ${map.id}: camera=${await page.evaluate(() => window.cameraUsed)}`);
  await page.close();
}
fs.writeFileSync(mapsFile, `${JSON.stringify(data, null, 1)}\n`);
await browser.close(); server.close();
