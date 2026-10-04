"""Builds the RBXBanland catalog from the Novetus charcustom library.

Copies resized item icons (and clothing templates for the avatar preview) into
site/img/catalog/<type>/ and writes server/catalog.json (items + BrickColors).
Item file names are kept as-is because the in-game loader references them.

Usage: python server/tools/build-catalog.py [path-to-novetus-data]
"""
import hashlib, json, os, re, shutil, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
NOVETUS = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\colin\OneDrive\Documents\roblox junk\novetus-windows-beta\data"
CHAR = os.path.join(NOVETUS, "shareddata", "charcustom")
OUT_IMG = os.path.join(ROOT, "site", "img", "catalog")
OUT_JSON = os.path.join(ROOT, "server", "catalog.json")

TYPES = {"hats": "hat", "faces": "face", "heads": "head", "tshirts": "tshirt", "shirts": "shirt", "pants": "pants", "custom": "extra"}
# Built-in "nothing equipped" / default items: always owned, hidden from the shop.
BUILTIN = {"NoHat.rbxm", "NoShirt.rbxm", "NoPants.rbxm", "NoTShirt.rbxm", "DefaultFace.rbxm", "DefaultHead.rbxm", "NoExtra.rbxm"}
TIX = [10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 250]
ROBUX = [5, 10, 15, 20, 25, 35, 50, 75, 100, 150, 250]


def humanize(base):
    s = base.replace(".png", "").replace("_", " ").replace("-", " ")
    s = re.sub(r"(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Za-z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def price(file):
    h = int(hashlib.md5(file.encode()).hexdigest(), 16)
    roll = h % 100
    if roll < 10:
        return 0, "tix"
    if roll < 70:
        return TIX[(h >> 8) % len(TIX)], "tix"
    return ROBUX[(h >> 16) % len(ROBUX)], "robux"


def read_desc(folder, base):
    for cand in (base + "_desc.txt", base + "_Desc.txt", base + ".txt"):
        p = os.path.join(folder, cand)
        if os.path.isfile(p):
            with open(p, encoding="utf-8", errors="ignore") as f:
                return f.read().strip().strip('"')[:400]
    return ""


def save_icon(src, dst, size=120):
    im = Image.open(src).convert("RGBA")
    if im.width > size or im.height > size:
        im.thumbnail((size, size), Image.LANCZOS)
    im.save(dst, optimize=True)


def main():
    items = []
    for folder_name, typ in TYPES.items():
        folder = os.path.join(CHAR, folder_name)
        out = os.path.join(OUT_IMG, folder_name)
        os.makedirs(out, exist_ok=True)
        for file in sorted(os.listdir(folder), key=str.lower):
            if not file.endswith(".rbxm"):
                continue
            base = file[:-5]
            icon_src = os.path.join(folder, base + ".png")
            item = {"id": f"{folder_name}/{file}", "type": typ, "file": file, "name": humanize(base),
                    "desc": read_desc(folder, base)}
            if os.path.isfile(icon_src):
                save_icon(icon_src, os.path.join(out, base + ".png"), 128 if typ in ("face", "tshirt") else 120)
                item["icon"] = f"img/catalog/{folder_name}/{base}.png"
            # Clothing templates (585x559) for the avatar preview.
            with open(os.path.join(folder, file), encoding="utf-8", errors="ignore") as f:
                xml = f.read()
            if typ in ("shirt", "pants"):
                m = re.search(r"charcustom/" + folder_name + r"/textures/([^<]+\.png)", xml)
                if m and os.path.isfile(os.path.join(folder, "textures", m.group(1))):
                    os.makedirs(os.path.join(out, "tex"), exist_ok=True)
                    shutil.copyfile(os.path.join(folder, "textures", m.group(1)), os.path.join(out, "tex", m.group(1)))
                    item["tex"] = f"img/catalog/{folder_name}/tex/{m.group(1)}"
            elif typ in ("face", "tshirt") and "icon" in item:
                item["tex"] = item["icon"]
            m = re.match(r"(20\d\d)", base)
            if m:
                item["year"] = int(m.group(1))
            if file in BUILTIN:
                item["builtin"] = True
                item["price"], item["currency"] = 0, "tix"
            else:
                item["price"], item["currency"] = price(file)
            items.append(item)

    with open(os.path.join(NOVETUS, "config", "PartColors.json"), encoding="utf-8") as f:
        raw = json.load(f)
    colors = []
    for c in raw:
        g = re.match(r"\[(.*?)\](.*)", c["ColorName"])
        rgb = [int(x) for x in re.findall(r"\d+", c["ColorRGB"])]
        colors.append({"id": int(c["ColorID"]), "name": g.group(2).strip(), "group": g.group(1),
                       "hex": "#%02x%02x%02x" % tuple(rgb[:3])})
    # 3D data (hat/head meshes, attachment points, textures) for the avatar renderer.
    import importlib.util
    spec = importlib.util.spec_from_file_location("build_models", os.path.join(HERE, "build-models.py"))
    bm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bm)
    bm.add_models(items, CHAR, OUT_IMG)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump({"items": items, "colors": colors}, f, indent=0)
    print(f"{len(items)} items, {len(colors)} colors -> {OUT_JSON}")


if __name__ == "__main__":
    main()
