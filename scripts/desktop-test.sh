#!/bin/bash
# Run a client under desktop BoxedWine with a Lua script, then print the SOLO status lines.
# usage: tools/desktop-test.sh <client> <script.lua> [seconds] [extra BoxedWine args...]
cd "$(dirname "$0")/.."
client=$1; script=$2; secs=${3:-45}; shift 3 2>/dev/null
taskkill //F //IM Boxedwine_console.exe >/dev/null 2>&1; sleep 2
logs="root/home/username/.wine/drive_c/users/username/AppData/Local/Roblox/logs"
mkdir -p "$logs"; marker=$(mktemp); sleep 1
R="$(cygpath -w "$PWD/root")"; Z="$(cygpath -w "$PWD/dl/fs-nognutls.zip")"; S="$(cygpath -w "$PWD")"
MSYS_NO_PATHCONV=1 ./bw-win/Win64/Boxedwine_console.exe -root "$R" -zip "$Z" "$@" -mount_drive "$S" d \
  -w "/home/username/.wine/dosdevices/d:/clients/$client" -resolution 1024x768 \
  /bin/wine RobloxApp_client.exe -script "dofile('rbxasset://scripts/$script')" > "run-$client.log" 2>&1 &
sleep "$secs"
grep -h "SOLO\|Error:" $(find "$logs" -name "*.txt" -newer "$marker") 2>/dev/null | head -20
rm -f "$marker"
