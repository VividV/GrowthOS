import pg from "pg";
import { inject } from "vitest";

let pool;
export function db() {
  pool ??= new pg.Pool({ connectionString: inject("dbUrl"), max: 4 });
  return pool;
}
export async function closeDb() {
  await pool?.end();
  pool = undefined;
}

/** Superuser query (test setup/assertions only — bypasses RLS). */
export async function sql(text, params = []) {
  return (await db().query(text, params)).rows;
}

let n = 0;
export async function createUser(name = "User") {
  n += 1;
  const email = `${name.toLowerCase().replace(/\W/g, "")}.${Date.now()}.${n}@test.local`;
  const [u] = await sql(
    `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`,
    [email, { full_name: name }],
  );
  return { id: u.id, email };
}

/** Run queries as a signed-in Supabase user (role authenticated + JWT claims), exactly as PostgREST does. */
export async function as(user, fn) {
  const client = await db().connect();
  try {
    await client.query("begin");
    if (user === "anon") {
      await client.query("set local role anon");
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    } else if (user === "service") {
      await client.query("set local role service_role");
      await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    } else {
      await client.query("set local role authenticated");
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: user.id, role: "authenticated", email: user.email }),
      ]);
    }
    const q = async (text, params = []) => (await client.query(text, params)).rows;
    const result = await fn(q);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Call a public RPC with named args as the given user. */
export async function rpc(user, fn, args = {}) {
  const keys = Object.keys(args);
  const call = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  return as(user, async (q) => (await q(call, keys.map((k) => args[k])))[0].r);
}

/** Call a set-returning RPC. */
export async function rpcRows(user, fn, args = {}) {
  const keys = Object.keys(args);
  const call = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
  return as(user, (q) => q(call, keys.map((k) => args[k])));
}

export async function newWorkspace(name = "Owner", biz = "Test Biz") {
  const user = await createUser(name);
  const org = await rpc(user, "create_workspace", { p: { name: biz, category: "Fashion" } });
  return { user, org };
}

export async function product(user, org, overrides = {}) {
  return rpc(user, "create_product", {
    p_org: org,
    p: { name: "Widget", cost_price: 400, selling_price: 1000, opening_quantity: 10, ...overrides },
  });
}

export async function variantsOf(productId) {
  return sql(`select * from product_variants where product_id = $1 and is_active order by sku`, [productId]);
}

export async function order(user, org, items, extra = {}) {
  return rpc(user, "create_order", { p_org: org, p: { items, ...extra } });
}

export async function orderRow(id) {
  return (await sql(`select * from orders where id = $1`, [id]))[0];
}

/** Add a teammate with the given role via the real invitation flow. */
export async function addMember(owner, org, role, name = "Member") {
  const user = await createUser(name);
  const hash = `hash-${user.id}`;
  await rpc(owner, "create_invitation", { p_org: org, p_email: user.email, p_role: role, p_token_hash: hash });
  await rpc(user, "accept_invitation", { p_token_hash: hash });
  return user;
}

/** Expect a promise to reject with an app SQLSTATE (GO403 etc). */
export async function expectCode(promise, code) {
  try {
    await promise;
  } catch (e) {
    if (e.code !== code) throw new Error(`Expected ${code}, got ${e.code}: ${e.message}`);
    return e;
  }
  throw new Error(`Expected ${code} but the call succeeded`);
}

export const num = (v) => (v === null || v === undefined ? v : Number(v));
