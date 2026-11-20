// Applies the local Supabase emulation bootstrap + all migrations to a fresh database.
// Usage: node scripts/db-apply.mjs [dbname]   (DATABASE_ADMIN_URL defaults to local postgres)
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const adminUrl = process.env.DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const db = process.argv[2] ?? "growth_os_local";

export async function resetDatabase(name = db) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [name]);
  await admin.query(`drop database if exists "${name}"`);
  await admin.query(`create database "${name}"`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(readFileSync(join(root, "supabase/tests/bootstrap.sql"), "utf8"));
  const dir = join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      const err = /** @type {any} */ (e);
      throw new Error(`Migration ${file} failed: ${err.message}${err.position ? ` (position ${err.position})` : ""}${err.where ? `\n${err.where}` : ""}`);
    }
  }
  await client.end();
  return url.toString();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  resetDatabase().then((u) => console.log(`Applied migrations to ${u}`)).catch((e) => { console.error(e.message); process.exit(1); });
}
