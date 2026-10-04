import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("C:/Users/colin/rbxweb-tools/pw/node_modules/playwright-core");

const root = "C:/Users/colin/RBXBanland", site = path.join(root, "site"), out = path.join(site, "img/thumbs");
const mapsFile = path.join(site, "data/maps.json"), data = JSON.parse(fs.readFileSync(mapsFile, "utf8"));
const server = http.createServer((req, res) => {
  const file = path.join(site, decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  if (!file.startsWith(site) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": file.endsWith(".js") ? "text/javascript" : "text/html" });
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port, browser = await chromium.launch({ channel: "msedge", args: ["--ignore-gpu-blocklist"] });
fs.mkdirSync(out, { recursive: true });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
for (const map of data.maps) {
  const url = `http://127.0.0.1:${port}/thumb-render.html?id=${encodeURIComponent(map.id)}&name=${encodeURIComponent(map.name)}&hue=${map.hue}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(100);
  const png = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png").split(",")[1]);
  fs.writeFileSync(path.join(out, `${map.id}.png`), Buffer.from(png, "base64"));
  map.thumb = true;
  console.log(`OK ${map.id}`);
}
fs.writeFileSync(mapsFile, `${JSON.stringify(data, null, 1)}\n`);
await browser.close(); server.close();
