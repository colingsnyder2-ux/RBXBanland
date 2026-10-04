#!/bin/bash
# Run a client on desktop BoxedWine with the SAME root.zip + overlay zips the browser uses, then print
# the Roblox log's SOLO/error lines. Mirrors play.html (C:\roblox working dir, C:\maps\map.rbxl).
# usage: scripts/emu-run.sh <client> <exe> <mapId|-> <seconds> <args...>
#   e.g. scripts/emu-run.sh 2007M RobloxApp_server.exe 2007m-glass-houses 120 'C:\maps\map.rbxl' -script "dofile('rbxasset://scripts/solo.lua')"
# Extra overlays: OVERLAYS="avatar.zip other.zip" (paths relative to site/data).
cd "$(dirname "$0")/.."
client=$1; exe=$2; map=$3; secs=$4; shift 4
BW="C:/Users/colin/OneDrive/Documents/roblox junk/web-port/bw-win/Win64/Boxedwine_console.exe"
taskkill //F //IM Boxedwine_console.exe >/dev/null 2>&1; sleep 1
czip=$(python -c "import sys;sys.path.insert(0,'scripts');import build_data as b;print(b.build_client('$client'))" | tail -1 | cut -d: -f1)
R="work/emu-root"; rm -rf "$R"; mkdir -p "$R"
zips=(-zip "$(cygpath -w "$PWD/site/data/root.zip")" -zip "$(cygpath -w "$PWD/site/data/$czip")")
[ "$map" != "-" ] && zips+=(-zip "$(cygpath -w "$PWD/site/data/map-$map.zip")")
for o in $OVERLAYS; do zips+=(-zip "$(cygpath -w "$PWD/site/data/$o")"); done
MSYS_NO_PATHCONV=1 "$BW" -root "$(cygpath -w "$PWD/$R")" "${zips[@]}" -nosound \
  -w /home/username/.wine/drive_c/roblox -resolution ${RES:-800x600} /bin/wine "$exe" "$@" > "work/emu-run-$client.log" 2>&1 &
pid=$!
sleep "$secs"
logs="$R/home/username/.wine/drive_c/users/username/AppData/Local/Roblox/logs"
grep -h "SOLO\|Error\|rror:" "$logs"/*.txt 2>/dev/null | grep -v "Errors\.\|PrintPhysicsErrors" | head -30
[ -z "$KEEP" ] && taskkill //F //IM Boxedwine_console.exe >/dev/null 2>&1
exit 0
