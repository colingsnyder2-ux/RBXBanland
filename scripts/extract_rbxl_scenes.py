import json
import pathlib
import re
import zipfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "data" / "scenes"
SKY_OUT = OUT / "sky"
ASSET_OUT = OUT / "assets"
MESH_OUT = OUT / "meshes"
COLORS = {v["id"]: v["hex"] for v in json.loads((ROOT / "server/catalog.json").read_text())["colors"]}
# rbxasset:// resolves against the client's content folder; Novetus maps point "../../../shareddata"
# at the Novetus data folder.
CONTENT = ROOT / "clients" / "2008M" / "content"
NOVETUS_DATA = pathlib.Path("C:/Users/colin/OneDrive/Documents/roblox junk/novetus-windows-beta/data")
SKY_FACES = ("Bk", "Dn", "Ft", "Lf", "Rt", "Up")
# The 2008 client's built-in sky, used when a map has no Sky or its textures aren't available.
DEFAULT_SKY = {f.lower(): CONTENT / "sky" / f"null_plainsky512_{f.lower()}.jpg" for f in SKY_FACES}


def asset_file(url):
    """Local file for an rbxasset:// URL, or None."""
    if not url or not url.startswith("rbxasset://"):
        return None
    rel = url[len("rbxasset://"):].replace("\\", "/")
    if rel.startswith("../../../shareddata/"):
        path = NOVETUS_DATA / rel[len("../../../"):]
    else:
        path = CONTENT / rel
    if path.is_file():
        return path
    # Content paths are case-insensitive on Windows.
    if path.parent.is_dir():
        for f in path.parent.iterdir():
            if f.name.lower() == path.name.lower():
                return f
    return None


def publish_sky(files):
    """Copy sky faces next to the scene JSON (the renderer only serves /work/)."""
    SKY_OUT.mkdir(parents=True, exist_ok=True)
    urls = {}
    for face, path in files.items():
        ext = ".png" if path.read_bytes()[:4] == b"\x89PNG" else ".jpg"
        name = f"{path.parent.name}_{path.stem}{ext}".replace(" ", "_")
        target = SKY_OUT / name
        if not target.exists():
            target.write_bytes(path.read_bytes())
        urls[face] = f"/data/scenes/sky/{name}"
    return urls


def publish_asset(path):
    """Expose a map-local image from the scene directory. Never fetch remote assets."""
    ASSET_OUT.mkdir(parents=True, exist_ok=True)
    data = path.read_bytes()
    ext = ".png" if data[:4] == b"\x89PNG" else ".jpg" if data[:2] == b"\xff\xd8" else ".gif" if data[:6] in (b"GIF87a", b"GIF89a") else ".bin"
    name = f"{path.parent.name}_{path.stem}{ext}".replace(" ", "_")
    target = ASSET_OUT / name
    if not target.exists():
        target.write_bytes(data)
    return f"/data/scenes/assets/{name}"


def content_texture(props, texture_name="Texture"):
    names = (texture_name,) if isinstance(texture_name, str) else texture_name
    content = next((child(props, name) for name in names if child(props, name) is not None), None) if props is not None else None
    if content is None:
        return None
    binary = content.find("binary")
    if binary is not None and binary.text:
        return {"data": binary.text}
    url = content.find("url")
    path = asset_file(url.text.strip() if url is not None and url.text else "")
    return {"url": publish_asset(path)} if path is not None else None


def content_path(props, names):
    for name in names:
        content = child(props, name) if props is not None else None
        url = content.find("url") if content is not None else None
        path = asset_file(url.text.strip() if url is not None and url.text else "")
        if path is not None:
            return path
    return None


def clothes(model):
    result = {}
    for item in model.findall("./Item"):
        if item.get("class") not in ("Shirt", "Pants"):
            continue
        texture = content_texture(item.find("Properties"), "ShirtTemplate" if item.get("class") == "Shirt" else "PantsTemplate")
        if texture:
            result["shirt" if item.get("class") == "Shirt" else "pants"] = texture
    body_parts = {"0": "head", "1": "torso", "2": "leftarm", "3": "rightarm", "4": "leftleg", "5": "rightleg",
                  "Head": "head", "Torso": "torso", "LeftArm": "leftarm", "RightArm": "rightarm", "LeftLeg": "leftleg", "RightLeg": "rightleg"}
    for item in model.findall("./Item[@class='CharacterMesh']"):
        props = item.find("Properties")
        body = child(props, "BodyPart") if props is not None else None
        key = body_parts.get(body.text if body is not None and body.text else "")
        if not key:
            continue
        mesh_path = content_path(props, ("MeshContent", "MeshId"))
        result.setdefault("characterMeshes", {})[key] = {
            "mesh": {"type": 5, "scale": [1, 1, 1], "offset": [0, 0, 0], "file": publish_mesh(mesh_path)} if mesh_path else None,
            "texture": content_texture(props, ("OverlayTextureContent", "OverlayTextureId", "BaseTextureContent", "BaseTextureId")),
        }
    return result


def publish_mesh(path):
    """Convert old local version 1 Roblox mesh triangles into a Three.js position buffer."""
    try:
        groups = re.findall(r"\[([^\]]+)\]", path.read_text(errors="ignore"))
        vertices = [float(value) for group in groups[0::3] for value in group.split(",")]
        if not vertices or len(vertices) % 9:
            return None
    except (OSError, ValueError):
        return None
    MESH_OUT.mkdir(parents=True, exist_ok=True)
    name = f"{path.parent.name}_{path.stem}.json".replace(" ", "_")
    target = MESH_OUT / name
    if not target.exists():
        target.write_text(json.dumps(vertices, separators=(",", ":")))
    return f"/data/scenes/meshes/{name}"


def camera_view(cam):
    props = cam.find("Properties")
    cf = child(props, "CoordinateFrame") if props is not None else None
    if cf is None:
        return None
    position = [number(cf, "X"), number(cf, "Y"), number(cf, "Z")]
    if max(abs(v) for v in position) <= 0.01:
        return None
    fov = child(props, "FieldOfView")
    return {
        "p": position,
        "r": [[number(cf, f"R{i}{j}") for j in range(3)] for i in range(3)],
        "fov": float(fov.text) if fov is not None and fov.text else 70.0,
    }


def find_view(root):
    """The camera the place was saved with: a camera named like "Thumbnail" wins, then the
    Workspace's CurrentCamera, then any camera with a real position."""
    cams = [it for it in root.iter("Item") if it.get("class") == "Camera"]
    for cam in cams:
        props = cam.find("Properties")
        name = child(props, "Name") if props is not None else None
        if name is not None and name.text and "thumb" in name.text.lower():
            view = camera_view(cam)
            if view:
                return view, "thumbnail"
    ws = next((it for it in root.iter("Item") if it.get("class") == "Workspace"), None)
    ref = child(ws.find("Properties"), "CurrentCamera") if ws is not None and ws.find("Properties") is not None else None
    if ref is not None and ref.text:
        cam = next((c for c in cams if c.get("referent") == ref.text), None)
        view = camera_view(cam) if cam is not None else None
        if view:
            return view, "current"
    for cam in cams:
        view = camera_view(cam)
        if view:
            return view, "any"
    return None, "fallback"


def find_sky(root):
    for item in root.iter("Item"):
        if item.get("class") != "Sky":
            continue
        props = item.find("Properties")
        files = {}
        for face in SKY_FACES:
            content = child(props, f"Skybox{face}") if props is not None else None
            url = content.find("url") if content is not None else None
            path = asset_file(url.text.strip() if url is not None and url.text else "")
            if path is None:
                break
            files[face.lower()] = path
        if len(files) == len(SKY_FACES):
            return publish_sky(files), "map"
    return publish_sky(DEFAULT_SKY), "default"


def color(props, name, fallback="#ffffff"):
    node = child(props, name) if props is not None else None
    if node is None or not node.text:
        return fallback
    return f"#{int(node.text) & 0xffffff:06x}"


def find_lighting(root):
    item = next((it for it in root.iter("Item") if it.get("class") == "Lighting"), None)
    props = item.find("Properties") if item is not None else None
    time = child(props, "TimeOfDay") if props is not None else None
    return {"ambient": color(props, "Ambient"), "fog": color(props, "FogColor", "#9bc7e8"),
            "fogStart": number(props, "FogStart", 0), "fogEnd": number(props, "FogEnd", 100000),
            "brightness": number(props, "Brightness", 1), "time": time.text if time is not None and time.text else "12:00:00"}

def child(props, name):
    return props.find(f"./*[@name='{name}']")

def number(props, name, fallback=0):
    node = child(props, name) or props.find(f"./{name}")
    return float(node.text) if node is not None and node.text else fallback

def vector(props, name, fallback=(1, 1, 1)):
    node = child(props, name)
    if node is None:
        return list(fallback)
    return [number(node, "X", fallback[0]), number(node, "Y", fallback[1]), number(node, "Z", fallback[2])]

def scene(zip_path):
    with zipfile.ZipFile(zip_path) as archive:
        raw = archive.read("home/username/.wine/drive_c/maps/map.rbxl")
    raw = re.sub(rb"&#(?:x([0-9a-fA-F]+)|([0-9]+));", lambda m: b"" if not (lambda n: n in (9, 10, 13) or 32 <= n <= 55295 or 57344 <= n <= 1114111)(int(m.group(1) or m.group(2), 16 if m.group(1) else 10)) else m.group(0), raw)
    raw = bytes(b for b in raw if b in (9, 10, 13) or b >= 32)
    root = ET.fromstring(raw)
    parents = {child_item: parent for parent in root.iter() for child_item in parent}
    view, view_source = find_view(root)
    sky, sky_source = find_sky(root)
    lighting = find_lighting(root)
    parts = []
    for item in root.iter("Item"):
        if item.get("class") not in ("Part", "WedgePart", "SpawnLocation", "TrussPart", "Terrain"):
            continue
        props = item.find("Properties")
        if props is None:
            continue
        cframe = child(props, "CFrame")
        if cframe is None:
            continue
        pos = [number(cframe, "X"), number(cframe, "Y"), number(cframe, "Z")]
        rot = [[number(cframe, f"R{i}{j}") for j in range(3)] for i in range(3)]
        size = vector(props, "size")
        if min(size) <= 0 or max(size) > 2048:
            continue
        transparency = number(props, "Transparency")
        if transparency >= 1:
            continue
        name_node = child(props, "Name")
        part_name = name_node.text if name_node is not None and name_node.text else ""
        owner = item
        character = False
        clothing = {}
        while owner in parents:
            owner = parents[owner]
            if owner.find("./Item[@class='Humanoid']") is not None:
                character = True
                clothing = clothes(owner)
                break
        brick = child(props, "BrickColor")
        brick_id = int(brick.text) if brick is not None and brick.text else 194
        mesh = item.find("./Item[@class='SpecialMesh']") or item.find("./Item[@class='CylinderMesh']") or item.find("./Item[@class='BlockMesh']")
        mesh_data = None
        if mesh is not None:
            mp = mesh.find("Properties")
            mesh_type = child(mp, "MeshType") if mp is not None else None
            mesh_id = child(mp, "MeshId") if mp is not None else None
            mesh_url = mesh_id.find("url") if mesh_id is not None else None
            mesh_path = asset_file(mesh_url.text.strip() if mesh_url is not None and mesh_url.text else "")
            mesh_data = {"type": int(mesh_type.text) if mesh_type is not None and mesh_type.text else 0,
                         "scale": vector(mp, "Scale") if mp is not None else [1, 1, 1], "offset": vector(mp, "Offset", (0, 0, 0)) if mp is not None else [0, 0, 0],
                         "file": publish_mesh(mesh_path) if mesh_path is not None else None}
        textures = []
        for child_item in item.findall("./Item"):
            if child_item.get("class") not in ("Decal", "Texture"):
                continue
            cp = child_item.find("Properties")
            texture = content_texture(cp)
            if texture:
                face = child(cp, "Face") if cp is not None else None
                texture["face"] = int(face.text) if face is not None and face.text else 5
                if child_item.get("class") == "Texture":
                    texture["tile"] = [number(cp, "StudsPerTileU", 1), number(cp, "StudsPerTileV", 1)]
                textures.append(texture)
        appearance = item.find("./Item[@class='SurfaceAppearance']")
        if appearance is not None:
            texture = content_texture(appearance.find("Properties"), "ColorMap")
            if texture:
                textures.extend({**texture, "face": face} for face in range(6))
        top = int(child(props, "TopSurface").text) if child(props, "TopSurface") is not None and child(props, "TopSurface").text else 0
        parts.append({"p": pos, "r": rot, "s": size, "c": COLORS.get(brick_id, "#a3a2a5"), "name": part_name, "character": character, "clothes": clothing, "surface": top, "stud": top == 3, "t": transparency, "wedge": item.get("class") == "WedgePart", "truss": item.get("class") == "TrussPart", "terrain": item.get("class") == "Terrain", "mesh": mesh_data, "textures": textures})
    important = [q for q in parts if q["mesh"] or q["textures"] or q["character"]]
    structural = sorted((q for q in parts if q not in important), key=lambda q: q["s"][0] * q["s"][1] * q["s"][2], reverse=True)
    return {"parts": (important + structural)[:2500], "view": view, "viewSource": view_source,
            "sky": sky, "skySource": sky_source, "lighting": lighting}

OUT.mkdir(exist_ok=True)
maps = {}
for zip_path in sorted((ROOT / "site" / "data").glob("map-*.zip")):
    map_id = zip_path.stem[4:]
    maps[map_id] = scene(zip_path)
    (OUT / f"{map_id}.json").write_text(json.dumps(maps[map_id], separators=(",", ":")))
print(f"extracted {len(maps)} maps, {sum(len(v['parts']) for v in maps.values())} parts")
for map_id, m in maps.items():
    print(f"  {map_id}: camera={m['viewSource']} sky={m['skySource']}")
