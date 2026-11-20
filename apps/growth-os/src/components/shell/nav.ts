import type { Permission } from "@platform/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: "home" | "orders" | "customers" | "products" | "inventory" | "finance" | "tasks" | "ai" | "settings";
  permission?: Permission;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/orders", label: "Orders", icon: "orders", permission: "orders.read" },
  { href: "/customers", label: "Customers", icon: "customers", permission: "customers.read" },
  { href: "/products", label: "Products", icon: "products", permission: "products.read" },
  { href: "/inventory", label: "Inventory", icon: "inventory", permission: "products.read" },
  { href: "/finance", label: "Finance", icon: "finance", permission: "finance.read" },
  { href: "/tasks", label: "Follow-ups", icon: "tasks", permission: "tasks.read" },
  { href: "/assistant", label: "AI Assistant", icon: "ai", permission: "ai.use" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
