// SQLite schema (node:sqlite) and seed data.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "rbxbanland.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pw_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL DEFAULT 0,
      blurb TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '',
      tix INTEGER NOT NULL DEFAULT 0,
      robux INTEGER NOT NULL DEFAULT 0,
      last_bonus_day TEXT NOT NULL DEFAULT '',
      reward_day TEXT NOT NULL DEFAULT '',
      reward_count INTEGER NOT NULL DEFAULT 0,
      avatar TEXT NOT NULL DEFAULT '',
      last_place TEXT NOT NULL DEFAULT '',
      last_place_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS friendships (
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (requester_id, addressee_id)
    );
    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      sort INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY,
      board_id INTEGER NOT NULL REFERENCES boards(id),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_post_at INTEGER NOT NULL,
      last_post_user INTEGER,
      reply_count INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS threads_board ON threads(board_id, pinned DESC, last_post_at DESC);
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS posts_thread ON posts(thread_id, id);
    CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id);
    CREATE TABLE IF NOT EXISTS guestbook (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      homepage TEXT NOT NULL DEFAULT '',
      mood TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS place_visits (place_id TEXT PRIMARY KEY, visits INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS user_visits (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      place_id TEXT NOT NULL,
      count INTEGER NOT NULL,
      last_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, place_id)
    );
    CREATE TABLE IF NOT EXISTS inventory (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      acquired_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, item_id)
    );
  `);

  if (!db.prepare("SELECT COUNT(*) AS n FROM boards").get().n) {
    const boards = [
      ["RBXBanland", "General Discussion", "Talk about anything RBXBanland related."],
      ["RBXBanland", "Help (Technical Support)", "Game won't boot? Stuck on the loading screen? Ask here."],
      ["RBXBanland", "Suggestions & Ideas", "Got an idea for the site or a place we should add?"],
      ["Club Houses", "Off Topic", "Anything goes (within reason)."],
      ["Club Houses", "Let's Make a Deal", "Trade hats, brag about your collection."],
      ["Club Houses", "Clans & Guilds", "Recruit for your sword fighting clan."],
      ["Game Creation and Development", "Building Helpers", "Bricks, welds and hinges."],
      ["Game Creation and Development", "Scripting Helpers", "Lua 5.1 the way it was meant to be."],
    ];
    const ins = db.prepare("INSERT INTO boards (category, name, description, sort) VALUES (?, ?, ?, ?)");
    boards.forEach((b, i) => ins.run(b[0], b[1], b[2], i));
  }
  return db;
}

// Runs fn inside a transaction.
export function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}
