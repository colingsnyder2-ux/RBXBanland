import json
import pathlib
import re
import zipfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "data" / "scenes"
SKY_OUT = OUT / "sky"
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

def child(props, name):
    return props.find(f"./*[@name='{name}']")

def number(props, name, fallback=0):
    node = child(props, name) or props.find(f"./{name}")
    return float(node.text) if node is not None and node.text else fallback

def vector(props, name):
    node = child(props, name)
    if node is None:
        return [1, 1, 1]
    return [number(node, "X", 1), number(node, "Y", 1), number(node, "Z", 1)]

def scene(zip_path):
    with zipfile.ZipFile(zip_path) as archive:
        raw = archive.read("home/username/.wine/drive_c/maps/map.rbxl")
    raw = re.sub(rb"&#(?:x([0-9a-fA-F]+)|([0-9]+));", lambda m: b"" if not (lambda n: n in (9, 10, 13) or 32 <= n <= 55295 or 57344 <= n <= 1114111)(int(m.group(1) or m.group(2), 16 if m.group(1) else 10)) else m.group(0), raw)
    raw = bytes(b for b in raw if b in (9, 10, 13) or b >= 32)
    root = ET.fromstring(raw)
    parents = {child_item: parent for parent in root.iter() for child_item in parent}
    view, view_source = find_view(root)
    sky, sky_source = find_sky(root)
    parts = []
    for item in root.iter("Item"):
        if item.get("class") not in ("Part", "WedgePart", "SpawnLocation", "TrussPart"):
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
        if min(size) <= 0 or max(size) > 512:
            continue
        transparency = number(props, "Transparency")
        if transparency >= 1:
            continue
        name_node = child(props, "Name")
        part_name = name_node.text if name_node is not None and name_node.text else ""
        owner = item
        character = False
        while owner in parents:
            owner = parents[owner]
            if owner.find("./Item[@class='Humanoid']") is not None:
                character = True
                break
        brick = child(props, "BrickColor")
        brick_id = int(brick.text) if brick is not None and brick.text else 194
        mesh = item.find("./Item[@class='SpecialMesh']") or item.find("./Item[@class='CylinderMesh']") or item.find("./Item[@class='BlockMesh']")
        mesh_data = None
        if mesh is not None:
            mp = mesh.find("Properties")
            mesh_type = child(mp, "MeshType") if mp is not None else None
            mesh_data = {"type": int(mesh_type.text) if mesh_type is not None and mesh_type.text else 0, "scale": vector(mp, "Scale") if mp is not None else [1, 1, 1]}
        texture = None
        for child_item in item.findall("./Item"):
            if child_item.get("class") not in ("Decal", "Texture"):
                continue
            cp = child_item.find("Properties")
            content = child(cp, "Texture") if cp is not None else None
            binary = content.find("binary") if content is not None else None
            if binary is not None and binary.text:
                face = child(cp, "Face") if cp is not None else None
                texture = {"face": int(face.text) if face is not None and face.text else 5, "data": binary.text}
                break
        parts.append({"p": pos, "r": rot, "s": size, "c": COLORS.get(brick_id, "#a3a2a5"), "name": part_name, "character": character, "stud": child(props, "TopSurface").text == "3" if child(props, "TopSurface") is not None else False, "t": transparency, "wedge": item.get("class") == "WedgePart", "mesh": mesh_data, "texture": texture})
    important = [q for q in parts if q["mesh"] or q["texture"] or q["character"]]
    structural = sorted((q for q in parts if q not in important), key=lambda q: q["s"][0] * q["s"][1] * q["s"][2], reverse=True)
    return {"parts": (important + structural)[:2500], "view": view, "viewSource": view_source,
            "sky": sky, "skySource": sky_source}

OUT.mkdir(exist_ok=True)
maps = {}
for zip_path in sorted((ROOT / "site" / "data").glob("map-*.zip")):
    map_id = zip_path.stem[4:]
    maps[map_id] = scene(zip_path)
    (OUT / f"{map_id}.json").write_text(json.dumps(maps[map_id], separators=(",", ":")))
print(f"extracted {len(maps)} maps, {sum(len(v['parts']) for v in maps.values())} parts")
for map_id, m in maps.items():
    print(f"  {map_id}: camera={m['viewSource']} sky={m['skySource']}")
