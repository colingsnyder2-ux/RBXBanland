# RBXBanland server

A dependency-free Node server: an access-token gate in front of everything, a JSON API backed by
`node:sqlite`, and the static site in `../site`. It sends `Cross-Origin-Opener-Policy`,
`Cross-Origin-Embedder-Policy` and `Cross-Origin-Resource-Policy` on every response, so the emulator
gets `SharedArrayBuffer`.

## Run

Requires Node 22.5+ (built with Node 25; `node:sqlite` prints an "experimental" warning, which is harmless).

```
cd server
node server.mjs 8090
```

The port comes from the first argument, then `$PORT`, then `"port"` in `config.json`, then 8080.
On start it prints the access token and a share link.

### Testing without touching real data

Never delete or reset `server/data/`, because it holds real accounts. For tests, point the server at a throwaway folder:

```
RBX_DATA_DIR=/tmp/rbx-test node server.mjs 8091
```

The token gate and everything else work the same; only the SQLite file location changes.

## Playing from phones and other computers

**One click:** double-click `start-rbxbanland.bat` in the project folder. It starts the server on port 8090 (unless it's
already running) and opens it in your browser. It then asks whether to also start an internet tunnel.

The startup banner lists every way in:

- **This PC:** `http://localhost:8090/?key=TOKEN`
- **Same Wi-Fi:** `http://192.168.x.x:8090/?key=TOKEN`. The server listens on all interfaces, and the gate and login
  cookies work over plain http. Allow Node through the Windows Firewall (private networks) the first time.
  **Limitation:** browsers only give the emulator SharedArrayBuffer on secure pages (https or localhost).
  On a plain-http LAN address the site works, but games won't run. The desktop warns before launching one.
- **Internet / phones (recommended): Cloudflare quick tunnel.** Install `cloudflared` once with
  `winget install --id Cloudflare.cloudflared` (no account needed). Then answer Y in `start-rbxbanland.bat`,
  or run `node server/tunnel.mjs 8090`. It prints a public
  `https://<random>.trycloudflare.com/?key=TOKEN` link. That link is https, so games work on phones too. The address
  changes every time the tunnel restarts; keep its window open. Rate limiting uses the real visitor IP
  (`CF-Connecting-IP`).
- **LAN https (alternative, no internet):** run `node server/tools/make-cert.mjs`, which uses Git's openssl to write a
  self-signed certificate for localhost, this PC's name and its LAN IPs to `server/tls/`. Then add `"httpsPort": 8443`
  to `config.json` (or set `RBX_HTTPS_PORT`) and restart. Open `https://192.168.x.x:8443/?key=TOKEN` and accept the
  certificate warning once. Re-run make-cert if the PC's IP changes. Tested in Edge: the page is then cross-origin isolated.

## The access token (site gate)

- Lives in **`server/config.json`** as `"accessToken"`. It is generated on first run if missing.
- Visitors without the gate cookie get a Windows 98 "Enter Network Password" page. Typing the token
  sets an HttpOnly, signed cookie (`rbxgate`, 180 days). Everything is gated: pages, `/api`, `/data` zips and the emulator.
- Share link: `http://HOST:PORT/?key=TOKEN` sets the cookie and strips the key from the URL.
- **Reset / change it:** stop the server, edit `"accessToken"` in `config.json` (or delete the line to
  get a new random one), start again. Old gate cookies stop working right away because the cookie is an
  HMAC of the token. Deleting `"secret"` also logs everyone out of their accounts.

Other `config.json` keys (all optional):

| key | default | meaning |
| --- | --- | --- |
| `secret` | random | HMAC key for the gate cookie |
| `startingTix` / `startingRobux` | 100 / 10 | balance for new accounts |
| `dailyTix` / `dailyRobux` | 50 / 5 | daily login bonus (given on the first `/api/me` of the day) |
| `playTix` / `playTixPerDay` | 10 / 5 | Tix for pressing Play, max times per day |
| `admins` | `[]` | extra moderator usernames (the first account ever registered, id 1, is always a moderator) |
| `secureCookies` | false | add `Secure` to cookies (set when serving over HTTPS) |
| `trustProxy` | false | use `X-Forwarded-For` for rate limiting (behind a reverse proxy) |
| `port` | 8080 | default port |

## Data

- Database: `server/data/rbxbanland.db` (SQLite, WAL). Delete it (with the server stopped) to wipe all
  accounts, posts, etc. Forum boards are re-seeded automatically.
- Catalog: `server/catalog.json` + icons in `site/img/catalog/`, built from the Novetus item library by
  `python server/tools/build-catalog.py [novetus-data-dir]` (needs Pillow). Item file names are kept
  exactly as in Novetus (`hats/ArrowHat.rbxm`) because the game loads items by those names.
  Prices are derived from a hash of the file name, so rebuilding keeps them stable.
- Desktop icons: `python server/tools/make-icons.py`.

## Security notes

- Passwords: scrypt (N=16384, r=8, p=1, 16-byte salt). Sessions: random 256-bit tokens, stored as SHA-256, 30 days.
- Cookies are `HttpOnly; SameSite=Lax`. State-changing API calls must be JSON (`Content-Type: application/json`)
  and, when an `Origin` header is present, same-origin. That plus SameSite blocks CSRF.
- Rate limits (in memory): gate 10 wrong tokens / 15 min / IP; login 8 failures / 15 min / username and
  30 / 15 min / IP; 5 registrations / hour / IP; one forum or guestbook post per 5 s per user; one counted
  visit per place per user per 30 s.
- All user text is stored raw and HTML-escaped when rendered (`RB.esc` / `RB.rich` in `site/js/common.js`).
  Length limits: username 3-20 `[A-Za-z0-9_]`, password 6-128, status 100, blurb 1000, signature 200,
  thread title 3-80, post 5000, guestbook 500, request body 32 KB.
- Our own pages get a strict Content-Security-Policy; `play.html` and `emu*/` are left without one so the emulator works.

## API

All under `/api`, JSON in and out. "auth" means a logged-in session is required (401 otherwise).
Errors come back as `{ "error": "message" }` with a 4xx status.

| method | path | auth | notes |
| --- | --- | --- | --- |
| GET | `/me` | - | `{user: {id, username, tix, robux, blurb, status, signature, admin, friendRequests, avatar} or null, bonus}`; grants the daily bonus |
| POST | `/register` | - | `{username, password}`, logs in |
| POST | `/login` | - | `{username, password}` |
| POST | `/logout` | - | |
| POST | `/account` | yes | `{blurb?, status?, signature?}` |
| POST | `/account/password` | yes | `{oldPassword, newPassword}`; logs out other sessions |
| GET | `/users?q=` | yes | search users (up to 100) |
| GET | `/users/:name` | yes | profile: blurb, status, joined, online, postCount, friends, visited places, lastPlace, avatar, relation |
| GET | `/online` | yes | users seen in the last 5 minutes |
| GET | `/friends` | yes | `{friends, incoming, outgoing}` |
| POST | `/friends/:name/request` | yes | send (or accept, if they already asked you) |
| POST | `/friends/:name/accept` | yes | |
| POST | `/friends/:name/remove` | yes | unfriend / decline / cancel |
| GET | `/forums` | yes | categories, boards, counts, last post |
| GET | `/forums/search?q=` | yes | up to 50 threads matching title or post body |
| GET | `/forums/boards/:id?page=` | yes | threads (20 per page, pinned first) |
| GET | `/forums/threads/:id?page=N or last` | yes | posts (15 per page) with author post count, join date, signature, avatar |
| POST | `/forums/boards/:id/threads` | yes | `{title, body}` |
| POST | `/forums/threads/:id/posts` | yes | `{body}` |
| POST | `/forums/posts/:id/delete` | yes | own post or moderator; deleting a thread's first post deletes the thread |
| POST | `/forums/threads/:id/moderate` | mod | `{pinned, locked}` |
| GET | `/guestbook?page=` | yes | |
| POST | `/guestbook` | yes | `{message, homepage?, mood?}` |
| POST | `/guestbook/:id/delete` | yes | own entry or moderator |
| GET / POST | `/hits` | yes | read / increment the hit counter (the desktop increments once per browser session) |
| GET | `/places` | yes | `{visits: {placeId: n}, mine: {placeId: n}, playing: {placeId: [usernames]}}` |
| POST | `/places/:id/visit` | yes | count a visit, mark "playing", maybe award Tix. Returns `{placeId, visits, total, reward}` |
| GET | `/catalog` | yes | `{items: [{id, type, file, name, desc, icon, tex?, year?, price, currency, builtin?, owned}], colors: [{id, name, group, hex}]}` |
| POST | `/catalog/buy` | yes | `{id}` e.g. `"hats/ArrowHat.rbxm"` |
| GET | `/inventory` | yes | owned item ids |
| GET | `/avatar` | yes | your avatar |
| PUT (or POST) | `/avatar` | yes | `{avatar}` or the avatar object; validated, only owned items (built-in defaults and free items count as owned) |
| GET | `/avatar/:name` | gate only | public avatar for the game client, see `site/INTEGRATION.md` |

### Chat (RBXChat)

Live delivery uses Server-Sent Events (no WebSocket, no npm deps), so it goes through the same gate,
cookies and COOP/COEP headers. Channels: `general`, `games`, `off-topic`, plus one room per place
named by its place id (e.g. `2008m-crossroads`), created on first use. The last 200 messages per channel are kept in
SQLite (`chat_messages`). Messages are 1-400 characters, max 5 per 5 s per user, typing pings max 1 per 2 s.
Moderators (user id 1 + `admins`) can delete any message and kick (a kicked user's streams are closed and they
can't send or reconnect for 60 s). Kicks are kept in memory.

| method | path | notes |
| --- | --- | --- |
| GET | `/chat/stream` | `text/event-stream`. Each event is `data: {json}` with `type` = `hello` (`you, mod, users`), `presence` (`users: [{username, status, mod, avatar}]`), `message` (`message: {id, channel, user, body, action, at}`, SSE `id:` = message id; on reconnect `Last-Event-ID` replays missed messages), `delete` (`id, channel`), `typing` (`channel, user`), `system` (`channel, body`), `kicked` (`by, reason`). Pings every 25 s |
| GET | `/chat/channels` | `{channels: [{name, topic, place?, lastId}], maxLength}` (fixed channels + place rooms with messages) |
| GET | `/chat/channels/:name` | look up / validate a channel before joining |
| GET | `/chat/history?channel=&before=` | up to 100 messages, oldest first |
| POST | `/chat/unread` | `{read: {channel: lastReadId}}` → `{unread: {channel: {count, mentions}}}` |
| POST | `/chat/send` | `{channel, text}`; `text` starting with `/me ` becomes an action |
| POST | `/chat/typing` | `{channel}` |
| POST | `/chat/messages/:id/delete` | own message or moderator |
| POST | `/chat/kick` | moderator: `{username, reason?, channel?}` |
| GET | `/chat/online` | users with an open stream |

Client: `site/chat.html` (`?app=1` = the desktop RBXChat window, skinned per theme; without it, a normal
site page; `&channel=<id>` opens a room). Commands: `/me`, `/join #place-id`, `/part`, `/clear`, `/kick`, `/help`.

Avatar JSON:

```json
{ "colors": { "head": 24, "torso": 23, "leftArm": 24, "rightArm": 24, "leftLeg": 119, "rightLeg": 119 },
  "hats": ["ArrowHat.rbxm"], "face": "DefaultFace.rbxm", "head": "DefaultHead.rbxm",
  "shirt": "NoShirt.rbxm", "pants": "NoPants.rbxm", "tshirt": "NoTShirt.rbxm", "extra": "NoExtra.rbxm" }
```

Colors are BrickColor ids (from Novetus `PartColors.json`); items are Novetus charcustom file names; up to 3 hats.
