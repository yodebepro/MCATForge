// MCAT Block Trainer — small web server with its own login.
// Your Claude account is never used here: you sign in with a trainer username + passcode.
//
// Settings (set these in Render → Environment, never in GitHub):
//   DATABASE_URL   Postgres connection string (e.g. from Neon). If missing, data is kept in ./data/store.json (fine for testing on your own computer).
//   SIGNUP_CODE    Code needed to create an account. If missing, nobody can create an account.
//   PORT           Set automatically by Render.

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const SIGNUP_CODE = (process.env.SIGNUP_CODE || "").trim();
const SESSION_DAYS = 60;

// ---------- passcodes ----------
function hashPass(pass, salt = crypto.randomBytes(16).toString("hex")) {
  const h = crypto.scryptSync(pass, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$${salt}$${h}`;
}
function checkPass(pass, stored) {
  const [kind, salt, h] = String(stored).split("$");
  if (kind !== "scrypt") return false;
  const got = Buffer.from(hashPass(pass, salt).split("$")[2], "hex");
  const want = Buffer.from(h, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const tokenHash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---------- storage ----------
// Every user's data is a set of items: kind = state | blocks | figs | texts, plus an id.
function makePgStore(url) {
  const { Pool } = require("pg");
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
  return {
    name: "postgres",
    async init() {
      await pool.query(`
        create table if not exists mbt_users (id text primary key, username text unique not null, pass text not null, created timestamptz default now());
        create table if not exists mbt_sessions (token text primary key, user_id text not null references mbt_users(id) on delete cascade, expires timestamptz not null);
        create table if not exists mbt_items (user_id text not null references mbt_users(id) on delete cascade, kind text not null, id text not null, data jsonb not null, updated timestamptz default now(), primary key (user_id, kind, id));
      `);
      await pool.query("delete from mbt_sessions where expires < now()");
    },
    async getUserByName(name) { return (await pool.query("select * from mbt_users where username=$1", [name])).rows[0] || null; },
    async addUser(u) {
      try { await pool.query("insert into mbt_users (id, username, pass) values ($1,$2,$3)", [u.id, u.username, u.pass]); return true; }
      catch (e) { if (e.code === "23505") return false; throw e; }
    },
    async addSession(hash, userId, expires) { await pool.query("insert into mbt_sessions values ($1,$2,$3)", [hash, userId, expires]); },
    async getSession(hash) {
      const r = (await pool.query("select s.user_id, s.expires, u.username from mbt_sessions s join mbt_users u on u.id=s.user_id where s.token=$1", [hash])).rows[0];
      return r ? { userId: r.user_id, expires: new Date(r.expires), username: r.username } : null;
    },
    async delSession(hash) { await pool.query("delete from mbt_sessions where token=$1", [hash]); },
    async put(userId, kind, id, data) {
      await pool.query(`insert into mbt_items (user_id, kind, id, data, updated) values ($1,$2,$3,$4,now())
        on conflict (user_id, kind, id) do update set data=excluded.data, updated=now()`, [userId, kind, id, JSON.stringify(data)]);
    },
    async get(userId, kind, id) { const r = (await pool.query("select data from mbt_items where user_id=$1 and kind=$2 and id=$3", [userId, kind, id])).rows[0]; return r ? r.data : null; },
    async del(userId, kind, id) { await pool.query("delete from mbt_items where user_id=$1 and kind=$2 and id=$3", [userId, kind, id]); },
    async all(userId, kind) { return (await pool.query("select id, data from mbt_items where user_id=$1 and kind=$2", [userId, kind])).rows; },
  };
}

function makeFileStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let db = { users: {}, sessions: {}, items: {} };
  try { db = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
  let t = null;
  const save = () => { clearTimeout(t); t = setTimeout(() => { const tmp = file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, file); }, 200); };
  const bucket = (u, k) => ((db.items[u] ||= {})[k] ||= {});
  return {
    name: "file " + file,
    async init() {},
    async getUserByName(name) { return Object.values(db.users).find((u) => u.username === name) || null; },
    async addUser(u) { if (await this.getUserByName(u.username)) return false; db.users[u.id] = u; save(); return true; },
    async addSession(hash, userId, expires) { db.sessions[hash] = { userId, expires: expires.toISOString() }; save(); },
    async getSession(hash) { const s = db.sessions[hash]; if (!s) return null; return { userId: s.userId, expires: new Date(s.expires), username: db.users[s.userId]?.username }; },
    async delSession(hash) { delete db.sessions[hash]; save(); },
    async put(u, k, id, data) { bucket(u, k)[id] = data; save(); },
    async get(u, k, id) { return bucket(u, k)[id] ?? null; },
    async del(u, k, id) { delete bucket(u, k)[id]; save(); },
    async all(u, k) { return Object.entries(bucket(u, k)).map(([id, data]) => ({ id, data })); },
  };
}

const store = process.env.DATABASE_URL ? makePgStore(process.env.DATABASE_URL) : makeFileStore(path.join(__dirname, "data", "store.json"));

// ---------- slow down passcode guessing ----------
const tries = new Map(); // key -> {n, until}
function limited(key) { const t = tries.get(key); return t && t.until > Date.now() && t.n >= 8; }
function failed(key) {
  const t = tries.get(key) || { n: 0, until: 0 };
  if (t.until < Date.now()) { t.n = 0; }
  t.n++; t.until = Date.now() + 15 * 60 * 1000; tries.set(key, t);
}
setInterval(() => { const now = Date.now(); for (const [k, t] of tries) if (t.until < now) tries.delete(k); }, 10 * 60 * 1000).unref();

// ---------- app ----------
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Frame-Options", "SAMEORIGIN");
  next();
});
app.use("/api", express.json({ limit: "25mb", strict: false }));
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

const fail = (res, status, error, message) => res.status(status).json({ error, message });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function newSession(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  await store.addSession(tokenHash(token), user.id, new Date(Date.now() + SESSION_DAYS * 864e5));
  return token;
}
const cleanName = (u) => String(u || "").trim().toLowerCase();

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/register", wrap(async (req, res) => {
  const { username, passcode, signupCode } = req.body || {};
  const ip = req.ip;
  if (limited("reg:" + ip)) return fail(res, 429, "too_many", "Too many tries. Wait 15 minutes and try again.");
  if (!SIGNUP_CODE) return fail(res, 403, "signup_closed", "New accounts are turned off on this server.");
  if (!safeEq(tokenHash(String(signupCode || "").trim()), tokenHash(SIGNUP_CODE))) { failed("reg:" + ip); return fail(res, 403, "bad_code", "That signup code isn't right."); }
  const name = cleanName(username);
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) return fail(res, 400, "bad_name", "Usernames are 3–32 letters, numbers, dots, dashes or underscores.");
  if (typeof passcode !== "string" || passcode.length < 8 || passcode.length > 200) return fail(res, 400, "weak", "Use a passcode of at least 8 characters.");
  const user = { id: crypto.randomUUID(), username: name, pass: hashPass(passcode) };
  if (!(await store.addUser(user))) return fail(res, 409, "taken", "That username is already taken.");
  res.json({ token: await newSession(user), username: name });
}));

app.post("/api/login", wrap(async (req, res) => {
  const { username, passcode } = req.body || {};
  const name = cleanName(username);
  const keys = ["ip:" + req.ip, "user:" + name];
  if (keys.some(limited)) return fail(res, 429, "too_many", "Too many wrong tries. Wait 15 minutes and try again.");
  const user = await store.getUserByName(name);
  const ok = user ? checkPass(String(passcode || ""), user.pass) : (hashPass("x"), false); // same work either way
  if (!ok) { keys.forEach(failed); return fail(res, 401, "bad_login", "That username or passcode isn't right."); }
  keys.forEach((k) => tries.delete(k));
  res.json({ token: await newSession(user), username: user.username });
}));

// everything below needs a signed-in user
app.use("/api", wrap(async (req, res, next) => {
  const m = /^Bearer (.+)$/.exec(req.get("Authorization") || "");
  if (!m) return fail(res, 401, "signed_out", "Please sign in.");
  const hash = tokenHash(m[1]);
  const s = await store.getSession(hash);
  if (!s || s.expires < new Date()) { if (s) await store.delSession(hash); return fail(res, 401, "signed_out", "Please sign in again."); }
  req.user = { id: s.userId, username: s.username }; req.tokenHash = hash;
  next();
}));

app.post("/api/logout", wrap(async (req, res) => { await store.delSession(req.tokenHash); res.json({ ok: true }); }));

app.get("/api/me", (req, res) => res.json({ username: req.user.username }));

app.get("/api/data", wrap(async (req, res) => {
  const u = req.user.id;
  const [state, blocks, figs] = await Promise.all([store.get(u, "state", "main"), store.all(u, "blocks"), store.all(u, "figs")]);
  res.json({ state, blocks: blocks.map((r) => r.data), figs: Object.fromEntries(figs.map((r) => [r.id, r.data])) });
}));

app.put("/api/state", wrap(async (req, res) => { await store.put(req.user.id, "state", "main", req.body || {}); res.json({ ok: true }); }));

const okId = (id) => typeof id === "string" && id.length > 0 && id.length <= 200;
for (const kind of ["blocks", "figs", "texts"]) {
  app.get(`/api/${kind}/:id`, wrap(async (req, res) => {
    if (!okId(req.params.id)) return fail(res, 400, "bad_id", "Bad id.");
    const d = await store.get(req.user.id, kind, req.params.id);
    if (d == null) return fail(res, 404, "not_found", "Not found.");
    res.json(d);
  }));
  app.put(`/api/${kind}/:id`, wrap(async (req, res) => {
    if (!okId(req.params.id)) return fail(res, 400, "bad_id", "Bad id.");
    await store.put(req.user.id, kind, req.params.id, req.body ?? null);
    res.json({ ok: true });
  }));
  app.delete(`/api/${kind}/:id`, wrap(async (req, res) => {
    if (!okId(req.params.id)) return fail(res, 400, "bad_id", "Bad id.");
    await store.del(req.user.id, kind, req.params.id);
    res.json({ ok: true });
  }));
}

app.use("/api", (req, res) => fail(res, 404, "not_found", "Not found."));

// the app itself
const pub = path.join(__dirname, "public");
app.use(express.static(pub, {
  extensions: ["html"],
  setHeaders(res, file) {
    if (file.endsWith(".html")) res.set("Cache-Control", "no-cache");
    else res.set("Cache-Control", "public, max-age=86400");
    if (file.endsWith(".wasm")) res.set("Content-Type", "application/wasm");
  },
}));

app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return fail(res, 413, "too_large", "That item is too big to save.");
  if (err.type === "entity.parse.failed") return fail(res, 400, "bad_json", "The server couldn't read that.");
  console.error(err);
  fail(res, 500, "server_error", "Something went wrong on the server.");
});

store.init().then(() => {
  app.listen(PORT, () => console.log(`MCAT Block Trainer on port ${PORT} — storage: ${store.name}${SIGNUP_CODE ? "" : " — signups OFF (set SIGNUP_CODE)"}`));
}).catch((e) => { console.error("Couldn't start storage:", e.message); process.exit(1); });
