import json
import pathlib
import re
import zipfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "work" / "rbxl-scenes"
COLORS = {v["id"]: v["hex"] for v in json.loads((ROOT / "server/catalog.json").read_text())["colors"]}

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
        parts.append({"p": pos, "r": rot, "s": size, "c": COLORS.get(brick_id, "#a3a2a5"), "stud": child(props, "TopSurface").text == "3" if child(props, "TopSurface") is not None else False, "t": transparency, "wedge": item.get("class") == "WedgePart", "mesh": mesh_data, "texture": texture})
    parts.sort(key=lambda q: q["s"][0] * q["s"][1] * q["s"][2], reverse=True)
    return parts[:2500]

OUT.mkdir(exist_ok=True)
maps = {}
for zip_path in sorted((ROOT / "site" / "data").glob("map-*.zip")):
    map_id = zip_path.stem[4:]
    maps[map_id] = scene(zip_path)
    (OUT / f"{map_id}.json").write_text(json.dumps(maps[map_id], separators=(",", ":")))
print(f"extracted {len(maps)} maps, {sum(map(len, maps.values()))} parts")
