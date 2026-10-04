import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("C:/Users/colin/rbxweb-tools/pw/node_modules/playwright-core");

const root = "C:/Users/colin/RBXBanland", site = path.join(root, "site"), out = path.join(site, "img/thumbs");
const mapsFile = path.join(site, "data/maps.json"), data = JSON.parse(fs.readFileSync(mapsFile, "utf8"));
await import("node:child_process").then(({ execFileSync }) => execFileSync("python", [path.join(root, "scripts/extract_rbxl_scenes.py")], { stdio: "inherit" }));
const server = http.createServer((req, res) => {
  const request = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = request.startsWith("/work/") ? path.join(root, request) : path.join(site, request);
  if ((!file.startsWith(site) && !file.startsWith(path.join(root, "work"))) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": file.endsWith(".js") ? "text/javascript" : "text/html" });
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port, browser = await chromium.launch({ channel: "msedge", args: ["--ignore-gpu-blocklist"] });
fs.mkdirSync(out, { recursive: true });
for (const map of data.maps) {
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  const url = `http://127.0.0.1:${port}/thumb-render.html?id=${encodeURIComponent(map.id)}&name=${encodeURIComponent(map.name)}&hue=${map.hue}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(100);
  const png = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png").split(",")[1]);
  fs.writeFileSync(path.join(out, `${map.id}.png`), Buffer.from(png, "base64"));
  map.thumb = true;
  await page.close();
  console.log(`OK ${map.id}`);
}
fs.writeFileSync(mapsFile, `${JSON.stringify(data, null, 1)}\n`);
await browser.close(); server.close();
