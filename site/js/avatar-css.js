// Fallback (no WebGL) blocky R6 avatar renderer in CSS 3D; avatar.js loads it on demand. Body colours are BrickColor ids; shirts/pants use the classic
// 585x559 clothing template, t-shirts and faces are decals, and hats are shown as billboard icons.
// RBAvatar.render(el, avatar, items, { scale, angle, tilt, still }) -> { update(avatar), setAngle(deg) }
// `items` is RB.items() (needs .byFile[type][file] and .color Map).
const RBAvatarCSS = (() => {
  const TW = 585, TH = 559;
  // Template rects [x, y, w, h] for each face. "left" is the viewer's left (-X), i.e. the character's right side.
  const TORSO = { front: [231, 74, 128, 128], back: [427, 74, 128, 128], left: [165, 74, 64, 128], right: [361, 74, 64, 128],
    top: [231, 8, 128, 64], bottom: [231, 204, 128, 64] };
  const LIMB_R = { front: [217, 355, 64, 128], back: [85, 355, 64, 128], left: [151, 355, 64, 128], right: [19, 355, 64, 128],
    top: [217, 289, 64, 64], bottom: [217, 485, 64, 64] };
  const LIMB_L = { front: [308, 355, 64, 128], back: [440, 355, 64, 128], left: [506, 355, 64, 128], right: [374, 355, 64, 128],
    top: [308, 289, 64, 64], bottom: [308, 485, 64, 64] };
  const SHADE = { front: 0, back: 0.25, left: 0.16, right: 0.16, top: -0.08, bottom: 0.35 };

  function faceStyle(fw, fh, layers, color, shade) {
    const img = [], size = [], pos = [];
    for (const l of layers) {
      img.push(`url('${encodeURI(l.url).replace(/'/g, "%27")}')`);
      if (l.rect) {
        const [sx, sy, sw, sh] = l.rect, kx = fw / sw, ky = fh / sh;
        size.push(`${TW * kx}px ${TH * ky}px`);
        pos.push(`${-sx * kx}px ${-sy * ky}px`);
      } else { size.push("100% 100%"); pos.push("0 0"); }
    }
    const tint = shade >= 0 ? `rgba(0,0,0,${shade})` : `rgba(255,255,255,${-shade})`;
    return `width:${fw}px;height:${fh}px;left:${-fw / 2}px;top:${-fh / 2}px;background-color:${color};` +
      (img.length ? `background-image:${img.join(",")};background-size:${size.join(",")};background-position:${pos.join(",")};background-repeat:no-repeat;` : "") +
      `box-shadow:inset 0 0 0 999px ${tint}, inset 0 0 0 1px rgba(0,0,0,.25);`;
  }

  // A cuboid of w*h*d px centred at (x, y, z). layersFor(dir, fw, fh) returns that face's background layers.
  function box(w, h, d, x, y, z, color, layersFor, extra = "") {
    const dims = { front: [w, h, `translateZ(${d / 2}px)`], back: [w, h, `rotateY(180deg) translateZ(${d / 2}px)`],
      right: [d, h, `rotateY(90deg) translateZ(${w / 2}px)`], left: [d, h, `rotateY(-90deg) translateZ(${w / 2}px)`],
      top: [w, d, `rotateX(90deg) translateZ(${h / 2}px)`], bottom: [w, d, `rotateX(-90deg) translateZ(${h / 2}px)`] };
    let html = `<div class="av-part ${extra}" style="transform:translate3d(${x}px,${y}px,${z}px)">`;
    for (const [dir, [fw, fh, tf]] of Object.entries(dims)) {
      html += `<div class="av-face av-${dir}" style="${faceStyle(fw, fh, layersFor(dir), color, SHADE[dir])}transform:${tf}"></div>`;
    }
    return html + "</div>";
  }

  function render(el, avatar, items, opts = {}) {
    const S = opts.scale || 40;
    let angle = opts.angle ?? -20;
    const tilt = opts.tilt ?? -8;
    el.classList.add("AvatarStage");
    el.style.width = el.style.width || `${4.6 * S}px`;
    el.style.height = el.style.height || `${6.6 * S}px`;
    let current = avatar;

    function draw() {
      const av = current || {};
      const colors = av.colors || {};
      const hex = (id) => items.color.get(Number(id))?.hex || "#a3a2a5";
      // Built-in "No..." items are placeholders, not textures (the default face is the exception).
      const tex = (type, file) => {
        const it = file && items.byFile[type]?.[file];
        return it && (!it.builtin || type === "face") ? it.tex || null : null;
      };
      const icon = (type, file) => (file && items.byFile[type]?.[file]?.icon) || null;
      const shirt = tex("shirt", av.shirt), pants = tex("pants", av.pants), tshirt = tex("tshirt", av.tshirt);
      const face = tex("face", av.face) || "img/catalog/faces/DefaultFace.png";
      const clothes = (rects, withShirt, withPants) => (dir) => {
        const l = [];
        if (withShirt && shirt) l.push({ url: shirt, rect: rects[dir] });
        if (withPants && pants) l.push({ url: pants, rect: rects[dir] });
        return l;
      };
      const torsoLayers = (dir) => {
        const l = clothes(TORSO, true, true)(dir);
        if (dir === "front" && tshirt) l.unshift({ url: tshirt, inset: true });
        return l;
      };
      const H = 1.25 * S;
      let html = `<div class="av-rig" style="transform:translate(${2.3 * S}px,${3.6 * S}px) rotateX(${tilt}deg) rotateY(${angle}deg)">`;
      html += box(2 * S, 2 * S, S, 0, 0, 0, hex(colors.torso), torsoLayers);
      html += box(S, 2 * S, S, -1.5 * S, 0, 0, hex(colors.rightArm), clothes(LIMB_R, true, false));
      html += box(S, 2 * S, S, 1.5 * S, 0, 0, hex(colors.leftArm), clothes(LIMB_L, true, false));
      html += box(S, 2 * S, S, -0.5 * S, 2 * S, 0, hex(colors.rightLeg), clothes(LIMB_R, false, true));
      html += box(S, 2 * S, S, 0.5 * S, 2 * S, 0, hex(colors.leftLeg), clothes(LIMB_L, false, true));
      html += box(H, H, H, 0, -S - H / 2, 0, hex(colors.head), (dir) => (dir === "front" ? [{ url: face }] : []), "av-head");
      (av.hats || []).slice(0, 3).forEach((h, i) => {
        const src = icon("hat", h);
        if (!src) return;
        const dx = [0, -0.12, 0.12][i] * S;
        html += `<img class="av-hat" alt="" src="${encodeURI(src)}" style="width:${2 * S}px;height:${2 * S}px;left:${-S}px;top:${-S}px;` +
          `transform:translate3d(${dx}px,${-2.45 * S}px,${0.2 * S}px) rotateY(${-angle}deg)">`;
      });
      el.innerHTML = html + "</div>";
    }

    function setAngle(a) {
      angle = a;
      const rig = el.querySelector(".av-rig");
      if (!rig) return;
      rig.style.transform = `translate(${2.3 * S}px,${3.6 * S}px) rotateX(${tilt}deg) rotateY(${angle}deg)`;
      for (const h of rig.querySelectorAll(".av-hat")) h.style.transform = h.style.transform.replace(/rotateY\([^)]*\)/, `rotateY(${-angle}deg)`);
    }

    if (!opts.still) {
      el.classList.add("Draggable");
      el.title = "Drag to spin";
      let startX = null, startAngle = 0;
      el.addEventListener("pointerdown", (e) => { startX = e.clientX; startAngle = angle; el.setPointerCapture(e.pointerId); });
      el.addEventListener("pointermove", (e) => { if (startX !== null) setAngle(startAngle + (e.clientX - startX) * 0.8); });
      const end = () => { startX = null; };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    }
    draw();
    return { update(av) { current = av; draw(); }, setAngle, get angle() { return angle; } };
  }

  return { render };
})();
