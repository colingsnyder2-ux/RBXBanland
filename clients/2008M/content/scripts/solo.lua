-- Offline Play Solo for the browser build.
--   RobloxApp_client.exe -script "_G.SoloPlayerName='Name'; dofile('rbxasset://scripts/solo.lua')"
-- Novetus' client exe refuses to open places directly, but Workspace:InsertContent works. The
-- site packages each map twice; map_insert.rbxl has its top-level Workspace re-tagged as a Model
-- (InsertContent skips a Workspace item), and the other services come back as copies we unpack.
-- This runs inside a C call, so no wait() at the top level; use delay()/coroutines instead.

-- Script errors are the only thing this client writes to its log file, so status
-- lines are raised as errors on throwaway threads.
local function status(msg)
	delay(0, function() error("SOLO: " .. msg, 0) end)
end

-- _G.SoloMap == false: the exe already opened the place (server exe), so skip the insert.
local MapUrl = _G.SoloMap
if MapUrl == nil then MapUrl = "rbxasset://../../maps/map_insert.rbxl" end
local PlayerName = _G.SoloPlayerName or "Player"
-- _G.SoloAppearance: the player's avatar (see appearance.lua); its items come in avatar-<user>.zip.
local Appearance = _G.SoloAppearance
pcall(function() dofile("rbxasset://scripts/appearance.lua") end)

local function dress(char)
	if Appearance == nil or _G.RBXApplyAppearance == nil then return end
	local ok, n = pcall(function() return _G.RBXApplyAppearance(char, Appearance) end)
	status("avatar " .. (ok and ("applied " .. tostring(n)) or ("failed: " .. tostring(n))))
end

local LightingProps = {
	"Ambient", "Brightness", "ColorShift_Bottom", "ColorShift_Top", "ShadowColor", "TimeOfDay",
	"GeographicLatitude", "TopAmbientV9", "BottomAmbientV9", "SpotLightV9", "ClearColor",
}

local function moveChildren(from, to)
	for _, child in pairs(from:GetChildren()) do
		pcall(function() child.Parent = to end)
	end
end

local function loadMap()
	if MapUrl == false then
		status("map loaded, workspace=" .. #game.Workspace:GetChildren())
		return
	end
	local ok, items = pcall(function() return game.Workspace:InsertContent(MapUrl) end)
	if not ok or not items then
		status("map insert failed: " .. tostring(items))
		return
	end
	for _, obj in pairs(items) do
		local cls = obj.className
		if cls == "Model" and obj.Name == "Workspace" then
			for _, child in pairs(obj:GetChildren()) do
				if child.className == "Camera" then
					child:Remove()
				else
					child.Parent = game.Workspace
				end
			end
		elseif cls == "Lighting" then
			for _, prop in ipairs(LightingProps) do
				pcall(function() game.Lighting[prop] = obj[prop] end)
			end
			moveChildren(obj, game.Lighting)
		elseif cls == "StarterPack" or cls == "Teams" then
			moveChildren(obj, game:GetService(cls))
		end
		pcall(function() obj:Remove() end)
	end
	status("map loaded, workspace=" .. #game.Workspace:GetChildren())
end

loadMap()
pcall(function() game:GetService("Visit"):SetUploadUrl("") end)
game:GetService("RunService"):Run()

local plr = game.Players:CreateLocalPlayer(0)
plr.Name = PlayerName
plr:LoadCharacter()
dress(plr.Character)
status("player spawned")

-- Respawn loop: Humanoid death -> wait 5s -> new character.
delay(1, function()
	while true do
		wait(0.5)
		local char = plr.Character
		local human = char and char:FindFirstChild("Humanoid")
		if char == nil or char.Parent == nil or human == nil or human.Health <= 0 then
			wait(5)
			plr:LoadCharacter()
			dress(plr.Character)
		end
	end
end)
