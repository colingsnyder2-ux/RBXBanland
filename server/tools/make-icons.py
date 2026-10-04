"""Writes the desktop's pixel-style SVG icons into site/img/icons/. Usage: python server/tools/make-icons.py"""
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "site", "img", "icons")
H = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges">'
A = ' shape-rendering="auto"'

ICONS = {
    "games": f"""<rect x="3" y="9" width="24" height="18" fill="#c42a2a" stroke="#000"/><rect x="3.5" y="23" width="23" height="3.5" fill="#8d1b1b"/>
<rect x="6" y="5" width="7" height="4" fill="#e95050" stroke="#000"/><rect x="17" y="5" width="7" height="4" fill="#e95050" stroke="#000"/>
<rect x="5" y="11" width="20" height="2" fill="#e95050"/><path d="M17 14 L29 21 L17 28 Z" fill="#3fbf3a" stroke="#000"{A}/>""",
    "profile": """<rect x="2" y="6" width="28" height="21" fill="#fffbe6" stroke="#000"/><rect x="2" y="6" width="28" height="4" fill="#6e99c9" stroke="#000"/>
<rect x="5" y="12" width="10" height="12" fill="#a3c4e8" stroke="#000"/><rect x="7" y="13" width="6" height="5" fill="#f5cd30" stroke="#000"/>
<rect x="6" y="19" width="8" height="5" fill="#0d69ac"/><rect x="17" y="13" width="10" height="2" fill="#333"/><rect x="17" y="17" width="9" height="2" fill="#888"/><rect x="17" y="21" width="7" height="2" fill="#888"/>""",
    "friends": """<rect x="4" y="5" width="9" height="8" fill="#f5cd30" stroke="#000"/><rect x="2" y="14" width="13" height="10" fill="#c42a2a" stroke="#000"/>
<rect x="4" y="24" width="4" height="5" fill="#a4bd47" stroke="#000"/><rect x="9" y="24" width="4" height="5" fill="#a4bd47" stroke="#000"/>
<rect x="19" y="5" width="9" height="8" fill="#f5cd30" stroke="#000"/><rect x="17" y="14" width="13" height="10" fill="#0d69ac" stroke="#000"/>
<rect x="19" y="24" width="4" height="5" fill="#a4bd47" stroke="#000"/><rect x="24" y="24" width="4" height="5" fill="#a4bd47" stroke="#000"/>
<rect x="6" y="8" width="1" height="2" fill="#000"/><rect x="10" y="8" width="1" height="2" fill="#000"/><rect x="21" y="8" width="1" height="2" fill="#000"/><rect x="25" y="8" width="1" height="2" fill="#000"/>""",
    "forums": f"""<rect x="2" y="3" width="20" height="13" fill="#fff" stroke="#000"/><path d="M6 16 L6 21 L11 16 Z" fill="#fff" stroke="#000"{A}/>
<rect x="5" y="6" width="14" height="2" fill="#6e99c9"/><rect x="5" y="10" width="10" height="2" fill="#6e99c9"/>
<rect x="11" y="13" width="19" height="12" fill="#ffffb0" stroke="#000"/><path d="M25 25 L25 30 L20 25 Z" fill="#ffffb0" stroke="#000"{A}/>
<rect x="14" y="16" width="13" height="2" fill="#c08000"/><rect x="14" y="20" width="9" height="2" fill="#c08000"/>""",
    "catalog": """<rect x="9" y="3" width="14" height="14" fill="#222" stroke="#000"/><rect x="9" y="12" width="14" height="3" fill="#c42a2a"/>
<rect x="4" y="17" width="24" height="4" fill="#222" stroke="#000"/><rect x="11" y="4" width="2" height="12" fill="#555"/>
<rect x="15" y="22" width="14" height="8" fill="#3fbf3a" stroke="#000"/><rect x="17" y="24" width="10" height="4" fill="#bff5bb"/><rect x="19" y="25" width="6" height="2" fill="#2b7a27"/>""",
    "avatar": """<rect x="11" y="2" width="10" height="8" fill="#f5cd30" stroke="#000"/><rect x="13" y="5" width="1" height="2" fill="#000"/><rect x="18" y="5" width="1" height="2" fill="#000"/><rect x="14" y="8" width="4" height="1" fill="#000"/>
<rect x="9" y="11" width="14" height="10" fill="#0d69ac" stroke="#000"/><rect x="4" y="11" width="5" height="10" fill="#f5cd30" stroke="#000"/><rect x="23" y="11" width="5" height="10" fill="#f5cd30" stroke="#000"/>
<rect x="9" y="21" width="7" height="9" fill="#a4bd47" stroke="#000"/><rect x="16" y="21" width="7" height="9" fill="#a4bd47" stroke="#000"/>""",
    "guestbook": f"""<rect x="5" y="3" width="21" height="26" fill="#7a2c9e" stroke="#000"/><rect x="5.5" y="3.5" width="3.5" height="25" fill="#4f1a69"/>
<rect x="11" y="7" width="12" height="8" fill="#fffbe6" stroke="#000"/><rect x="13" y="9" width="8" height="1" fill="#000"/><rect x="13" y="12" width="6" height="1" fill="#000"/>
<rect x="12" y="19" width="2" height="2" fill="#ffd200"/><rect x="16" y="18" width="2" height="2" fill="#ffd200"/><rect x="20" y="20" width="2" height="2" fill="#ffd200"/>
<path d="M30 6 L22 26 L20 27 L21 25 Z" fill="#fff" stroke="#000"{A}/>""",
    "settings": f"""<rect x="3" y="4" width="26" height="18" fill="#c0c0c0" stroke="#000"/><rect x="6" y="7" width="20" height="12" fill="#008080" stroke="#404040"/>
<rect x="12" y="22" width="8" height="3" fill="#808080"/><rect x="8" y="25" width="16" height="3" fill="#c0c0c0" stroke="#000"/>
<rect x="15" y="8" width="2" height="2" fill="#ffd200"/><rect x="15" y="16" width="2" height="2" fill="#ffd200"/><rect x="11" y="12" width="2" height="2" fill="#ffd200"/><rect x="19" y="12" width="2" height="2" fill="#ffd200"/>
<circle cx="16" cy="13" r="3.5" fill="#ffd200" stroke="#000"{A}/><circle cx="16" cy="13" r="1.3" fill="#008080"{A}/>""",
    "about": f"""<rect x="5" y="3" width="21" height="26" fill="#0d69ac" stroke="#000"/><rect x="5.5" y="3.5" width="3.5" height="25" fill="#08457a"/>
<rect x="11" y="6" width="12" height="20" fill="#e5f1fd"/><text x="17" y="22" font-family="Georgia,serif" font-size="17" font-weight="bold" text-anchor="middle" fill="#0d69ac"{A}>?</text>""",
    "play": f"""<rect x="2" y="2" width="28" height="28" fill="#c42a2a" stroke="#000"/><rect x="2.5" y="24" width="27" height="5.5" fill="#8d1b1b"/>
<g transform="rotate(14 16 15)"{A}><rect x="9" y="8" width="14" height="14" fill="#fff" stroke="#000"/><rect x="14" y="13" width="4" height="4" fill="#c42a2a"/></g>""",
    "computer": """<rect x="3" y="3" width="22" height="17" fill="#d4d0c8" stroke="#000"/><rect x="6" y="6" width="16" height="11" fill="#008080" stroke="#404040"/>
<rect x="10" y="20" width="8" height="2" fill="#808080"/><rect x="2" y="22" width="26" height="7" fill="#d4d0c8" stroke="#000"/><rect x="18" y="25" width="7" height="1" fill="#404040"/><rect x="5" y="25" width="2" height="1" fill="#3fbf3a"/>
<rect x="8" y="8" width="5" height="4" fill="#ffd200"/><rect x="14" y="10" width="5" height="4" fill="#c42a2a"/>""",
    "recycle": f"""<path d="M8 8 L24 8 L22 29 L10 29 Z" fill="#d4d0c8" stroke="#000"{A}/><rect x="6" y="5" width="20" height="3" fill="#a0a0a0" stroke="#000"/>
<rect x="12" y="11" width="1" height="15" fill="#808080"/><rect x="16" y="11" width="1" height="15" fill="#808080"/><rect x="20" y="11" width="1" height="15" fill="#808080"/>
<rect x="13" y="2" width="6" height="3" fill="none" stroke="#000"/>""",
    "notepad": """<rect x="6" y="3" width="20" height="26" fill="#fff" stroke="#000"/><rect x="6" y="3" width="20" height="4" fill="#6e99c9" stroke="#000"/>
<rect x="9" y="10" width="14" height="1" fill="#000"/><rect x="9" y="13" width="12" height="1" fill="#000"/><rect x="9" y="16" width="14" height="1" fill="#000"/><rect x="9" y="19" width="9" height="1" fill="#000"/><rect x="9" y="22" width="13" height="1" fill="#000"/>""",
    "start": """<rect x="2" y="5" width="13" height="10" fill="#c42a2a"/><rect x="17" y="5" width="13" height="10" fill="#3fbf3a"/><rect x="2" y="17" width="13" height="11" fill="#0d69ac"/><rect x="17" y="17" width="13" height="11" fill="#f5cd30"/>
<rect x="4" y="3" width="4" height="2" fill="#e95050"/><rect x="9" y="3" width="4" height="2" fill="#e95050"/><rect x="19" y="3" width="4" height="2" fill="#6ee06a"/><rect x="24" y="3" width="4" height="2" fill="#6ee06a"/>""",
    "shutdown": f"""<rect x="4" y="4" width="24" height="20" fill="#d4d0c8" stroke="#000"/><rect x="7" y="7" width="18" height="14" fill="#000080"/><rect x="10" y="24" width="12" height="4" fill="#808080" stroke="#000"/>
<circle cx="16" cy="14" r="4" fill="none" stroke="#ff4040" stroke-width="2"{A}/><rect x="15" y="8" width="2" height="6" fill="#ff4040"/>""",
    "logoff": f"""<rect x="6" y="3" width="16" height="26" fill="#c08040" stroke="#000"/><rect x="9" y="6" width="10" height="20" fill="#e0a060"/><rect x="16" y="15" width="2" height="2" fill="#000"/>
<path d="M20 16 L30 16 M26 12 L30 16 L26 20" stroke="#000" stroke-width="2" fill="none"{A}/>""",
    "theme": f"""<rect x="3" y="3" width="26" height="20" fill="#fff" stroke="#000"/><rect x="5" y="5" width="7" height="7" fill="#008080"/><rect x="13" y="5" width="7" height="7" fill="#000080"/><rect x="21" y="5" width="6" height="7" fill="#3a83d6"/>
<rect x="5" y="14" width="22" height="7" fill="#c0c0c0" stroke="#808080"/><path d="M8 29 L24 29 L20 23 L12 23 Z" fill="#808080" stroke="#000"{A}/>""",
    "ie": f"""<circle cx="16" cy="16" r="12" fill="#2f7fd8" stroke="#003a80" stroke-width="1.5"{A}/>
<path d="M9 9 h5 v4 h3 v4 h-4 v5 h-4 v-4 h-2 z M19 8 h5 v3 h-3 v3 h-2 z M20 18 h5 v5 h-4 v-2 h-1 z" fill="#3fbf3a"/>
<ellipse cx="16" cy="16" rx="15" ry="6" fill="none" stroke="#ffd200" stroke-width="2.2" transform="rotate(-25 16 16)"{A}/>""",
    "shortcut": f"""<rect x="4" y="8" width="24" height="18" fill="#c42a2a" stroke="#000"/><rect x="4.5" y="22" width="23" height="3.5" fill="#8d1b1b"/>
<rect x="7" y="4" width="7" height="4" fill="#e95050" stroke="#000"/><rect x="18" y="4" width="7" height="4" fill="#e95050" stroke="#000"/>
<rect x="1" y="19" width="11" height="11" fill="#fff" stroke="#000"/><path d="M4 27 L4 24 Q4 22 7 22 L8 22 L8 20 L11 23 L8 26 L8 24 L7 24 Q6 24 6 25 L6 27 Z" fill="#000"{A}/>""",
    "studio": f"""<rect x="3" y="14" width="18" height="14" fill="#0d69ac" stroke="#000"/><rect x="5" y="11" width="5" height="3" fill="#3d8bd0" stroke="#000"/><rect x="13" y="11" width="5" height="3" fill="#3d8bd0" stroke="#000"/>
<g transform="rotate(40 22 12)"{A}><rect x="20" y="4" width="4" height="22" fill="#a0602a" stroke="#000"/><rect x="14" y="2" width="16" height="6" fill="#9a9a9a" stroke="#000"/></g>""",
    "fav": f"""<rect x="6" y="3" width="20" height="26" fill="#fff" stroke="#000"/><path d="M16 8 L18.5 13.5 L24 14 L20 18 L21 24 L16 21 L11 24 L12 18 L8 14 L13.5 13.5 Z" fill="#ffd200" stroke="#a07000"{A}/>""",
    "chat": f"""<rect x="2" y="4" width="22" height="15" fill="#fff" stroke="#000"/><path d="M6 19 L6 24 L11 19 Z" fill="#fff" stroke="#000"{A}/>
<rect x="5" y="7" width="3" height="2" fill="#c42a2a"/><rect x="9" y="7" width="11" height="2" fill="#000"/><rect x="5" y="11" width="3" height="2" fill="#0d69ac"/><rect x="9" y="11" width="8" height="2" fill="#000"/>
<rect x="5" y="15" width="3" height="2" fill="#3fbf3a"/><rect x="9" y="15" width="9" height="2" fill="#000"/>
<rect x="18" y="14" width="12" height="11" fill="#ffd200" stroke="#000"/><path d="M26 25 L26 29 L22 25 Z" fill="#ffd200" stroke="#000"{A}/><rect x="21" y="18" width="2" height="2" fill="#000"/><rect x="25" y="18" width="2" height="2" fill="#000"/><rect x="21" y="21" width="6" height="1" fill="#000"/>""",
}

os.makedirs(OUT, exist_ok=True)
for name, body in ICONS.items():
    with open(os.path.join(OUT, name + ".svg"), "w", encoding="utf-8") as f:
        f.write(H + body + "</svg>\n")
print(f"{len(ICONS)} icons -> {os.path.normpath(OUT)}")
