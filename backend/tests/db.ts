import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(import.meta.dirname, "../supabase/migrations");

/**
 * An in-memory Postgres with just enough of Supabase's auth schema stubbed in
 * (auth.users, auth.uid(), the authenticated role) to run our migrations and
 * exercise row level security.
 */
export async function createTestDb(options: { before?: (db: PGlite) => Promise<void> } = {}) {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role anon;
    create role authenticated;
    grant usage on schema auth to authenticated;
  `);
  await options.before?.(db);
  for (const file of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  // Supabase grants these by default; RLS is what actually restricts access.
  await db.exec(`
    grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
  `);
  return db;
}

/** Runs `fn` as a signed-in user, the way PostgREST would. */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}
