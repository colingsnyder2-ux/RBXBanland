// RBXBanland avatar renderer (three.js, vendored in vendor/three/).
// Real R6 rig: boxes for torso/limbs with the classic 585x559 shirt/pants template UVs, Roblox head shapes
// (Head / cylinder / block / sphere / file meshes), face and t-shirt decals, and hat meshes placed by their
// AttachmentPoint, all converted from the Novetus library by server/tools/build-models.py.
//
//   RBAvatar.render(el, avatar, items, { scale, angle, still }) -> { update(avatar), setAngle(deg), angle }
//       still: renders a static image (cheap, for lists); otherwise a live view you can drag to spin.
//   RBAvatar.headshot(el, avatar, items, size)   -> head-and-shoulders image (forums, guestbook, menus)
// `items` is RB.items() (needs .byFile[type][file] and .color Map). Without WebGL it falls back to avatar-css.js.
const RBAvatar = (() => {
  const ROOT = new URL("../", document.currentScript ? document.currentScript.src : location.href).href;
  const asset = (p) => new URL(p, ROOT).href;
  const TW = 585, TH = 559;
  // Template tiles [x, y, w, h] in Roblox part space (front = -Z, the character's right = +X).
  const TORSO = { px: [165, 74, 64, 128], nx: [361, 74, 64, 128], py: [231, 8, 128, 64], ny: [231, 204, 128, 64], pz: [427, 74, 128, 128], nz: [231, 74, 128, 128] };
  const RIGHT = { px: [151, 355, 64, 128], nx: [19, 355, 64, 128], py: [217, 289, 64, 64], ny: [217, 485, 64, 64], pz: [85, 355, 64, 128], nz: [217, 355, 64, 128] };
  const LEFT = { px: [506, 355, 64, 128], nx: [374, 355, 64, 128], py: [308, 289, 64, 64], ny: [308, 485, 64, 64], pz: [440, 355, 64, 128], nz: [308, 355, 64, 128] };
  const DEFAULT_FACE = "img/catalog/faces/DefaultFace.png";

  let THREE = null, loading = null, failed = false;
  function loadThree() {
    if (!loading) {
      loading = (async () => {
        const probe = document.createElement("canvas");
        if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) throw new Error("no WebGL");
        THREE = await import(asset("vendor/three/three.module.min.js"));
        return THREE;
      })().catch((e) => { failed = true; throw e; });
    }
    return loading;
  }
  let cssLoading = null;
  function loadCss() {
    if (!cssLoading) {
      cssLoading = new Promise((resolve, reject) => {
        if (window.RBAvatarCSS) return resolve(window.RBAvatarCSS);
        const s = document.createElement("script");
        s.src = asset("js/avatar-css.js");
        s.onload = () => resolve(window.RBAvatarCSS || RBAvatarCSS);
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return cssLoading;
  }

  // ---------- Asset caches ----------
  const imgCache = new Map(), texCache = new Map(), geoCache = new Map();
  function loadImage(url) {
    if (!imgCache.has(url)) {
      imgCache.set(url, new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = asset(url);
      }));
    }
    return imgCache.get(url);
  }
  function loadTexture(url) {
    if (!texCache.has(url)) {
      texCache.set(url, loadImage(url).then((im) => {
        if (!im) return null;
        const t = new THREE.Texture(im);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.anisotropy = 4;
        t.needsUpdate = true;
        return t;
      }));
    }
    return texCache.get(url);
  }
  function loadMesh(url) {
    if (!geoCache.has(url)) {
      geoCache.set(url, fetch(asset(url)).then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => {
        if (!buf) return null;
        const f = new Float32Array(buf);
        const ib = new THREE.InterleavedBuffer(f, 8);
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.InterleavedBufferAttribute(ib, 3, 0));
        g.setAttribute("normal", new THREE.InterleavedBufferAttribute(ib, 3, 3));
        g.setAttribute("uv", new THREE.InterleavedBufferAttribute(ib, 2, 6));
        return g;
      }).catch(() => null));
    }
    return geoCache.get(url);
  }

  // ---------- Geometry helpers ----------
  // A box whose faces sample `tiles` from the clothing template, oriented like Roblox applies them.
  function templateBox(sx, sy, sz, tiles) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const half = [sx / 2, sy / 2, sz / 2];
    for (let i = 0; i < pos.count; i++) {
      const n = [nor.getX(i), nor.getY(i), nor.getZ(i)];
      const p = [pos.getX(i) / half[0] / 2, pos.getY(i) / half[1] / 2, pos.getZ(i) / half[2] / 2]; // -0.5..0.5
      let key, right, up;
      if (n[0] > 0.5) { key = "px"; up = [0, 1, 0]; } else if (n[0] < -0.5) { key = "nx"; up = [0, 1, 0]; }
      else if (n[1] > 0.5) { key = "py"; up = [0, 0, 1]; } else if (n[1] < -0.5) { key = "ny"; up = [0, 0, -1]; }
      else if (n[2] > 0.5) { key = "pz"; up = [0, 1, 0]; } else { key = "nz"; up = [0, 1, 0]; }
      // Viewer outside looking along -n: right = forward x up.
      const f = [-n[0], -n[1], -n[2]];
      right = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
      const s = p[0] * right[0] + p[1] * right[1] + p[2] * right[2] + 0.5;
      const t = 0.5 - (p[0] * up[0] + p[1] * up[1] + p[2] * up[2]);
      const [x, y, w, h] = tiles[key];
      const pad = 0.75;
      uv.setXY(i, (x + pad + s * (w - pad * 2)) / TW, 1 - (y + pad + t * (h - pad * 2)) / TH);
    }
    uv.needsUpdate = true;
    return g;
  }
  function templateBevelBox(sx, sy, sz, tiles) {
    const b = Math.min(0.045, sx * 0.12, sy * 0.12, sz * 0.12);
    const shape = new THREE.Shape();
    shape.moveTo(-sx / 2 + b, -sy / 2);
    shape.lineTo(sx / 2 - b, -sy / 2);
    shape.quadraticCurveTo(sx / 2, -sy / 2, sx / 2, -sy / 2 + b);
    shape.lineTo(sx / 2, sy / 2 - b);
    shape.quadraticCurveTo(sx / 2, sy / 2, sx / 2 - b, sy / 2);
    shape.lineTo(-sx / 2 + b, sy / 2);
    shape.quadraticCurveTo(-sx / 2, sy / 2, -sx / 2, sy / 2 - b);
    shape.lineTo(-sx / 2, -sy / 2 + b);
    shape.quadraticCurveTo(-sx / 2, -sy / 2, -sx / 2 + b, -sy / 2);
    const g = new THREE.ExtrudeGeometry(shape, { depth: sz, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: b, bevelThickness: b });
    g.translate(0, 0, -sz / 2);
    g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const half = [sx / 2, sy / 2, sz / 2];
    for (let i = 0; i < pos.count; i++) {
      const n = [nor.getX(i), nor.getY(i), nor.getZ(i)];
      const p = [pos.getX(i) / half[0] / 2, pos.getY(i) / half[1] / 2, pos.getZ(i) / half[2] / 2];
      let key, up;
      if (Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2])) { key = n[0] > 0 ? "px" : "nx"; up = [0, 1, 0]; }
      else if (Math.abs(n[1]) >= Math.abs(n[2])) { key = n[1] > 0 ? "py" : "ny"; up = [0, 0, n[1] > 0 ? 1 : -1]; }
      else { key = n[2] > 0 ? "pz" : "nz"; up = [0, 1, 0]; }
      const f = [-n[0], -n[1], -n[2]];
      const right = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
      const s = Math.max(0, Math.min(1, p[0] * right[0] + p[1] * right[1] + p[2] * right[2] + 0.5));
      const t = Math.max(0, Math.min(1, 0.5 - (p[0] * up[0] + p[1] * up[1] + p[2] * up[2])));
      const [x, y, w, h] = tiles[key];
      const pad = 0.75;
      uv.setXY(i, (x + pad + s * (w - pad * 2)) / TW, 1 - (y + pad + t * (h - pad * 2)) / TH);
    }
    uv.needsUpdate = true;
    return g;
  }
  // The classic Roblox "Head" mesh: a cylinder with rounded top and bottom edges.
  function headGeometry(d, h, rounded) {
    if (!rounded) return new THREE.CylinderGeometry(d / 2, d / 2, h, 32);
    const r = d / 2, e = Math.min(r, h / 2) * 0.42, pts = [];
    pts.push(new THREE.Vector2(0, -h / 2));
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, -h / 2 + e + Math.sin(a) * e)); }
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, h / 2 - e + Math.sin(a) * e)); }
    pts.push(new THREE.Vector2(0, h / 2));
    const g = new THREE.LatheGeometry(pts, 36);
    g.computeVertexNormals();
    return g;
  }

  function hexOf(items, id, fallback = "#a3a2a5") { return items.color.get(Number(id))?.hex || fallback; }
  const itemOf = (items, type, file) => (file && items.byFile[type]?.[file]) || null;

  // Draws body colour + pants/shirt for one body part into a template-sized canvas (with soft edge shading).
  function partCanvas(color, layers, tiles, res) {
    const c = document.createElement("canvas");
    c.width = Math.round(TW * res); c.height = Math.round(TH * res);
    const g = c.getContext("2d");
    g.scale(res, res);
    g.fillStyle = color;
    g.fillRect(0, 0, TW, TH);
    for (const im of layers) if (im) g.drawImage(im, 0, 0, TW, TH);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  // Builds the character (Roblox space) and returns { group, bounds }.
  async function buildRig(av, items, res = 0.5) {
    av = av || {};
    const colors = av.colors || {};
    const shirt = itemOf(items, "shirt", av.shirt), pants = itemOf(items, "pants", av.pants);
    const tshirt = itemOf(items, "tshirt", av.tshirt), face = itemOf(items, "face", av.face);
    const [shirtIm, pantsIm] = await Promise.all([
      shirt?.tex && !shirt.builtin ? loadImage(shirt.tex) : null,
      pants?.tex && !pants.builtin ? loadImage(pants.tex) : null,
    ]);
    const group = new THREE.Group();
    const mat = (tex) => new THREE.MeshLambertMaterial({ map: tex });
    const part = (size, pos, tiles, color, layers) => {
      const m = new THREE.Mesh(templateBevelBox(size[0], size[1], size[2], tiles), mat(partCanvas(color, layers, tiles, res)));
      m.position.set(...pos);
      group.add(m);
      return m;
    };
    part([2, 2, 1], [0, 0, 0], TORSO, hexOf(items, colors.torso, "#0d69ac"), [pantsIm, shirtIm]);
    part([1, 2, 1], [1.5, 0, 0], RIGHT, hexOf(items, colors.rightArm, "#f5cd30"), [shirtIm]);
    part([1, 2, 1], [-1.5, 0, 0], LEFT, hexOf(items, colors.leftArm, "#f5cd30"), [shirtIm]);
    part([1, 2, 1], [0.5, -2, 0], RIGHT, hexOf(items, colors.rightLeg, "#a4bd47"), [pantsIm]);
    part([1, 2, 1], [-0.5, -2, 0], LEFT, hexOf(items, colors.leftLeg, "#a4bd47"), [pantsIm]);

    // T-shirt decal on the torso front.
    if (tshirt?.tex && !tshirt.builtin) {
      const t = await loadTexture(tshirt.tex);
      if (t) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.05 }));
        d.position.set(0, 0, -0.502);
        d.rotation.y = Math.PI;
        group.add(d);
      }
    }

    // Head (part 2x1x1 at y = 1.5) with its mesh shape.
    const head = new THREE.Group();
    head.position.set(0, 1.5, 0);
    group.add(head);
    const headItem = itemOf(items, "head", av.head || "DefaultHead.rbxm");
    const hm = headItem?.model?.mesh || { type: "head", scale: [1.25, 1.25, 1.25], offset: [0, 0, 0] };
    const headColor = hexOf(items, colors.head, "#f5cd30");
    const hs = hm.scale || [1, 1, 1];
    const dims = [2 * hs[0], 1 * hs[1], 1 * hs[2]];
    let headMesh = null, faceShape = "curved", r = 0.625, hh = 1.25;
    const headMat = new THREE.MeshLambertMaterial({ color: headColor });
    if (hm.type === "block" || hm.type === "brick") {
      headMesh = new THREE.Mesh(new THREE.BoxGeometry(...dims), headMat);
      faceShape = "flat"; hh = dims[1]; r = dims[2] / 2;
    } else if (hm.type === "sphere") {
      headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), headMat);
      headMesh.scale.set(...dims);
      r = dims[2] / 2; hh = dims[1] * 0.8;
    } else if (hm.type === "file" && hm.file) {
      const g = await loadMesh(hm.file);
      if (g) { headMesh = new THREE.Mesh(g, headMat); headMesh.scale.set(...hs); }
      faceShape = null;
    } else {
      const d = Math.min(dims[0], dims[2]);
      headMesh = new THREE.Mesh(headGeometry(d, dims[1], hm.type === "head"), headMat);
      r = d / 2; hh = dims[1];
    }
    if (headMesh) {
      headMesh.position.set(...(hm.offset || [0, 0, 0]));
      head.add(headMesh);
    }
    const faceTex = await loadTexture((face && face.tex) || DEFAULT_FACE);
    if (faceTex && faceShape) {
      const fm = new THREE.MeshLambertMaterial({ map: faceTex, transparent: true, alphaTest: 0.05, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2 });
      let decal;
      if (faceShape === "flat") {
        decal = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(dims[0], hh), hh), fm);
        decal.position.set(0, 0, -r - 0.004);
        decal.rotation.y = Math.PI;
      } else {
        const arc = Math.min(2.1, hh / r);
        decal = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.004, r + 0.004, hh * 0.98, 24, 1, true, Math.PI - arc / 2, arc), fm);
      }
      head.add(decal);
    }

    // Hats: Handle.CFrame = Head.CFrame * CFrame(0, 0.5, 0) * AttachmentPoint:inverse().
    for (const file of (av.hats || []).slice(0, 3)) {
      const it = itemOf(items, "hat", file);
      const model = it?.model;
      if (!model) continue;
      const a = model.attach;
      const ap = new THREE.Matrix4().set(a[3], a[4], a[5], a[0], a[6], a[7], a[8], a[1], a[9], a[10], a[11], a[2], 0, 0, 0, 1);
      const handle = new THREE.Matrix4().makeTranslation(0, 0.5, 0).multiply(ap.clone().invert());
      const ms = model.mesh || {};
      let mesh = null;
      const tex = ms.tex ? await loadTexture(ms.tex) : null;
      if (tex) { tex.flipY = false; tex.needsUpdate = true; }
      const color = ms.vcolor ? new THREE.Color(ms.vcolor[0], ms.vcolor[1], ms.vcolor[2]) : new THREE.Color(tex ? "#ffffff" : hexOf(items, model.color, "#a3a2a5"));
      const m = new THREE.MeshLambertMaterial({ map: tex || null, color, alphaTest: tex ? 0.1 : 0, side: THREE.DoubleSide });
      const sc = ms.scale || [1, 1, 1], sz = model.size || [1, 1, 1];
      if (ms.type === "file" && ms.file) {
        const g = await loadMesh(ms.file);
        if (!g) continue;
        mesh = new THREE.Mesh(g, m);
        mesh.scale.set(...sc);
      } else if (ms.type === "sphere") {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), m);
        mesh.scale.set(sz[0] * sc[0], sz[1] * sc[1], sz[2] * sc[2]);
      } else if (ms.type === "head" || ms.type === "cylinder") {
        mesh = new THREE.Mesh(headGeometry(Math.min(sz[0], sz[2]), sz[1], ms.type === "head"), m);
        mesh.scale.set(sc[0], sc[1], sc[2]);
      } else {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(sz[0] * sc[0], sz[1] * sc[1], sz[2] * sc[2]), m);
      }
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(handle);
      mesh.position.set(...(ms.offset || [0, 0, 0]));
      holder.add(mesh);
      head.add(holder);
    }
    // Face the camera: Roblox's front is -Z, ours is +Z.
    const outer = new THREE.Group();
    group.rotation.y = Math.PI;
    outer.add(group);
    outer.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(outer);
    return { group: outer, bounds };
  }

  function makeScene() {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6d6d78, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 6, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe3ff, 0.5);
    rim.position.set(5, 2, -6);
    scene.add(rim);
    return scene;
  }
  // Frames the body (or just the head) for a camera with the given aspect.
  function frame(camera, bounds, mode, aspect) {
    const center = new THREE.Vector3(), size = new THREE.Vector3();
    if (mode === "head") {
      center.set(0, 1.62, 0);
      size.set(1.85, 1.85, 1.4);
    } else {
      bounds.getCenter(center);
      bounds.getSize(size);
    }
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const needH = Math.max(size.y, size.x / aspect) * 1.08;
    const dist = needH / 2 / Math.tan(fov / 2) + size.z;
    camera.position.set(center.x, center.y + (mode === "head" ? 0.25 : 0.6), center.z + dist);
    camera.lookAt(center);
    camera.near = 0.1; camera.far = dist * 4 + 20;
    camera.updateProjectionMatrix();
  }

  // ---------- Shared offscreen renderer for still images ----------
  let shared = null;
  const stillCache = new Map();
  let queue = Promise.resolve();
  function sharedRenderer() {
    if (!shared) {
      shared = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      shared.outputColorSpace = THREE.SRGBColorSpace;
    }
    return shared;
  }
  function stillImage(av, items, w, h, mode, angle) {
    const key = JSON.stringify([av, w, h, mode, angle]);
    if (!stillCache.has(key)) {
      const job = queue.then(async () => {
        const rig = await buildRig(av, items, mode === "head" ? 0.5 : 0.35);
        const r = sharedRenderer();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        r.setPixelRatio(dpr);
        r.setSize(w, h, false);
        const scene = makeScene();
        rig.group.rotation.y = THREE.MathUtils.degToRad(angle);
        scene.add(rig.group);
        rig.group.updateMatrixWorld(true);
        const camera = new THREE.PerspectiveCamera(mode === "head" ? 26 : 30, w / h);
        frame(camera, new THREE.Box3().setFromObject(rig.group), mode, w / h);
        r.render(scene, camera);
        const url = await new Promise((resolve) => r.domElement.toBlob((b) => resolve(b ? URL.createObjectURL(b) : r.domElement.toDataURL()), "image/png"));
        disposeTree(rig.group);
        return url;
      });
      queue = job.catch(() => {});
      stillCache.set(key, job);
    }
    return stillCache.get(key);
  }
  function disposeTree(obj) {
    obj.traverse((o) => {
      // Cached mesh geometries and image textures are shared between renders; only per-render things are freed.
      if (o.isMesh) {
        if (o.material.map && o.material.map.isCanvasTexture) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  function placeholder(el, w, h) {
    el.classList.add("AvatarStage");
    el.style.width = el.style.width || `${w}px`;
    el.style.height = el.style.height || `${h}px`;
  }

  function stillInto(el, av, items, w, h, mode, angle) {
    placeholder(el, w, h);
    el.classList.add("AvatarStill");
    let token = 0;
    const draw = (a) => {
      const mine = ++token;
      stillImage(a, items, w, h, mode, angle).then((url) => {
        if (mine !== token) return;
        el.innerHTML = `<img alt="" src="${url}" style="width:${w}px;height:${h}px;display:block">`;
      }).catch(() => {});
    };
    draw(av);
    return { update: draw, setAngle() {}, get angle() { return angle; } };
  }

  // ---------- Live (interactive) view ----------
  function liveInto(el, av, items, w, h, angle0) {
    placeholder(el, w, h);
    el.classList.add("Draggable", "AvatarLive");
    el.title = "Drag to spin";
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    el.innerHTML = "";
    el.appendChild(renderer.domElement);
    const scene = makeScene();
    const camera = new THREE.PerspectiveCamera(30, w / h);
    let rig = null, angle = angle0, token = 0, framed = false;
    const draw = () => { if (rig) rig.group.rotation.y = THREE.MathUtils.degToRad(angle); renderer.render(scene, camera); };
    async function update(a) {
      const mine = ++token;
      const next = await buildRig(a, items, 0.6);
      if (mine !== token) { disposeTree(next.group); return; }
      if (rig) { scene.remove(rig.group); disposeTree(rig.group); }
      rig = next;
      scene.add(rig.group);
      // Keep the framing stable while editing (hats would otherwise zoom the camera in and out).
      if (!framed) { frame(camera, rig.bounds, "body", w / h); framed = true; }
      draw();
    }
    let startX = null, startAngle = 0;
    el.addEventListener("pointerdown", (e) => { startX = e.clientX; startAngle = angle; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => { if (startX !== null) { angle = startAngle + (e.clientX - startX) * 0.8; draw(); } });
    const end = () => { startX = null; };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    update(av);
    return { update, setAngle(a) { angle = a; draw(); }, get angle() { return angle; } };
  }

  // Runs `fn` once three.js is ready, or the CSS fallback if WebGL/three.js is unavailable.
  function withThree(el, fn, fallback) {
    let ctrl = null, pending = null, pendingAngle = null;
    const proxy = {
      update(a) { if (ctrl) ctrl.update(a); else pending = a; },
      setAngle(a) { if (ctrl) ctrl.setAngle(a); else pendingAngle = a; },
      get angle() { return ctrl ? ctrl.angle : pendingAngle ?? 0; },
    };
    const run = (c) => {
      ctrl = c;
      if (pending) ctrl.update(pending);
      if (pendingAngle !== null) ctrl.setAngle(pendingAngle);
    };
    (failed ? Promise.reject(new Error("no webgl")) : loadThree())
      .then(() => run(fn()))
      .catch(() => loadCss().then((css) => run(fallback(css))).catch(() => {}));
    return proxy;
  }

  function render(el, avatar, items, opts = {}) {
    const S = opts.scale || 40;
    const w = Math.round(4.6 * S), h = Math.round(6.6 * S);
    const angle = opts.angle ?? -20;
    placeholder(el, w, h);
    return withThree(el,
      () => (opts.still ? stillInto(el, avatar, items, w, h, "body", angle) : liveInto(el, avatar, items, w, h, angle)),
      (css) => css.render(el, avatar, items, opts));
  }

  function headshot(el, avatar, items, size = 64) {
    placeholder(el, size, size);
    return withThree(el,
      () => stillInto(el, avatar, items, size, size, "head", -15),
      (css) => css.render(el, avatar, items, { scale: size / 6.6, angle: -15, still: true }));
  }

  return { render, headshot, _debug: { buildRig, loadThree } };
})();
