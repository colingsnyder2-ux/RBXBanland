"""Converts the 3D data of Novetus hats and heads for the website's avatar renderer.

For every hat/head .rbxm it reads the Hat AttachmentPoint, the Handle size and the mesh (SpecialMesh FileMesh /
Head / Sphere, BlockMesh, CylinderMesh), converts Roblox .mesh files (text v1.00/v1.01, binary v2.00) into
site/img/catalog/<folder>/mesh/<name>.bin (Float32 x,y,z, nx,ny,nz, u,v per vertex, triangles, Roblox units and axes),
copies textures (max 256 px) to site/img/catalog/<folder>/mtex/, and adds a "model" object to each catalog item.

Run standalone (updates server/catalog.json in place) or via build-catalog.py.
"""
import json, os, re, struct, sys
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PREFIX = "rbxasset://../../../shareddata/charcustom/"


def num(el, default=0.0):
    try:
        return float(el.text)
    except Exception:
        return default


def vec3(props, name):
    el = props.find(f"./Vector3[@name='{name}']")
    if el is None:
        return None
    return [num(el.find(k)) for k in ("X", "Y", "Z")]


def cframe(props, name):
    el = props.find(f"./CoordinateFrame[@name='{name}']")
    if el is None:
        return None
    keys = ["X", "Y", "Z", "R00", "R01", "R02", "R10", "R11", "R12", "R20", "R21", "R22"]
    return [num(el.find(k), 1.0 if k in ("R00", "R11", "R22") else 0.0) for k in keys]


def content(props, name):
    el = props.find(f"./Content[@name='{name}']")
    if el is None:
        return ""
    u = el.find("url")
    return (u.text or "").strip() if u is not None else ""


def prop(props, tag, name):
    el = props.find(f"./{tag}[@name='{name}']")
    return el.text if el is not None else None


def parse_mesh(path):
    """Returns a flat list of triangle vertices [(x,y,z,nx,ny,nz,u,v), ...] in Roblox units."""
    data = open(path, "rb").read()
    header = data[:13].decode("latin-1")
    if header.startswith("version 1."):
        text = data.decode("latin-1")
        lines = text.split("\n", 2)
        scale = 0.5 if lines[0].strip() == "version 1.00" else 1.0
        nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", lines[2])]
        out = []
        for i in range(0, len(nums) - 8, 9):
            px, py, pz, nx, ny, nz, u, v, _ = nums[i:i + 9]
            out.append((px * scale, py * scale, pz * scale, nx, ny, nz, u, 1 - v))
        return out
    if header.startswith("version 2.00"):
        off = data.index(b"\n") + 1
        hsize, vsize, fsize, nverts, nfaces = struct.unpack_from("<HBBII", data, off)
        off += hsize
        verts = []
        for i in range(nverts):
            px, py, pz, nx, ny, nz, u, v, _ = struct.unpack_from("<9f", data, off + i * vsize)
            verts.append((px, py, pz, nx, ny, nz, u, 1 - v))
        off += nverts * vsize
        out = []
        for i in range(nfaces):
            a, b, c = struct.unpack_from("<3I", data, off + i * fsize)
            out.extend((verts[a], verts[b], verts[c]))
        return out
    raise ValueError(f"unsupported mesh {header!r}")


def local_file(url, char):
    if url.startswith(PREFIX):
        p = os.path.join(char, url[len(PREFIX):].replace("/", os.sep))
        return p if os.path.isfile(p) else None
    return None


def save_tex(src, dst):
    im = Image.open(src).convert("RGBA")
    if max(im.size) > 256:
        im.thumbnail((256, 256), Image.LANCZOS)
    im.save(dst, optimize=True)


def mesh_info(mesh_el, folder, base, char, out_img, stats):
    props = mesh_el.find("Properties")
    cls = mesh_el.get("class")
    info = {"scale": vec3(props, "Scale") or [1, 1, 1], "offset": vec3(props, "Offset") or [0, 0, 0]}
    vc = vec3(props, "VertexColor")
    if vc and vc != [1, 1, 1]:
        info["vcolor"] = vc
    if cls == "BlockMesh":
        info["type"] = "block"
        info["bevel"] = float(prop(props, "float", "Bevel") or 0)
    elif cls == "CylinderMesh":
        info["type"] = "cylinder"
    else:
        mtype = int(prop(props, "token", "MeshType") or 5)
        info["type"] = {0: "head", 1: "torso", 2: "wedge", 3: "sphere", 4: "cylinder", 5: "file", 6: "brick"}.get(mtype, "brick")
    if info["type"] == "file":
        src = local_file(content(props, "MeshId"), char)
        if not src:
            stats["missing_mesh"] += 1
            return None
        try:
            tris = parse_mesh(src)
        except Exception as e:
            print("  mesh error", src, e)
            stats["bad_mesh"] += 1
            return None
        os.makedirs(os.path.join(out_img, folder, "mesh"), exist_ok=True)
        with open(os.path.join(out_img, folder, "mesh", base + ".bin"), "wb") as f:
            f.write(struct.pack(f"<{len(tris) * 8}f", *[c for t in tris for c in t]))
        info["file"] = f"img/catalog/{folder}/mesh/{base}.bin"
        stats["meshes"] += 1
        stats["tris"] += len(tris) // 3
    tex = local_file(content(props, "TextureId"), char)
    if tex:
        os.makedirs(os.path.join(out_img, folder, "mtex"), exist_ok=True)
        save_tex(tex, os.path.join(out_img, folder, "mtex", base + ".png"))
        info["tex"] = f"img/catalog/{folder}/mtex/{base}.png"
    return info


def model_for(item, char, out_img, stats):
    folder = {"hat": "hats", "head": "heads"}.get(item["type"])
    if not folder:
        return None
    path = os.path.join(char, folder, item["file"])
    try:
        root = ET.fromstring(open(path, "rb").read().decode("utf-8-sig", errors="ignore"))
    except Exception as e:
        print("  xml error", path, e)
        return None
    base = item["file"][:-5]
    if item["type"] == "hat":
        hat = root.find("./Item[@class='Hat']") or root.find(".//Item[@class='Accessory']")
        if hat is None:
            return None
        attach = cframe(hat.find("Properties"), "AttachmentPoint") or [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
        handle = None
        for part in hat.iter("Item"):
            if part.get("class") in ("Part", "MeshPart") and prop(part.find("Properties"), "string", "Name") == "Handle":
                handle = part
                break
        if handle is None:
            return None
        hp = handle.find("Properties")
        model = {"attach": attach, "size": vec3(hp, "size") or vec3(hp, "Size") or [1, 1, 1]}
        bc = prop(hp, "int", "BrickColor")
        if bc:
            model["color"] = int(bc)
        mesh_el = next((c for c in handle.findall("Item") if c.get("class") in ("SpecialMesh", "BlockMesh", "CylinderMesh")), None)
        model["mesh"] = mesh_info(mesh_el, folder, base, char, out_img, stats) if mesh_el is not None else {"type": "brick", "scale": [1, 1, 1], "offset": [0, 0, 0]}
        if model["mesh"] is None:
            return None
        return model
    # Heads: the root item is the mesh itself.
    mesh_el = next((c for c in root.iter("Item") if c.get("class") in ("SpecialMesh", "BlockMesh", "CylinderMesh")), None)
    if mesh_el is None:
        return {"mesh": {"type": "head", "scale": [1.25, 1.25, 1.25], "offset": [0, 0, 0]}}
    m = mesh_info(mesh_el, folder, base, char, out_img, stats)
    return {"mesh": m} if m else None


def add_models(items, char, out_img):
    stats = {"meshes": 0, "tris": 0, "missing_mesh": 0, "bad_mesh": 0, "models": 0}
    for item in items:
        item.pop("model", None)
        m = model_for(item, char, out_img, stats)
        if m:
            item["model"] = m
            stats["models"] += 1
    print("models:", stats)
    return items


if __name__ == "__main__":
    novetus = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\colin\OneDrive\Documents\roblox junk\novetus-windows-beta\data"
    cat_path = os.path.join(ROOT, "server", "catalog.json")
    cat = json.load(open(cat_path, encoding="utf-8"))
    add_models(cat["items"], os.path.join(novetus, "shareddata", "charcustom"), os.path.join(ROOT, "site", "img", "catalog"))
    with open(cat_path, "w", encoding="utf-8") as f:
        json.dump(cat, f, indent=0)
