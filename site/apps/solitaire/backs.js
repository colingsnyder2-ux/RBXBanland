// Card backs, drawn here (original designs in the spirit of the Windows 98 deck choices).
const CardBacks = (() => {
  const W = 71, H = 96;
  function frame(draw) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(1, 1, W - 2, H - 2);
    x.fillStyle = "#000";
    x.fillRect(2, 0, W - 4, 1); x.fillRect(2, H - 1, W - 4, 1); x.fillRect(0, 2, 1, H - 4); x.fillRect(W - 1, 2, 1, H - 4);
    x.fillRect(1, 1, 1, 1); x.fillRect(W - 2, 1, 1, 1); x.fillRect(1, H - 2, 1, 1); x.fillRect(W - 2, H - 2, 1, 1);
    x.save();
    x.beginPath(); x.rect(4, 4, W - 8, H - 8); x.clip();
    draw(x, 4, 4, W - 8, H - 8);
    x.restore();
    return c;
  }
  const px = (x, X, Y, c) => { x.fillStyle = c; x.fillRect(X, Y, 1, 1); };
  function weave(a, b) {
    return (x, ox, oy, w, h) => {
      x.fillStyle = a; x.fillRect(ox, oy, w, h);
      for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
        const u = (i + y) % 8, v = (i - y + 800) % 8;
        if (u === 0 || v === 0) px(x, ox + i, oy + y, b);
        else if ((u === 4 && v % 2 === 0) || (v === 4 && u % 2 === 0)) px(x, ox + i, oy + y, b);
      }
    };
  }
  const DESIGNS = [
    { name: "Blue weave", draw: weave("#0000a8", "#5c8cff") },
    { name: "Red weave", draw: weave("#a80000", "#ff6c6c") },
    { name: "Ban hammer", draw: (x, ox, oy, w, h) => {
      x.fillStyle = "#c00000"; x.fillRect(ox, oy, w, h);
      for (let y = 0; y < h; y += 6) for (let i = (y / 6) % 2 ? -6 : 0; i < w; i += 12) { x.fillStyle = "#a00000"; x.fillRect(ox + i, oy + y, 11, 5); }
      x.fillStyle = "#e6e6e6"; x.fillRect(ox + 18, oy + 26, 26, 14); x.fillStyle = "#9a9a9a"; x.fillRect(ox + 18, oy + 37, 26, 3);
      x.fillStyle = "#7a4a1a"; x.fillRect(ox + 29, oy + 40, 5, 34); x.fillStyle = "#4a2a0a"; x.fillRect(ox + 32, oy + 40, 2, 34);
      x.fillStyle = "#fff"; x.font = "bold 9px Arial"; x.textAlign = "center"; x.fillText("BANNED", ox + w / 2, oy + 16);
    } },
    { name: "Bricks", draw: (x, ox, oy, w, h) => {
      x.fillStyle = "#e8e8e8"; x.fillRect(ox, oy, w, h);
      for (let y = 0; y < h; y += 8) for (let i = (y / 8) % 2 ? -8 : 0; i < w; i += 16) {
        x.fillStyle = "#c4281c"; x.fillRect(ox + i, oy + y, 15, 7);
        x.fillStyle = "#e05040"; x.fillRect(ox + i + 3, oy + y + 1, 4, 2); x.fillRect(ox + i + 9, oy + y + 1, 4, 2);
      }
    } },
    { name: "Vaporwave", draw: (x, ox, oy, w, h) => {
      const g = x.createLinearGradient(0, oy, 0, oy + h); g.addColorStop(0, "#2b1055"); g.addColorStop(0.55, "#ff71ce"); g.addColorStop(0.56, "#1a0033"); g.addColorStop(1, "#1a0033");
      x.fillStyle = g; x.fillRect(ox, oy, w, h);
      x.fillStyle = "#fffb96"; x.beginPath(); x.arc(ox + w / 2, oy + h * 0.55, 16, Math.PI, 0); x.fill();
      x.fillStyle = "#2b1055"; for (let k = 0; k < 4; k++) x.fillRect(ox, oy + h * 0.55 - 4 - k * 4, w, 1 + (k > 1));
      x.strokeStyle = "#01cdfe"; x.lineWidth = 1;
      for (let k = 0; k < 6; k++) { const y = oy + h * 0.56 + Math.pow(k / 5, 1.8) * h * 0.44; x.beginPath(); x.moveTo(ox, Math.round(y) + .5); x.lineTo(ox + w, Math.round(y) + .5); x.stroke(); }
      for (let k = -5; k <= 5; k++) { x.beginPath(); x.moveTo(ox + w / 2 + k * 3, oy + h * 0.56); x.lineTo(ox + w / 2 + k * 14, oy + h); x.stroke(); }
    } },
    { name: "Fish", draw: (x, ox, oy, w, h) => {
      const g = x.createLinearGradient(0, oy, 0, oy + h); g.addColorStop(0, "#40c0ff"); g.addColorStop(1, "#0040a0");
      x.fillStyle = g; x.fillRect(ox, oy, w, h);
      const fish = (fx, fy, c, s) => { x.fillStyle = c; x.beginPath(); x.ellipse(fx, fy, 9 * s, 5 * s, 0, 0, 7); x.fill(); x.beginPath(); x.moveTo(fx + 8 * s, fy); x.lineTo(fx + 14 * s, fy - 5 * s); x.lineTo(fx + 14 * s, fy + 5 * s); x.fill(); x.fillStyle = "#000"; x.fillRect(fx - 5 * s, fy - 2 * s, 2, 2); };
      fish(ox + 20, oy + 20, "#ffd000", 1); fish(ox + 40, oy + 46, "#ff7000", 1.2); fish(ox + 18, oy + 70, "#ff40a0", 0.9);
      x.strokeStyle = "rgba(255,255,255,.7)"; for (const [bx, by, r] of [[50, 16, 3], [54, 26, 2], [12, 44, 2], [28, 54, 3]]) { x.beginPath(); x.arc(ox + bx, oy + by, r, 0, 7); x.stroke(); }
      x.fillStyle = "#2e8b57"; for (let i = 0; i < w; i += 6) x.fillRect(ox + i, oy + h - 6 - (i * 7 % 5), 2, 8);
    } },
    { name: "Checkers", draw: (x, ox, oy, w, h) => {
      for (let y = 0; y < h; y += 7) for (let i = 0; i < w; i += 7) { x.fillStyle = ((i + y) / 7) % 2 ? "#008000" : "#00c000"; x.fillRect(ox + i, oy + y, 7, 7); }
    } },
    { name: "Space", draw: (x, ox, oy, w, h) => {
      x.fillStyle = "#000020"; x.fillRect(ox, oy, w, h);
      let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 70; i++) px(x, ox + (rnd() * w) | 0, oy + (rnd() * h) | 0, rnd() > 0.8 ? "#ffff80" : "#ffffff");
      x.fillStyle = "#c08040"; x.beginPath(); x.arc(ox + 40, oy + 56, 13, 0, 7); x.fill();
      x.strokeStyle = "#e0c090"; x.lineWidth = 2; x.beginPath(); x.ellipse(ox + 40, oy + 56, 22, 5, -0.3, 0, 7); x.stroke();
      x.fillStyle = "#e0e0ff"; x.beginPath(); x.arc(ox + 16, oy + 18, 6, 0, 7); x.fill();
    } },
  ];
  const cache = new Map();
  function url(i) {
    i = ((i % DESIGNS.length) + DESIGNS.length) % DESIGNS.length;
    if (!cache.has(i)) cache.set(i, frame(DESIGNS[i].draw).toDataURL());
    return cache.get(i);
  }
  return { url, count: DESIGNS.length, name: (i) => DESIGNS[i].name };
})();
