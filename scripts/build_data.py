"""Package everything the site needs into web-port/site/data.

  root.zip          WebGL Wine 11 filesystem (BoxedWine v11) minus GnuTLS, roblox.com blocked
  client-2008M.zip  Novetus 2008M client mounted at C:\\roblox (overlay zip)
  maps/<id>.zip     one overlay per map, placed at C:\\roblox\\content\\map.rbxl
  maps.json         catalog for the Games page

Run:  python tools/build_data.py [--skip-root]
"""
import bz2, json, os, re, sys, zipfile, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = os.path.dirname(HERE)
JUNK = "C:/Users/colin/OneDrive/Documents/roblox junk"
NOVETUS = os.path.join(JUNK, "novetus-windows-beta", "data")
WEBGL_FS = "C:/Users/colin/rbxweb-tools/TinyCore15Wine11.0-webgl.zip"
OUT = os.path.join(PORT, "site", "data")

DRIVE_C = "home/username/.wine/drive_c"
CLIENT = "2008M"
MAP_CLIENT = {"2006": "2007M", "2007": "2007M", "2008": "2008M", "2009": "2009E", "2010": "2010L"}
CLIENT_DIR = os.path.join(PORT, "clients", CLIENT)
MAP_YEARS = ("2006", "2007", "2008", "2009", "2010")
SETTINGS_FILE = {"2008M": "GlobalSettings7.xml"}

BLOCKED_HOSTS = ["roblox.com", "www.roblox.com", "api.roblox.com", "assetgame.roblox.com",
                 "clientsettings.api.roblox.com", "setup.roblox.com", "data.roblox.com"]


# Parts of the Linux filesystem Wine never touches when running Roblox: Samba, git, ssh,
# binutils, 7-Zip, headers, docs. Dropping them cuts the first-visit download.
DROP_PREFIXES = (
    "usr/local/bin/", "usr/local/sbin/", "usr/local/include/", "opt/wine/include/",
    "usr/local/lib/p7zip/", "usr/local/lib/libgphoto2", "usr/local/lib/samba/",
    "usr/local/share/doc/", "usr/local/share/man/", "usr/local/share/info/", "usr/local/share/gtk-doc/",
)
DROP_SUBSTRINGS = (
    "libgnutls",  # GnuTLS/nettle asserts inside the emulator during Roblox startup; Wine runs fine without it.
    "libasan", "libubsan", "liblsan", "libtsan", "libgprofng", "libbfd", "libopcodes", "libctf",
    "libsmbclient", "libnetapi", "libsamba", "libgstreamer", "libgst", "gstreamer-1.0/",
)


def build_root():
    dst_path = os.path.join(OUT, "root.zip")
    src = zipfile.ZipFile(WEBGL_FS)
    dst = zipfile.ZipFile(dst_path + ".tmp", "w", zipfile.ZIP_DEFLATED, compresslevel=9)
    dropped = 0
    for info in src.infolist():
        name = info.filename
        if name.startswith(DROP_PREFIXES) or any(s in name for s in DROP_SUBSTRINGS):
            dropped += 1
            continue
        data = src.read(name)
        if name == "etc/hosts":
            data = data.rstrip(b"\n") + b"\n127.0.0.1 " + " ".join(BLOCKED_HOSTS).encode() + b"\n"
        elif name == "home/username/.wine/.update-timestamp":
            # The prefix ships initialized; skip wineboot's update (it stalls on the Mono installer).
            data = b"disable\n"
        dst.writestr(info, data)
    # Graphics settings tuned for emulation (the client reads them from %LOCALAPPDATA%\Roblox).
    # Lives in root.zip: overlay zips don't merge into folders the root already has.
    dst.write(os.path.join(PORT, "scripts", f"GlobalSettings_{CLIENT}.xml"),
              f"{DRIVE_C}/users/username/AppData/Local/Roblox/{SETTINGS_FILE[CLIENT]}")
    dst.close()
    os.replace(dst_path + ".tmp", dst_path)
    print(f"root.zip: dropped {dropped} entries, {os.path.getsize(dst_path) >> 20} MB")


def build_client(client=CLIENT):
    """client-<name>-<hash>.zip: content-hashed name, because zips are cached for a day by browsers."""
    client_dir = os.path.join(PORT, "clients", client)
    files = []
    for base, dirs, fs in os.walk(client_dir):
        for f in fs:
            if f.endswith(".orig") or f == "map.rbxl":
                continue
            full = os.path.join(base, f)
            files.append((full, os.path.relpath(full, client_dir).replace(os.sep, "/")))
    files.sort(key=lambda x: x[1])
    h = hashlib.sha1()
    for full, rel in files:
        h.update(rel.encode()); h.update(open(full, "rb").read())
    name = f"client-{client}-{h.hexdigest()[:8]}.zip"
    dst_path = os.path.join(OUT, name)
    if not os.path.exists(dst_path):
        with zipfile.ZipFile(dst_path + ".tmp", "w", zipfile.ZIP_DEFLATED, compresslevel=9) as dst:
            for full, rel in files:
                dst.write(full, f"{DRIVE_C}/roblox/{rel}")
        os.replace(dst_path + ".tmp", dst_path)
    print(f"{name}: {os.path.getsize(dst_path) >> 20} MB")
    return name


def insertable(rbxl):
    """The player client refuses to open places, but Workspace:InsertContent works. It skips the
    top-level Workspace item, so re-tag it as a Model; solo.lua unpacks it into the real Workspace."""
    return re.sub(rb'(\n\t<Item class=")Workspace(")', rb"\1Model\2", rbxl, count=1)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def build_maps(client_zips):
    # Flat names: the emulator shell writes each overlay into its in-memory FS under the
    # URL name, and it can't create subdirectories there.
    maps_out = OUT
    catalog = []
    for year in MAP_YEARS:
        ydir = os.path.join(NOVETUS, "maps", year)
        for era in sorted(os.listdir(ydir)):
            edir = os.path.join(ydir, era)
            for f in sorted(os.listdir(edir)):
                if not f.endswith(".rbxl.bz2"):
                    continue
                title = f[:-len(".rbxl.bz2")]
                name = title.split(" - ", 1)[1] if " - " in title else title
                desc_file = os.path.join(edir, title + "_desc.txt")
                desc = ""
                if os.path.exists(desc_file):
                    desc = open(desc_file, encoding="utf-8", errors="replace").read().strip()
                rbxl = bz2.decompress(open(os.path.join(edir, f), "rb").read())
                mid = slug(title)
                zpath = os.path.join(maps_out, "map-" + mid + ".zip")
                with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
                    z.writestr(f"{DRIVE_C}/maps/map.rbxl", rbxl)
                    z.writestr(f"{DRIVE_C}/maps/map_insert.rbxl", insertable(rbxl))
                catalog.append({
                    "id": mid, "name": name, "era": era, "year": int(year),
                    "description": desc, "sizeKB": len(rbxl) >> 10,
                    "zipKB": os.path.getsize(zpath) >> 10,
                    # Stable pseudo "visits" and colors so the Games page looks like 2008.
                    "visits": int(hashlib.md5(mid.encode()).hexdigest()[:6], 16) % 900000 + 12000,
                    "hue": int(hashlib.md5(mid.encode()).hexdigest()[6:8], 16) * 360 // 256,
                    "client": MAP_CLIENT[year],
                    "thumb": os.path.exists(os.path.join(PORT, "site", "img", "thumbs", mid + ".png")),
                })
    with open(os.path.join(OUT, "maps.json"), "w", encoding="utf-8") as fp:
        json.dump({"client": CLIENT, "clientZips": client_zips, "maps": catalog}, fp, indent=1)
    print(f"maps: {len(catalog)}")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    if "--skip-root" not in sys.argv:
        build_root()
    zips = {name: build_client(name) for name in ("2007M", "2008M", "2009E", "2010L")}
    build_maps(zips)
