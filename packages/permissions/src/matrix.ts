/**
 * Role → permission matrix. MUST stay identical to public.role_permissions in
 * supabase/migrations/20261120000001_platform_core.sql — a DB test enforces parity.
 * The database is the enforcement point; this copy drives UI affordances only.
 */
export const PERMISSIONS = [
  "customers.read", "customers.write", "customers.delete", "customers.import",
  "products.read", "products.write", "products.delete", "inventory.adjust",
  "orders.read", "orders.write", "orders.cancel", "payments.record", "payments.refund",
  "finance.read", "finance.write", "reports.read",
  "tasks.read", "tasks.write", "tasks.assign", "ai.use",
  "members.manage", "settings.manage", "billing.manage", "audit.read", "data.export", "demo.reset",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export const ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

const all = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: all,
  admin: all.filter((p) => p !== "billing.manage"),
  manager: [
    "customers.read", "customers.write", "customers.delete", "customers.import",
    "products.read", "products.write", "products.delete", "inventory.adjust",
    "orders.read", "orders.write", "orders.cancel", "payments.record", "payments.refund",
    "finance.read", "finance.write", "reports.read",
    "tasks.read", "tasks.write", "tasks.assign", "ai.use", "data.export",
  ],
  staff: [
    "customers.read", "customers.write", "products.read", "inventory.adjust",
    "orders.read", "orders.write", "payments.record", "tasks.read", "tasks.write", "ai.use",
  ],
  viewer: ["customers.read", "products.read", "orders.read", "finance.read", "reports.read", "tasks.read"],
};

export const ROLE_LABELS: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full access including billing" },
  admin: { label: "Admin", description: "Everything except billing" },
  manager: { label: "Manager", description: "Runs operations and finance" },
  staff: { label: "Staff", description: "Customers, orders, payments and tasks — no finance" },
  viewer: { label: "Viewer", description: "Read-only access, e.g. for an accountant" },
};
