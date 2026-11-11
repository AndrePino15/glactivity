// Stand-in for Supabase (Auth + PostgREST) over PGlite running the real migrations.
import http from "node:http";
import crypto from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = process.argv[2];
const USER = { id: "11111111-1111-1111-1111-111111111111", email: "andre@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon; create role authenticated; grant usage on schema auth to authenticated;`);
await db.query("insert into auth.users (id, email) values ($1, $2)", [USER.id, USER.email]);
for (const f of readdirSync(MIGRATIONS).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
if (process.env.SEED) await db.exec(readFileSync(process.env.SEED, "utf8"));
// Supabase grants these by default.
await db.exec("grant usage on schema public to anon, authenticated; grant all on all tables in schema public to authenticated;");

let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));
const asAnon = (fn) => serial(async () => {
  await db.exec("set role anon; select set_config('request.jwt.claim.sub', '', false);");
  try { return await fn(); } finally { await db.exec("reset role;"); }
});
const asUser = (fn) => serial(async () => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER.id}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokens = new Set();
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const t = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, email: USER.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: crypto.randomUUID() })}.sig${crypto.randomUUID()}`;
  tokens.add(t);
  return { access_token: t, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r" + crypto.randomUUID(), user: USER };
}

const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error("bad identifier " + s); return `"${s}"`; };
function where(params, values) {
  const clauses = [];
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const m = raw.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|in|is|like|ilike)\.(.*)$/s);
    if (!m) throw new Error("unsupported filter " + key + "=" + raw);
    const [, not, op, val] = m;
    let c;
    if (op === "in") { values.push(val.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""))); c = `${ident(key)}::text = any($${values.length}::text[])`; }
    else if (op === "is") c = `${ident(key)} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`;
    else { values.push(val); const sym = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" }[op]; c = `${ident(key)} ${sym} $${values.length}`; }
    clauses.push(not ? `not (${c})` : c);
  }
  return clauses.length ? " where " + clauses.join(" and ") : "";
}
const selectList = (s) => !s || s === "*" ? "*" : s.split(",").map((c) => ident(c.trim())).join(", ");
const wrap = async (sql, values) => (await db.query(`with x as (${sql}) select row_to_json(x) as r from x`, values)).rows.map((r) => r.r);

async function rest(req, res, url, body) {
  const table = ident(url.pathname.replace("/rest/v1/", ""));
  const params = [...url.searchParams.entries()];
  const prefer = req.headers.prefer ?? "";
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const values = [];
  let rows;
  if (req.method === "GET" || req.method === "HEAD") {
    let sql = `select ${selectList(url.searchParams.get("select"))} from ${table}${where(params, values)}`;
    const order = url.searchParams.get("order");
    if (order) sql += " order by " + order.split(",").map((o) => { const [c, dir, nulls] = o.split("."); return `${ident(c)} ${dir === "desc" ? "desc" : "asc"}${nulls ? " " + nulls.replace("nulls", "nulls ") : ""}`; }).join(", ");
    if (url.searchParams.get("limit")) sql += ` limit ${Number(url.searchParams.get("limit"))}`;
    rows = await asUser(() => wrap(sql, values));
  } else if (req.method === "POST") {
    const list = Array.isArray(body) ? body : [body];
    const cols = [...new Set(list.flatMap((r) => Object.keys(r)))];
    values.push(JSON.stringify(list));
    let sql = `insert into ${table} (${cols.map(ident).join(", ")}) select ${cols.map(ident).join(", ")} from json_populate_recordset(null::${table}, $1)`;
    const conflict = url.searchParams.get("on_conflict");
    if (prefer.includes("resolution=ignore-duplicates")) sql += conflict ? ` on conflict (${conflict.split(",").map(ident).join(", ")}) do nothing` : " on conflict do nothing";
    else if (prefer.includes("resolution=merge-duplicates")) {
      const keys = conflict.split(",");
      sql += ` on conflict (${keys.map(ident).join(", ")}) do update set ${cols.filter((c) => !keys.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`;
    }
    rows = await asUser(() => wrap(sql + " returning *", values));
  } else if (req.method === "PATCH") {
    const cols = Object.keys(body);
    values.push(JSON.stringify(body));
    const sql = `update ${table} set (${cols.map(ident).join(", ")}) = (select ${cols.map(ident).join(", ")} from json_populate_record(null::${table}, $1))${where(params, values)} returning *`;
    rows = await asUser(() => wrap(cols.length === 1 ? sql.replace(/set \(([^)]+)\) = \(select ([^)]+?) from/, "set $1 = (select $2 from") : sql, values));
  } else if (req.method === "DELETE") {
    rows = await asUser(() => wrap(`delete from ${table}${where(params, values)} returning *`, values));
  }
  const headers = { "Content-Type": "application/json", "Content-Range": `0-${Math.max(rows.length - 1, 0)}/*` };
  if (single) {
    if (rows.length !== 1) { res.writeHead(406, headers); return res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `${rows.length} rows` })); }
    res.writeHead(200, headers); return res.end(JSON.stringify(rows[0]));
  }
  const minimal = req.method !== "GET" && !prefer.includes("return=representation");
  res.writeHead(minimal ? 201 : 200, headers);
  res.end(minimal ? "" : JSON.stringify(rows));
}

http.createServer(async (req, res) => {
  const cors = { "Access-Control-Allow-Origin": req.headers.origin ?? "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS,HEAD", "Access-Control-Expose-Headers": "Content-Range" };
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  let raw = ""; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, "http://x");
  if (process.env.LOG) console.log(req.method, req.url, (req.headers.authorization ?? "").slice(0, 20));
  const json = (s, d) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(d)); };
  try {
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password")
      return body.email === USER.email && body.password === "correct horse" ? json(200, session()) : json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    if (url.pathname === "/auth/v1/user") return tokens.has((req.headers.authorization ?? "").slice(7)) ? json(200, USER) : json(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
    if (url.pathname === "/__token") return json(200, (await db.query("select cron_token from private.push_config")).rows[0]);
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = ident(url.pathname.replace("/rest/v1/rpc/", ""));
      const names = Object.keys(body);
      const sql = `select public.${fn}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(", ")}) as r`;
      const signedIn = tokens.has((req.headers.authorization ?? "").slice(7));
      const run = () => db.query(sql, names.map((n) => body[n]));
      const result = await (signedIn ? asUser(run) : asAnon(run));
      return json(200, result.rows[0].r ?? null);
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      if (!tokens.has((req.headers.authorization ?? "").slice(7))) return json(401, { message: "JWT required" });
      return await rest(req, res, url, body);
    }
    json(404, { message: "not faked: " + url.pathname });
  } catch (e) {
    console.error(req.method, req.url, e.message);
    json(400, { code: e.code ?? "P0001", message: e.message, details: null, hint: null });
  }
}).listen(54321, () => console.log("fake supabase on 54321"));
