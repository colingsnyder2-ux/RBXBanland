# Icon and theme asset credits

RBXBanland is a private, non-commercial site for a few friends. The desktop icons are period Windows icons.
Each source and its license are listed here. Rebuild them with `server/tools/build-icons.py`.

| Folder | Source | License / notes |
| --- | --- | --- |
| `win95/`, `win98/` | [trapd00r/win95-winxp_icons](https://github.com/trapd00r/win95-winxp_icons): the default icons shipped with Windows 95, 98, 2000 and XP, extracted as .ico | Original Microsoft artwork. The repo has no license file. Used here with the owner's OK for a private friends-only site. |
| `winxp/` | Mostly the same trapd00r set (XP's `shell32` icons). Chat, log off and shut down come from [B00merang-Artwork/Windows-XP](https://github.com/B00merang-Artwork/Windows-XP) (a remake of the YlmfOS XP icon theme) | trapd00r: Microsoft artwork, as above. B00merang Windows-XP: GPL-2.0 (its LICENSE file). |
| `win7/` | [B00merang-Artwork/Windows-7](https://github.com/B00merang-Artwork/Windows-7), "Windows Se7en", a port of the Win2-7 pack from gnome-look.org | Recreations of Microsoft Windows 7 artwork. Distributed by B00merang (their related theme repo is GPL-3.0). |
| `vaporwave/` | The `win98/` icons, hue-shifted by `build-icons.py` | Same as `win98/`. |
| `*.svg` in this folder (`games`, `profile`, `shortcut`, `play`, ...) | Drawn for RBXBanland (`server/tools/make-icons.py`) | Ours. |

Other vendored assets (see each folder's LICENSE):

- `site/vendor/98css/`: [98.css](https://github.com/jdan/98.css) by Jordan Scales, MIT. Includes the "Pixelated MS Sans Serif" webfont shipped with it.
- `site/vendor/xpcss/`: [XP.css](https://github.com/botoxparty/XP.css) by Adam Hammad and Jordan Scales, MIT.
- `site/vendor/7css/`: [7.css](https://github.com/khang-nd/7.css) by Khang Nguyen Duy, MIT.
- `site/vendor/fonts/`: VT323 and Monoton from Google Fonts, SIL Open Font License 1.1 (the `OFL-*.txt` files there).

Windows, Internet Explorer and the Windows logo are trademarks of Microsoft. This site is a fan-made imitation and is not affiliated with Microsoft.
