"""Builds the per-theme desktop icon sets in site/img/icons/<theme>/<name>.png (32 px) and <name>-16.png (16 px).

Sources (see site/img/icons/CREDITS.md):
  --classic DIR   trapd00r/win95-winxp_icons  "icons" folder (.ico files from Windows 95/98/2000/XP)
  --xp DIR        B00merang-Artwork/Windows-XP checkout (GPL-2.0)
  --seven DIR     B00merang-Artwork/Windows-7 checkout (Win2-7 pack)
Usage: python server/tools/build-icons.py --classic ... --xp ... --seven ...
"""
import argparse, colorsys, os
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "site", "img", "icons")

# name -> (win95, win98, winxp, win7). "c:" = classic .ico, "xp:"/"7:" = theme PNG name.
MAP = {
    "computer": ("c:w95_16", "c:w98_computer_explorer", "c:wxp_16", "7:computer"),
    "ie":       ("c:w98_msie1", "c:w98_msie2", "c:wxp_512", "7:web-browser"),
    "chat":     ("c:w98_users", "c:w98_users", "xp:empathy", "7:empathy"),
    "studio":   ("c:w98_application_hammer_grouppol", "c:w98_application_hammer_grouppol", "c:wxp_210", "7:applications-development"),
    "notepad":  ("c:w98_notepad", "c:w98_notepad", "c:w98_notepad", "7:accessories-text-editor"),
    "recycle":  ("c:w95_32", "c:w98_recycle_bin_empty", "c:wxp_32", "7:user-trash"),
    "folder":   ("c:w95_4", "c:w95_4", "c:wxp_4", "7:folder"),
    "help":     ("c:w95_24", "c:w98_help_book_big", "c:wxp_24", "7:help-browser"),
    "settings": ("c:w98_directory_control_panel", "c:w98_directory_control_panel", "c:wxp_274", "7:preferences-desktop"),
    "theme":    ("c:w98_display_properties", "c:w98_display_properties", "c:wxp_270", "7:preferences-desktop-theme"),
    "logoff":   ("c:w98_key_win", "c:w98_key_win", "xp:system-log-out", "7:system-users"),
    "shutdown": ("c:w98_shut_down_with_computer", "c:w98_shut_down_normal", "xp:system-shutdown", "7:system-shutdown"),
    "fav":      ("c:w2k_internet_document", "c:w2k_internet_document", "c:wxp_176", "7:user-bookmarks"),
    "app":      ("c:w2k_default_application", "c:w2k_default_application", "c:wxp_3", "7:application-x-executable"),
    "start":    ("c:w95_40", "c:w98_windows", "c:w98_windows", "7:start-here"),
    "desktop":  ("c:w98_desktop", "c:w98_desktop", "c:wxp_35", "7:computer"),
}
THEMES = ("win95", "win98", "winxp", "win7")


def ico_frame(path, size):
    im = Image.open(path)
    sizes = sorted(im.info.get("sizes") or [im.size])
    exact = [s for s in sizes if s[0] == size]
    pick = exact[0] if exact else max(sizes, key=lambda s: (s[0] >= size, -abs(s[0] - size)))
    try:
        im.size = pick
    except Exception:
        pass
    im = im.convert("RGBA")
    if im.size[0] != size:
        im = im.resize((size, size), Image.LANCZOS if im.size[0] > size else Image.NEAREST)
    return im


def theme_png(root, name):
    hits = []
    for dp, _, files in os.walk(root):
        if name + ".png" in files:
            p = os.path.join(dp, name + ".png")
            try:
                with Image.open(p) as im:
                    hits.append((im.size[0], p))
            except Exception:
                pass
    if not hits:
        raise FileNotFoundError(f"{name}.png in {root}")
    return max(hits)[1]


def load(spec, size, a):
    kind, name = spec.split(":", 1)
    if kind == "c":
        return ico_frame(os.path.join(a.classic, name + ".ico"), size)
    im = Image.open(theme_png(a.xp if kind == "xp" else a.seven, name)).convert("RGBA")
    im.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    return canvas


def vapor(im):
    """Hue-shift classic icons into pink/cyan for the vaporwave theme."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, al = px[x, y]
            if not al:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            h = (h + 0.55) % 1.0
            s = min(1.0, s * 1.25 + (0.25 if s > 0.05 else 0))
            r2, g2, b2 = colorsys.hsv_to_rgb(h, s, min(1.0, v * 1.05))
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), al)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--classic", required=True)
    ap.add_argument("--xp", required=True)
    ap.add_argument("--seven", required=True)
    a = ap.parse_args()
    for t in THEMES + ("vaporwave",):
        os.makedirs(os.path.join(OUT, t), exist_ok=True)
    for name, specs in MAP.items():
        for theme, spec in zip(THEMES, specs):
            for size, suffix in ((32, ""), (16, "-16")):
                im = load(spec, size, a)
                im.save(os.path.join(OUT, theme, f"{name}{suffix}.png"), optimize=True)
                if theme == "win98":
                    vapor(im.copy()).save(os.path.join(OUT, "vaporwave", f"{name}{suffix}.png"), optimize=True)
    print(f"{len(MAP)} icons x {len(THEMES) + 1} themes -> {OUT}")


if __name__ == "__main__":
    main()
