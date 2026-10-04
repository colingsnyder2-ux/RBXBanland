-- Applies an RBXBanland avatar to a character, the way Novetus' LoadCharacterNew does.
--   dofile('rbxasset://scripts/appearance.lua')
--   _G.RBXApplyAppearance(character, app)
-- app = { colors = {head, torso, leftArm, rightArm, leftLeg, rightLeg} (BrickColor numbers),
--         hats = {"ArrowHat.rbxm", ...}, tshirt =, shirt =, pants =, face =, head =, extra = }  (charcustom file names)
-- The items live in C:\shareddata\charcustom (overlay zip /data/avatar-<user>.zip); the .rbxm files
-- reference their textures/meshes as rbxasset://../../../shareddata/charcustom/..., which resolves
-- there from C:\roblox\content.
local Path = _G.RBXCharcustomPath or "rbxasset://../../../shareddata/charcustom/"

local function insert(folder, file)
	if file == nil or file == "" then return nil end
	local ok, items = pcall(function() return game.Workspace:InsertContent(Path .. folder .. "/" .. file) end)
	if ok and items then return items[1] end
	return nil
end

local function put(obj, class, parent)
	if obj == nil then return false end
	if obj.className == class then
		obj.Parent = parent
		return true
	end
	pcall(function() obj:Remove() end)
	return false
end

local function replaceChild(part, name, obj)
	local old = part:FindFirstChild(name)
	if old then old:Remove() end
	obj.Parent = part
end

function _G.RBXApplyAppearance(char, app)
	if char == nil or app == nil then return 0 end
	local applied = 0
	local parts = {"Head", "Torso", "Left Arm", "Right Arm", "Left Leg", "Right Leg"}
	local colors = app.colors or {}
	for i, name in ipairs(parts) do
		local part = char:FindFirstChild(name)
		if part and colors[i] then
			pcall(function() part.BrickColor = BrickColor.new(colors[i]) end)
		end
	end
	local head = char:FindFirstChild("Head")
	pcall(function()
		if app.face and app.face ~= "DefaultFace.rbxm" and head then
			local d = insert("faces", app.face)
			if d and d.className == "Decal" then replaceChild(head, "face", d); d.Face = "Front"; applied = applied + 1
			elseif d then d:Remove() end
		end
	end)
	pcall(function()
		if app.head and app.head ~= "DefaultHead.rbxm" and head then
			local m = insert("heads", app.head)
			if m and (m.className == "SpecialMesh" or m.className == "CylinderMesh" or m.className == "BlockMesh") then
				replaceChild(head, "Mesh", m); applied = applied + 1
			elseif m then m:Remove() end
		end
	end)
	for _, hat in ipairs(app.hats or {}) do
		pcall(function()
			if hat ~= "NoHat.rbxm" and put(insert("hats", hat), "Hat", char) then applied = applied + 1 end
		end)
	end
	pcall(function() if app.tshirt and app.tshirt ~= "NoTShirt.rbxm" and put(insert("tshirts", app.tshirt), "ShirtGraphic", char) then applied = applied + 1 end end)
	pcall(function() if app.shirt and app.shirt ~= "NoShirt.rbxm" and put(insert("shirts", app.shirt), "Shirt", char) then applied = applied + 1 end end)
	pcall(function() if app.pants and app.pants ~= "NoPants.rbxm" and put(insert("pants", app.pants), "Pants", char) then applied = applied + 1 end end)
	pcall(function()
		if app.extra and app.extra ~= "NoExtra.rbxm" then
			local item = insert("custom", app.extra)
			if item == nil then return end
			if item.className == "Decal" and head then
				replaceChild(head, "face", item); item.Face = "Front"
			elseif (item.className == "SpecialMesh" or item.className == "CylinderMesh" or item.className == "BlockMesh") and head then
				replaceChild(head, "Mesh", item)
			else
				item.Parent = char
			end
			applied = applied + 1
		end
	end)
	return applied
end
