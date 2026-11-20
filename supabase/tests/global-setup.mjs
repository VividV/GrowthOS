import { resetDatabase } from "../../scripts/db-apply.mjs";

/** Creates a fresh database, applies the Supabase emulation bootstrap and every migration. */
export default async function setup({ provide }) {
  const url = await resetDatabase("growth_os_test");
  provide("dbUrl", url);
}
