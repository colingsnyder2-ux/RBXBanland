"""Copy the Novetus character items the site sells (server/catalog.json) plus every texture, mesh and
sound they reference into clients/shareddata/charcustom. server/lib/game.mjs packs a player's items
from there into a per-avatar overlay zip (C:\shareddata\charcustom in the emulator).

Run:  python scripts/build_charcustom.py
"""
import json, os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = os.path.dirname(HERE)
SRC = "C:/Users/colin/OneDrive/Documents/roblox junk/novetus-windows-beta/data/shareddata/charcustom"
DST = os.path.join(PORT, "clients", "shareddata", "charcustom")
URL_RE = re.compile(rb"<url>\s*h?rbxasset://[./]*shareddata/charcustom/([^<]+?)\s*</url>")
# Items every avatar can fall back to.
ALWAYS = ["hats/NoHat.rbxm", "faces/DefaultFace.rbxm", "heads/DefaultHead.rbxm", "shirts/NoShirt.rbxm",
          "pants/NoPants.rbxm", "tshirts/NoTShirt.rbxm", "custom/NoExtra.rbxm"]
# Broken references in Novetus' library: missing file -> the file that has the right picture.
ALIASES = {"faces/Slickface.png": "faces/Slickfang.png"}


def deps(rel):
    data = open(os.path.join(SRC, rel), "rb").read()
    return sorted({m.group(1).decode("utf-8", "replace").replace("//", "/") for m in URL_RE.finditer(data)})


def main():
    catalog = json.load(open(os.path.join(PORT, "server", "catalog.json"), encoding="utf-8"))
    wanted = set(ALWAYS) | {i["id"] for i in catalog["items"]}
    copied = missing = 0
    files = set()
    for rel in sorted(wanted):
        if not os.path.exists(os.path.join(SRC, rel)):
            print("missing item", rel); missing += 1; continue
        files.add(rel)
        for d in deps(rel):
            if os.path.exists(os.path.join(SRC, ALIASES.get(d, d))):
                files.add(d)
            else:
                print("missing dep", rel, "->", d); missing += 1
    size = 0
    for rel in sorted(files):
        s, d = os.path.join(SRC, ALIASES.get(rel, rel)), os.path.join(DST, rel)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        if not os.path.exists(d) or os.path.getsize(d) != os.path.getsize(s):
            shutil.copyfile(s, d); copied += 1
        size += os.path.getsize(s)
    print(f"charcustom: {len(files)} files ({size >> 20} MB), {copied} copied, {missing} missing")


if __name__ == "__main__":
    main()
