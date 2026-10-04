// JSON API: accounts, profiles, friends, forums, guestbook, counters, catalog and avatars.
import { tx } from "./db.mjs";
import { registerChat } from "./chat.mjs";
import { hashPassword, verifyPassword, sha256, randomToken, cookie, RateLimiter } from "./auth.mjs";

const DAY = 86400000;
const ONLINE_MS = 5 * 60000;
const SESSION_DAYS = 30;
const THREADS_PER_PAGE = 20, POSTS_PER_PAGE = 15, GUESTBOOK_PER_PAGE = 15;
const MOODS = ["", "happy", "cool", "bored", "silly", "sad", "angry", "nostalgic", "noob"];

export const DEFAULT_AVATAR = Object.freeze({
  colors: { head: 24, torso: 23, leftArm: 24, rightArm: 24, leftLeg: 119, rightLeg: 119 },
  hats: [], face: "DefaultFace.rbxm", head: "DefaultHead.rbxm",
  shirt: "NoShirt.rbxm", pants: "NoPants.rbxm", tshirt: "NoTShirt.rbxm", extra: "NoExtra.rbxm",
});
const SLOT_FOLDER = { hat: "hats", face: "faces", head: "heads", tshirt: "tshirts", shirt: "shirts", pants: "pants", extra: "custom" };

class ApiError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const fail = (status, message, extra) => { throw new ApiError(status, message, extra); };

// Strips control characters, normalizes newlines, trims and enforces a length range.
function text(v, { min = 0, max, name, multiline = false } = {}) {
  let s = typeof v === "string" ? v : v == null ? "" : String(v);
  s = s.replace(/\r\n?/g, "\n").replace(multiline ? /[\u0000-\u0008\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, "");
  s = s.replace(/\n{4,}/g, "\n\n\n").trim();
  if (s.length < min) fail(400, min <= 1 ? `${name} can't be empty.` : `${name} must be at least ${min} characters.`);
  if (s.length > max) fail(400, `${name} can be at most ${max} characters.`);
  return s;
}

const today = () => new Date().toLocaleDateString("en-CA");

export function createApi({ db, cfg, catalog, places, secure }) {
  const items = new Map(catalog.items.map((i) => [i.id, i]));
  const colorIds = new Set(catalog.colors.map((c) => c.id));
  const loginLimiter = new RateLimiter(30, 15 * 60000); // per IP (friends may share one)
  const userLimiter = new RateLimiter(8, 15 * 60000);
  const registerLimiter = new RateLimiter(5, 60 * 60000);
  const postLimiter = new RateLimiter(1, 5000);
  const visitLimiter = new RateLimiter(1, 30000);

  const q = (sql) => db.prepare(sql);
  const userByName = (name) => q("SELECT * FROM users WHERE username = ?").get(String(name || ""));
  const isAdmin = (u) => !!u && (u.id === 1 || (cfg.admins || []).some((a) => a.toLowerCase() === u.username.toLowerCase()));
  const online = (u) => Date.now() - u.last_seen < ONLINE_MS;
  const postCount = (id) => q("SELECT COUNT(*) AS n FROM posts WHERE user_id = ?").get(id).n;

  function pub(u) {
    return { id: u.id, username: u.username, joined: u.created_at, online: online(u), status: u.status };
  }

  function getAvatar(u) {
    try { return u.avatar ? { ...structuredClone(DEFAULT_AVATAR), ...JSON.parse(u.avatar) } : structuredClone(DEFAULT_AVATAR); }
    catch { return structuredClone(DEFAULT_AVATAR); }
  }

  function owns(userId, item) {
    if (!item) return false;
    if (item.builtin || item.price === 0) return true;
    return !!q("SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?").get(userId, item.id);
  }

  function validateAvatar(input, userId) {
    if (!input || typeof input !== "object") fail(400, "Avatar must be an object.");
    const out = structuredClone(DEFAULT_AVATAR);
    const colors = input.colors || {};
    for (const part of Object.keys(out.colors)) {
      if (colors[part] == null) continue;
      const id = Number(colors[part]);
      if (!colorIds.has(id)) fail(400, `Unknown BrickColor ${colors[part]} for ${part}.`);
      out.colors[part] = id;
    }
    const slot = (type, file) => {
      const item = items.get(`${SLOT_FOLDER[type]}/${file}`);
      if (!item) fail(400, `Unknown ${type} "${String(file).slice(0, 60)}".`);
      if (!owns(userId, item)) fail(403, `You don't own ${item.name}.`);
      return item.file;
    };
    const hats = Array.isArray(input.hats) ? input.hats.filter((h) => h && h !== "NoHat.rbxm") : [];
    if (hats.length > 3) fail(400, "You can wear at most 3 hats.");
    out.hats = [...new Set(hats.map((h) => slot("hat", h)))];
    for (const type of ["face", "head", "shirt", "pants", "tshirt", "extra"]) if (input[type]) out[type] = slot(type, input[type]);
    return out;
  }

  // What the game client needs, in Novetus' InitalizeClientAppearance order.
  function novetusAppearance(av) {
    return {
      hat1: av.hats[0] || "NoHat.rbxm", hat2: av.hats[1] || "NoHat.rbxm", hat3: av.hats[2] || "NoHat.rbxm",
      headColor: av.colors.head, torsoColor: av.colors.torso, leftArmColor: av.colors.leftArm,
      rightArmColor: av.colors.rightArm, leftLegColor: av.colors.leftLeg, rightLegColor: av.colors.rightLeg,
      tshirt: av.tshirt, shirt: av.shirt, pants: av.pants, face: av.face, head: av.head, extra: av.extra || "NoExtra.rbxm",
    };
  }

  function me(u) {
    return {
      id: u.id, username: u.username, joined: u.created_at, tix: u.tix, robux: u.robux,
      blurb: u.blurb, status: u.status, signature: u.signature, admin: isAdmin(u),
    };
  }

  function startSession(res, userId) {
    const token = randomToken();
    const now = Date.now();
    q("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(sha256(token), userId, now, now + SESSION_DAYS * DAY);
    res.appendHeader("Set-Cookie", cookie("rbxsess", token, { maxAge: SESSION_DAYS * 86400, secure }));
  }

  function friendship(a, b) {
    return q(`SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`)
      .get(a, b, b, a);
  }
  function friendsOf(id) {
    return q(`SELECT u.* FROM friendships f JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
              WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted' ORDER BY u.last_seen DESC`).all(id, id, id);
  }

  function author(u) {
    return { username: u.username, joined: u.created_at, postCount: postCount(u.id), signature: u.signature, online: online(u),
      avatar: getAvatar(u) };
  }

  function page(v) { return Math.max(1, Math.min(100000, parseInt(v, 10) || 1)); }
  function placeName(id) { return places.get(id)?.name || id; }

  const routes = [];
  const route = (method, path, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp("^" + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
    routes.push({ method, re, keys, handler, auth: opts.auth !== false });
  };

  // ---------- Accounts ----------
  route("GET", "/api/me", ({ user }) => {
    if (!user) return { user: null };
    let bonus = null;
    const day = today();
    if (user.last_bonus_day !== day) {
      bonus = { tix: cfg.dailyTix, robux: cfg.dailyRobux };
      q("UPDATE users SET tix = tix + ?, robux = robux + ?, last_bonus_day = ? WHERE id = ?").run(bonus.tix, bonus.robux, day, user.id);
      user = q("SELECT * FROM users WHERE id = ?").get(user.id);
    }
    const pending = q("SELECT COUNT(*) AS n FROM friendships WHERE addressee_id = ? AND status = 'pending'").get(user.id).n;
    return { user: { ...me(user), friendRequests: pending, avatar: getAvatar(user) }, bonus };
  }, { auth: false });

  route("POST", "/api/register", async ({ body, ip, res }) => {
    if (registerLimiter.blocked(ip)) fail(429, "Too many new accounts from your network. Try again later.");
    const username = String(body.username || "").trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) fail(400, "Usernames are 3-20 letters, numbers or underscores.");
    if (/^_|_$/.test(username) || (username.match(/_/g) || []).length > 1) fail(400, "Usernames can have one underscore, not at the start or end.");
    const password = String(body.password || "");
    if (password.length < 6 || password.length > 128) fail(400, "Passwords must be 6-128 characters.");
    if (password.toLowerCase() === username.toLowerCase()) fail(400, "Your password can't be your username.");
    if (userByName(username)) fail(409, "That username is already taken.");
    const hash = await hashPassword(password);
    registerLimiter.hit(ip);
    let id;
    try {
      id = q("INSERT INTO users (username, pw_hash, created_at, last_seen, tix, robux) VALUES (?, ?, ?, ?, ?, ?)")
        .run(username, hash, Date.now(), Date.now(), cfg.startingTix, cfg.startingRobux).lastInsertRowid;
    } catch { fail(409, "That username is already taken."); }
    startSession(res, Number(id));
    return { ok: true, username };
  }, { auth: false });

  route("POST", "/api/login", async ({ body, ip, res }) => {
    const username = String(body.username || "").trim().slice(0, 20);
    const ukey = username.toLowerCase();
    if (loginLimiter.blocked(ip) || userLimiter.blocked(ukey)) {
      fail(429, `Too many login attempts. Try again in ${Math.ceil(Math.max(loginLimiter.retryAfter(ip), userLimiter.retryAfter(ukey)) / 60)} minutes.`);
    }
    const u = userByName(username);
    const ok = u ? await verifyPassword(String(body.password || ""), u.pw_hash) : (await hashPassword("x"), false);
    if (!ok) {
      loginLimiter.hit(ip); userLimiter.hit(ukey);
      fail(401, "Wrong username or password.");
    }
    userLimiter.reset(ukey);
    startSession(res, u.id);
    q("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    return { ok: true, username: u.username };
  }, { auth: false });

  route("POST", "/api/logout", ({ sessionHash, res }) => {
    if (sessionHash) q("DELETE FROM sessions WHERE token_hash = ?").run(sessionHash);
    res.appendHeader("Set-Cookie", cookie("rbxsess", "", { maxAge: 0, secure }));
    return { ok: true };
  }, { auth: false });

  route("POST", "/api/account", ({ user, body }) => {
    const blurb = body.blurb != null ? text(body.blurb, { max: 1000, name: "Blurb", multiline: true }) : user.blurb;
    const status = body.status != null ? text(body.status, { max: 100, name: "Status" }) : user.status;
    const signature = body.signature != null ? text(body.signature, { max: 200, name: "Signature", multiline: true }) : user.signature;
    q("UPDATE users SET blurb = ?, status = ?, signature = ? WHERE id = ?").run(blurb, status, signature, user.id);
    return { ok: true };
  });

  route("POST", "/api/account/password", async ({ user, body, sessionHash }) => {
    if (!(await verifyPassword(String(body.oldPassword || ""), user.pw_hash))) fail(403, "Your current password is wrong.");
    const pw = String(body.newPassword || "");
    if (pw.length < 6 || pw.length > 128) fail(400, "Passwords must be 6-128 characters.");
    q("UPDATE users SET pw_hash = ? WHERE id = ?").run(await hashPassword(pw), user.id);
    q("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(user.id, sessionHash);
    return { ok: true };
  });

  // ---------- People + profiles ----------
  route("GET", "/api/users", ({ url }) => {
    const search = String(url.searchParams.get("q") || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
    const rows = q(`SELECT * FROM users WHERE username LIKE ? ESCAPE '\\' ORDER BY last_seen DESC LIMIT 100`)
      .all("%" + search.replace(/_/g, "\\_") + "%");
    return { users: rows.map(pub) };
  });

  route("GET", "/api/users/:name", ({ user, params }) => {
    const u = userByName(params.name);
    if (!u) fail(404, "No user by that name.");
    const f = u.id === user.id ? null : friendship(user.id, u.id);
    const relation = u.id === user.id ? "self" : !f ? "none" : f.status === "accepted" ? "friends"
      : f.requester_id === user.id ? "requested" : "incoming";
    const friends = friendsOf(u.id);
    const visited = q("SELECT place_id, count, last_at FROM user_visits WHERE user_id = ? ORDER BY last_at DESC LIMIT 12").all(u.id)
      .map((v) => ({ placeId: v.place_id, name: placeName(v.place_id), count: v.count, last: v.last_at }));
    const lastPlace = u.last_place && Date.now() - u.last_place_at < 3 * 3600000
      ? { placeId: u.last_place, name: placeName(u.last_place), at: u.last_place_at } : null;
    return {
      profile: {
        ...pub(u), blurb: u.blurb, signature: u.signature, lastSeen: u.last_seen, postCount: postCount(u.id),
        friendCount: friends.length, friends: friends.slice(0, 12).map((f) => ({ ...pub(f), avatar: getAvatar(f) })),
        visited, lastPlace, avatar: getAvatar(u), relation,
        inventoryCount: q("SELECT COUNT(*) AS n FROM inventory WHERE user_id = ?").get(u.id).n,
      },
    };
  });

  // ---------- Friends ----------
  route("GET", "/api/friends", ({ user }) => {
    const incoming = q(`SELECT u.* FROM friendships f JOIN users u ON u.id = f.requester_id WHERE f.addressee_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`).all(user.id);
    const outgoing = q(`SELECT u.* FROM friendships f JOIN users u ON u.id = f.addressee_id WHERE f.requester_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`).all(user.id);
    const withAv = (u) => ({ ...pub(u), avatar: getAvatar(u), lastSeen: u.last_seen,
      playing: u.last_place && Date.now() - u.last_place_at < 30 * 60000 ? { placeId: u.last_place, name: placeName(u.last_place) } : null });
    return { friends: friendsOf(user.id).map(withAv), incoming: incoming.map(withAv), outgoing: outgoing.map(withAv) };
  });

  route("POST", "/api/friends/:name/request", ({ user, params }) => {
    const u = userByName(params.name);
    if (!u) fail(404, "No user by that name.");
    if (u.id === user.id) fail(400, "You can't friend yourself. Nice try.");
    const f = friendship(user.id, u.id);
    if (f?.status === "accepted") return { relation: "friends" };
    if (f && f.requester_id === u.id) {
      q("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ?").run(u.id, user.id);
      return { relation: "friends" };
    }
    if (!f) {
      if (q("SELECT COUNT(*) AS n FROM friendships WHERE requester_id = ? AND status = 'pending'").get(user.id).n >= 50) fail(429, "You have too many pending requests.");
      q("INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(user.id, u.id, Date.now());
    }
    return { relation: "requested" };
  });

  route("POST", "/api/friends/:name/accept", ({ user, params }) => {
    const u = userByName(params.name);
    const r = u && q("UPDATE friendships SET status = 'accepted' WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'").run(u.id, user.id);
    if (!r || !r.changes) fail(404, "No friend request from that user.");
    return { relation: "friends" };
  });

  // Unfriend, decline an incoming request, or cancel an outgoing one.
  route("POST", "/api/friends/:name/remove", ({ user, params }) => {
    const u = userByName(params.name);
    if (!u) fail(404, "No user by that name.");
    q("DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)").run(user.id, u.id, u.id, user.id);
    return { relation: "none" };
  });

  // ---------- Forums ----------
  route("GET", "/api/forums", () => {
    const boards = q(`SELECT b.*,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id) AS threads,
        (SELECT COUNT(*) FROM posts p JOIN threads t ON t.id = p.thread_id WHERE t.board_id = b.id) AS posts
      FROM boards b ORDER BY sort`).all();
    const categories = [];
    for (const b of boards) {
      const last = q(`SELECT t.id, t.title, t.last_post_at, u.username FROM threads t LEFT JOIN users u ON u.id = t.last_post_user
                      WHERE t.board_id = ? ORDER BY t.last_post_at DESC LIMIT 1`).get(b.id);
      let cat = categories.find((c) => c.name === b.category);
      if (!cat) categories.push(cat = { name: b.category, boards: [] });
      cat.boards.push({ id: b.id, name: b.name, description: b.description, threads: b.threads, posts: b.posts,
        last: last ? { threadId: last.id, title: last.title, at: last.last_post_at, by: last.username } : null });
    }
    return { categories };
  });

  route("GET", "/api/forums/search", ({ url }) => {
    const query = String(url.searchParams.get("q") || "").trim().slice(0, 80);
    if (query.length < 2) return { query, results: [] };
    const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const results = q(`SELECT DISTINCT t.id, t.title, t.created_at, t.last_post_at, t.reply_count, t.views, t.pinned,
        b.id AS board_id, b.name AS board_name, u.username AS author, l.username AS last_by
        FROM threads t JOIN boards b ON b.id = t.board_id JOIN users u ON u.id = t.user_id
        LEFT JOIN users l ON l.id = t.last_post_user
        WHERE t.title LIKE ? ESCAPE '\\' OR EXISTS (
          SELECT 1 FROM posts p WHERE p.thread_id = t.id AND p.body LIKE ? ESCAPE '\\'
        ) ORDER BY t.pinned DESC, t.last_post_at DESC LIMIT 50`).all(like, like)
      .map((t) => ({ id: t.id, title: t.title, boardId: t.board_id, board: t.board_name, author: t.author,
        created: t.created_at, replies: t.reply_count, views: t.views, pinned: !!t.pinned,
        last: { at: t.last_post_at, by: t.last_by } }));
    return { query, results };
  });

  route("GET", "/api/forums/boards/:id", ({ params, url }) => {
    const b = q("SELECT * FROM boards WHERE id = ?").get(Number(params.id));
    if (!b) fail(404, "No such forum.");
    const p = page(url.searchParams.get("page"));
    const total = q("SELECT COUNT(*) AS n FROM threads WHERE board_id = ?").get(b.id).n;
    const threads = q(`SELECT t.*, u.username AS author, l.username AS last_by FROM threads t
        JOIN users u ON u.id = t.user_id LEFT JOIN users l ON l.id = t.last_post_user
        WHERE t.board_id = ? ORDER BY t.pinned DESC, t.last_post_at DESC LIMIT ? OFFSET ?`)
      .all(b.id, THREADS_PER_PAGE, (p - 1) * THREADS_PER_PAGE)
      .map((t) => ({ id: t.id, title: t.title, author: t.author, created: t.created_at, replies: t.reply_count, views: t.views,
        pinned: !!t.pinned, locked: !!t.locked, last: { at: t.last_post_at, by: t.last_by } }));
    return { board: { id: b.id, name: b.name, category: b.category, description: b.description }, threads, page: p,
      pages: Math.max(1, Math.ceil(total / THREADS_PER_PAGE)) };
  });

  route("GET", "/api/forums/threads/:id", ({ params, url }) => {
    const t = q("SELECT * FROM threads WHERE id = ?").get(Number(params.id));
    if (!t) fail(404, "That thread doesn't exist (or got deleted).");
    q("UPDATE threads SET views = views + 1 WHERE id = ?").run(t.id);
    const b = q("SELECT * FROM boards WHERE id = ?").get(t.board_id);
    const total = q("SELECT COUNT(*) AS n FROM posts WHERE thread_id = ?").get(t.id).n;
    const pages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
    const p = url.searchParams.get("page") === "last" ? pages : page(url.searchParams.get("page"));
    const rows = q(`SELECT p.*, u.username, u.created_at AS joined, u.signature, u.last_seen, u.avatar FROM posts p
        JOIN users u ON u.id = p.user_id WHERE p.thread_id = ? ORDER BY p.id LIMIT ? OFFSET ?`)
      .all(t.id, POSTS_PER_PAGE, (p - 1) * POSTS_PER_PAGE);
    const counts = new Map();
    const posts = rows.map((r) => {
      if (!counts.has(r.user_id)) counts.set(r.user_id, postCount(r.user_id));
      return { id: r.id, body: r.body, created: r.created_at,
        author: { username: r.username, joined: r.joined, signature: r.signature, postCount: counts.get(r.user_id),
          online: Date.now() - r.last_seen < ONLINE_MS, avatar: getAvatar(r) } };
    });
    return { thread: { id: t.id, title: t.title, locked: !!t.locked, pinned: !!t.pinned, views: t.views + 1, replies: t.reply_count },
      board: { id: b.id, name: b.name, category: b.category }, posts, page: p, pages };
  });

  function floodCheck(user) {
    if (postLimiter.blocked(user.id)) fail(429, "Slow down! Wait a few seconds before posting again.");
    postLimiter.hit(user.id);
  }

  route("POST", "/api/forums/boards/:id/threads", ({ user, params, body }) => {
    const b = q("SELECT * FROM boards WHERE id = ?").get(Number(params.id));
    if (!b) fail(404, "No such forum.");
    const title = text(body.title, { min: 3, max: 80, name: "Subject" });
    const msg = text(body.body, { min: 1, max: 5000, name: "Message", multiline: true });
    floodCheck(user);
    const now = Date.now();
    const id = tx(db, () => {
      const tid = Number(q("INSERT INTO threads (board_id, user_id, title, created_at, last_post_at, last_post_user) VALUES (?, ?, ?, ?, ?, ?)")
        .run(b.id, user.id, title, now, now, user.id).lastInsertRowid);
      q("INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(tid, user.id, msg, now);
      return tid;
    });
    return { threadId: id };
  });

  route("POST", "/api/forums/threads/:id/posts", ({ user, params, body }) => {
    const t = q("SELECT * FROM threads WHERE id = ?").get(Number(params.id));
    if (!t) fail(404, "That thread doesn't exist.");
    if (t.locked && !isAdmin(user)) fail(403, "This thread is locked.");
    const msg = text(body.body, { min: 1, max: 5000, name: "Message", multiline: true });
    floodCheck(user);
    const now = Date.now();
    const id = tx(db, () => {
      const pid = q("INSERT INTO posts (thread_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(t.id, user.id, msg, now).lastInsertRowid;
      q("UPDATE threads SET reply_count = reply_count + 1, last_post_at = ?, last_post_user = ? WHERE id = ?").run(now, user.id, t.id);
      return Number(pid);
    });
    return { postId: id };
  });

  route("POST", "/api/forums/posts/:id/delete", ({ user, params }) => {
    const p = q("SELECT * FROM posts WHERE id = ?").get(Number(params.id));
    if (!p) fail(404, "No such post.");
    if (p.user_id !== user.id && !isAdmin(user)) fail(403, "That's not your post.");
    const first = q("SELECT MIN(id) AS id FROM posts WHERE thread_id = ?").get(p.thread_id).id === p.id;
    tx(db, () => {
      if (first) { q("DELETE FROM posts WHERE thread_id = ?").run(p.thread_id); q("DELETE FROM threads WHERE id = ?").run(p.thread_id); return; }
      q("DELETE FROM posts WHERE id = ?").run(p.id);
      const last = q("SELECT user_id, created_at FROM posts WHERE thread_id = ? ORDER BY id DESC LIMIT 1").get(p.thread_id);
      q("UPDATE threads SET reply_count = reply_count - 1, last_post_at = ?, last_post_user = ? WHERE id = ?").run(last.created_at, last.user_id, p.thread_id);
    });
    return { ok: true, threadDeleted: first };
  });

  route("POST", "/api/forums/threads/:id/moderate", ({ user, params, body }) => {
    if (!isAdmin(user)) fail(403, "Moderators only.");
    const r = q("UPDATE threads SET pinned = ?, locked = ? WHERE id = ?").run(body.pinned ? 1 : 0, body.locked ? 1 : 0, Number(params.id));
    if (!r.changes) fail(404, "No such thread.");
    return { ok: true };
  });

  // ---------- Guestbook + hit counter ----------
  route("GET", "/api/guestbook", ({ url }) => {
    const p = page(url.searchParams.get("page"));
    const total = q("SELECT COUNT(*) AS n FROM guestbook").get().n;
    const entries = q(`SELECT g.*, u.username, u.avatar FROM guestbook g JOIN users u ON u.id = g.user_id ORDER BY g.id DESC LIMIT ? OFFSET ?`)
      .all(GUESTBOOK_PER_PAGE, (p - 1) * GUESTBOOK_PER_PAGE)
      .map((g) => ({ id: g.id, username: g.username, message: g.message, homepage: g.homepage, mood: g.mood, created: g.created_at,
        avatar: getAvatar(g) }));
    return { entries, total, page: p, pages: Math.max(1, Math.ceil(total / GUESTBOOK_PER_PAGE)) };
  });

  route("POST", "/api/guestbook", ({ user, body }) => {
    const message = text(body.message, { min: 1, max: 500, name: "Message", multiline: true });
    let homepage = text(body.homepage, { max: 100, name: "Homepage" });
    if (homepage && !/^https?:\/\/[^\s<>"']+$/i.test(homepage)) fail(400, "Homepage must start with http:// or https://");
    const mood = MOODS.includes(body.mood) ? body.mood : "";
    floodCheck(user);
    const id = q("INSERT INTO guestbook (user_id, message, homepage, mood, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, message, homepage, mood, Date.now()).lastInsertRowid;
    return { id: Number(id) };
  });

  route("POST", "/api/guestbook/:id/delete", ({ user, params }) => {
    const g = q("SELECT * FROM guestbook WHERE id = ?").get(Number(params.id));
    if (!g) fail(404, "No such entry.");
    if (g.user_id !== user.id && !isAdmin(user)) fail(403, "That's not your entry.");
    q("DELETE FROM guestbook WHERE id = ?").run(g.id);
    return { ok: true };
  });

  const hits = () => q("SELECT value FROM counters WHERE key = 'hits'").get()?.value || 0;
  route("GET", "/api/hits", () => ({ hits: hits() }));
  route("POST", "/api/hits", () => {
    q("INSERT INTO counters (key, value) VALUES ('hits', 1) ON CONFLICT(key) DO UPDATE SET value = value + 1").run();
    return { hits: hits() };
  });

  // ---------- Places ----------
  route("GET", "/api/places", ({ user }) => {
    const visits = {}, mine = {};
    for (const r of q("SELECT * FROM place_visits").all()) visits[r.place_id] = r.visits;
    for (const r of q("SELECT * FROM user_visits WHERE user_id = ?").all(user.id)) mine[r.place_id] = r.count;
    const playing = q("SELECT username, last_place FROM users WHERE last_place != '' AND last_place_at > ?").all(Date.now() - 30 * 60000);
    const now = {};
    for (const p of playing) (now[p.last_place] ||= []).push(p.username);
    return { visits, mine, playing: now };
  });

  route("POST", "/api/places/:id/visit", ({ user, params }) => {
    const id = decodeURIComponent(params.id);
    if (!places.has(id)) fail(404, "No such place.");
    const key = user.id + ":" + id;
    let reward = 0;
    if (!visitLimiter.blocked(key)) {
      visitLimiter.hit(key);
      const now = Date.now(), day = today();
      tx(db, () => {
        q("INSERT INTO place_visits (place_id, visits) VALUES (?, 1) ON CONFLICT(place_id) DO UPDATE SET visits = visits + 1").run(id);
        q(`INSERT INTO user_visits (user_id, place_id, count, last_at) VALUES (?, ?, 1, ?)
           ON CONFLICT(user_id, place_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at`).run(user.id, id, now);
        const u = q("SELECT reward_day, reward_count FROM users WHERE id = ?").get(user.id);
        const count = u.reward_day === day ? u.reward_count : 0;
        if (count < cfg.playTixPerDay) reward = cfg.playTix;
        q("UPDATE users SET last_place = ?, last_place_at = ?, tix = tix + ?, reward_day = ?, reward_count = ? WHERE id = ?")
          .run(id, now, reward, day, count + (reward ? 1 : 0), user.id);
      });
    }
    const visits = q("SELECT visits FROM place_visits WHERE place_id = ?").get(id)?.visits || 0;
    return { placeId: id, visits, total: (places.get(id).visits || 0) + visits, reward };
  });

  // ---------- Catalog + inventory ----------
  route("GET", "/api/catalog", ({ user }) => {
    const owned = new Set(q("SELECT item_id FROM inventory WHERE user_id = ?").all(user.id).map((r) => r.item_id));
    return {
      items: catalog.items.map((i) => ({ ...i, owned: !!(i.builtin || i.price === 0 || owned.has(i.id)) })),
      colors: catalog.colors,
    };
  });

  route("GET", "/api/inventory", ({ user }) => {
    const rows = q("SELECT item_id, acquired_at FROM inventory WHERE user_id = ? ORDER BY acquired_at DESC").all(user.id);
    return { items: rows.map((r) => ({ id: r.item_id, acquired: r.acquired_at })) };
  });

  route("POST", "/api/catalog/buy", ({ user, body }) => {
    const item = items.get(String(body.id || ""));
    if (!item || item.builtin) fail(404, "That item isn't for sale.");
    if (owns(user.id, item)) fail(409, "You already own this item.");
    const field = item.currency === "robux" ? "robux" : "tix";
    tx(db, () => {
      const r = q(`UPDATE users SET ${field} = ${field} - ? WHERE id = ? AND ${field} >= ?`).run(item.price, user.id, item.price);
      if (!r.changes) fail(402, `You need ${item.price} ${field === "robux" ? "ROBUX" : "Tix"} to buy this.`);
      q("INSERT INTO inventory (user_id, item_id, acquired_at) VALUES (?, ?, ?)").run(user.id, item.id, Date.now());
    });
    const u = q("SELECT tix, robux FROM users WHERE id = ?").get(user.id);
    return { ok: true, tix: u.tix, robux: u.robux };
  });

  // ---------- Avatar ----------
  route("GET", "/api/avatar", ({ user }) => ({ avatar: getAvatar(user) }));
  const saveAvatar = ({ user, body }) => {
    const av = validateAvatar(body.avatar || body, user.id);
    q("UPDATE users SET avatar = ? WHERE id = ?").run(JSON.stringify(av), user.id);
    return { avatar: av };
  };
  route("PUT", "/api/avatar", saveAvatar);
  route("POST", "/api/avatar", saveAvatar);
  route("GET", "/api/avatar/:name", ({ params }) => {
    const u = userByName(params.name);
    if (!u) fail(404, "No user by that name.");
    const av = getAvatar(u);
    return { username: u.username, avatar: av, novetus: novetusAppearance(av), charcustomBase: "shareddata/charcustom/" };
  }, { auth: false }); // public behind the site gate, for the game client

  route("GET", "/api/online", () => ({
    users: q("SELECT * FROM users WHERE last_seen > ? ORDER BY last_seen DESC LIMIT 50").all(Date.now() - ONLINE_MS).map(pub),
  }));

  registerChat({ db, route, fail, text, isAdmin, places, getAvatar });

  // ---------- Dispatcher ----------
  return async function handle(ctx) {
    const { req, res, url } = ctx;
    const send = (status, obj, headers = {}) => {
      if (res.headersSent) { res.end(); return; }
      const body = JSON.stringify(obj);
      res.writeHead(status, { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(body);
    };
    try {
      const method = req.method === "HEAD" ? "GET" : req.method;
      let match, params = {};
      const r = routes.find((rt) => {
        if (rt.method !== method) return false;
        match = rt.re.exec(url.pathname);
        return !!match;
      });
      if (!r) return send(routes.some((rt) => rt.re.test(url.pathname)) ? 405 : 404, { error: "Not found." });
      r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(match[i + 1]); } catch { params[k] = match[i + 1]; } });

      if (method !== "GET") {
        // CSRF: cookies are SameSite=Lax; additionally require a JSON body and a same-origin Origin header.
        const origin = req.headers.origin;
        let originHost = null;
        try { originHost = origin && new URL(origin).host; } catch { /* "null" or garbage */ }
        // Behind a tunnel/proxy the Host header may be rewritten; X-Forwarded-Host keeps the public name.
        const hosts = [req.headers.host, ...String(req.headers["x-forwarded-host"] || "").split(",").map((h) => h.trim())].filter(Boolean);
        if (origin && !hosts.includes(originHost)) fail(403, "Cross-site request blocked.");
        if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) fail(415, "Send JSON.");
      }
      if (r.auth && !ctx.user) fail(401, "You need to log in first.");
      if (ctx.user && Date.now() - ctx.user.last_seen > 60000) {
        q("UPDATE users SET last_seen = ? WHERE id = ?").run(Date.now(), ctx.user.id);
      }
      ctx.body = method === "GET" ? {} : await readJson(req);
      const out = await r.handler({ ...ctx, params });
      if (!res.headersSent) send(200, out); // streaming handlers (chat) write their own response
    } catch (e) {
      if (e instanceof ApiError) {
        send(e.status, { error: e.message, ...(e.extra || {}) });
      } else {
        console.error(e);
        send(500, { error: "Something went wrong on the server." });
      }
    }
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 32768) { reject(new ApiError(413, "That's too long.")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(v && typeof v === "object" && !Array.isArray(v) ? v : {});
      } catch { reject(new ApiError(400, "Bad JSON.")); }
    });
    req.on("error", reject);
  });
}
