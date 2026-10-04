// RBXChat: IRC-style channels with live delivery over Server-Sent Events (GET /api/chat/stream) and JSON POSTs.
// History lives in SQLite (last HISTORY messages per channel). Presence = users with an open stream.
import { RateLimiter } from "./auth.mjs";

const HISTORY = 200;
const MAX_LEN = 400;
const FIXED = [
  { name: "general", topic: "Welcome to RBXChat! Be nice. Type /help for commands." },
  { name: "games", topic: "What are we playing? Post your place and get people in." },
  { name: "off-topic", topic: "Anything goes (within reason)." },
];
const KICK_MS = 60000;

export function registerChat({ db, route, fail, text, isAdmin, places, getAvatar }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY,
      channel TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      action INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_channel ON chat_messages(channel, id);
  `);
  const q = (sql) => db.prepare(sql);
  const sendLimiter = new RateLimiter(5, 5000);
  const typingLimiter = new RateLimiter(1, 2000);
  const clients = new Set(); // { res, user }
  const kicked = new Map(); // userId -> until

  const validChannel = (c) => FIXED.some((f) => f.name === c) || places.has(c);
  const channelName = (c) => String(c || "").replace(/^#/, "").toLowerCase().slice(0, 60);
  const isKicked = (u) => (kicked.get(u.id) || 0) > Date.now();
  const row = (m) => ({ id: m.id, channel: m.channel, user: m.username, body: m.body, action: !!m.action, at: m.created_at });
  const SELECT = "SELECT m.*, u.username FROM chat_messages m JOIN users u ON u.id = m.user_id";

  function emit(res, obj, id) {
    if (res.writableEnded || res.destroyed) return;
    res.write((id ? `id: ${id}\n` : "") + `data: ${JSON.stringify(obj)}\n\n`);
  }
  function broadcast(obj, id) {
    for (const c of clients) emit(c.res, obj, id);
  }
  function onlineList() {
    const byId = new Map();
    for (const c of clients) byId.set(c.user.id, c.user);
    return [...byId.values()].map((u) => ({ username: u.username, status: u.status, mod: isAdmin(u), avatar: getAvatar(u) }))
      .sort((a, b) => (b.mod - a.mod) || a.username.localeCompare(b.username));
  }
  const presence = () => broadcast({ type: "presence", users: onlineList() });
  const system = (channel, body) => broadcast({ type: "system", channel, body, at: Date.now() });

  // Heartbeat keeps proxies from closing idle streams and keeps "last seen" fresh.
  setInterval(() => {
    const now = Date.now();
    for (const c of clients) {
      if (!c.res.writableEnded) c.res.write(": ping\n\n");
      if (now - c.seen > 60000) { c.seen = now; q("UPDATE users SET last_seen = ? WHERE id = ?").run(now, c.user.id); }
    }
  }, 25000).unref();

  route("GET", "/api/chat/channels", () => {
    const last = new Map(q("SELECT channel, MAX(id) AS id FROM chat_messages GROUP BY channel").all().map((r) => [r.channel, r.id]));
    const placeRooms = [...last.keys()].filter((c) => !FIXED.some((f) => f.name === c) && places.has(c))
      .map((c) => ({ name: c, topic: `Chat about ${places.get(c).name}`, place: c }));
    return { channels: [...FIXED, ...placeRooms].map((c) => ({ ...c, lastId: last.get(c.name) || 0 })), maxLength: MAX_LEN };
  });

  // Topic for any valid channel (used when joining a place room that has no messages yet).
  route("GET", "/api/chat/channels/:name", ({ params }) => {
    const c = channelName(params.name);
    if (!validChannel(c)) fail(404, `No such channel #${c}. Place rooms use the place id, e.g. #2008m-crossroads.`);
    const f = FIXED.find((x) => x.name === c);
    return { channel: f ? { ...f } : { name: c, topic: `Chat about ${places.get(c).name}`, place: c } };
  });

  route("GET", "/api/chat/history", ({ url }) => {
    const c = channelName(url.searchParams.get("channel"));
    if (!validChannel(c)) fail(404, "No such channel.");
    const before = parseInt(url.searchParams.get("before"), 10) || Number.MAX_SAFE_INTEGER;
    const msgs = q(`${SELECT} WHERE m.channel = ? AND m.id < ? ORDER BY m.id DESC LIMIT 100`).all(c, before).reverse().map(row);
    return { channel: c, messages: msgs };
  });

  // Unread counts: body { read: { channel: lastReadId } }.
  route("POST", "/api/chat/unread", ({ body, user }) => {
    const out = {};
    const read = body.read && typeof body.read === "object" ? body.read : {};
    for (const [ch, id] of Object.entries(read).slice(0, 60)) {
      const c = channelName(ch);
      if (!validChannel(c)) continue;
      const rows = q(`SELECT body FROM chat_messages WHERE channel = ? AND id > ? AND user_id != ?`).all(c, Number(id) || 0, user.id);
      const me = new RegExp(`\\b${user.username}\\b`, "i");
      out[c] = { count: rows.length, mentions: rows.filter((r) => me.test(r.body)).length };
    }
    return { unread: out };
  });

  route("POST", "/api/chat/send", ({ body, user }) => {
    if (isKicked(user)) fail(403, "You were kicked. Wait a minute before talking again.");
    const c = channelName(body.channel);
    if (!validChannel(c)) fail(404, "No such channel.");
    let msg = text(body.text, { min: 1, max: MAX_LEN, name: "Message" });
    let action = false;
    if (/^\/me\s+/i.test(msg)) { action = true; msg = msg.replace(/^\/me\s+/i, ""); }
    if (sendLimiter.blocked(user.id)) fail(429, "Whoa, slow down! (max 5 messages per 5 seconds)");
    sendLimiter.hit(user.id);
    const now = Date.now();
    const id = Number(q("INSERT INTO chat_messages (channel, user_id, body, action, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(c, user.id, msg, action ? 1 : 0, now).lastInsertRowid);
    q(`DELETE FROM chat_messages WHERE channel = ? AND id <= (SELECT id FROM chat_messages WHERE channel = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`)
      .run(c, c, HISTORY);
    const m = { id, channel: c, user: user.username, body: msg, action, at: now };
    broadcast({ type: "message", message: m }, id);
    return { message: m };
  });

  route("POST", "/api/chat/typing", ({ body, user }) => {
    const c = channelName(body.channel);
    if (validChannel(c) && !typingLimiter.blocked(user.id) && !isKicked(user)) {
      typingLimiter.hit(user.id);
      broadcast({ type: "typing", channel: c, user: user.username });
    }
    return { ok: true };
  });

  route("POST", "/api/chat/messages/:id/delete", ({ params, user }) => {
    const m = q("SELECT * FROM chat_messages WHERE id = ?").get(Number(params.id));
    if (!m) fail(404, "No such message.");
    if (m.user_id !== user.id && !isAdmin(user)) fail(403, "Only moderators can delete other people's messages.");
    q("DELETE FROM chat_messages WHERE id = ?").run(m.id);
    broadcast({ type: "delete", id: m.id, channel: m.channel });
    return { ok: true };
  });

  route("POST", "/api/chat/kick", ({ body, user }) => {
    if (!isAdmin(user)) fail(403, "Only moderators can kick.");
    const target = q("SELECT * FROM users WHERE username = ?").get(String(body.username || "").replace(/^@/, ""));
    if (!target) fail(404, "No user by that name.");
    if (target.id === user.id) fail(400, "You can't kick yourself.");
    const reason = text(body.reason, { max: 100, name: "Reason" });
    const c = channelName(body.channel) || "general";
    kicked.set(target.id, Date.now() + KICK_MS);
    for (const cl of [...clients]) {
      if (cl.user.id !== target.id) continue;
      emit(cl.res, { type: "kicked", by: user.username, reason });
      clients.delete(cl);
      cl.res.end();
    }
    presence();
    system(c, `${target.username} was kicked by ${user.username}${reason ? ` (${reason})` : ""}`);
    return { ok: true };
  });

  route("GET", "/api/chat/online", () => ({ users: onlineList() }));

  // The live stream. Replays missed messages when the browser reconnects with Last-Event-ID.
  route("GET", "/api/chat/stream", ({ req, res, user }) => {
    if (isKicked(user)) fail(403, "You were kicked. Try again in a minute.");
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const lastId = parseInt(req.headers["last-event-id"], 10);
    if (lastId) {
      for (const m of q(`${SELECT} WHERE m.id > ? ORDER BY m.id LIMIT ${HISTORY}`).all(lastId).map(row)) emit(res, { type: "message", message: m }, m.id);
    }
    const client = { res, user, seen: Date.now() };
    const wasOnline = [...clients].some((c) => c.user.id === user.id);
    clients.add(client);
    emit(res, { type: "hello", you: user.username, mod: isAdmin(user), users: onlineList() });
    if (!wasOnline) presence();
    req.on("close", () => {
      clients.delete(client);
      if (![...clients].some((c) => c.user.id === user.id)) presence();
    });
  });
}
