/**
 * Row shapes for the tables the apps read. Monetary values are `string`
 * because PostgREST returns numeric as JSON numbers that may lose precision
 * for very large values; we keep them as returned and format for display only.
 * All money arithmetic happens in SQL.
 */
export type Money = number | string;

export type OrderStatus = "draft" | "confirmed" | "processing" | "ready" | "dispatched" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "refunded";
export type SubscriptionState = "demo" | "trialing" | "active" | "past_due" | "expired" | "none";

export interface Organization {
  id: string; name: string; slug: string; currency: string; timezone: string; country: string;
  category: string | null; is_demo: boolean;
}

export interface WorkspaceContextRow {
  organization: Organization;
  role: "owner" | "admin" | "manager" | "staff" | "viewer";
  permissions: string[];
  has_growth_os: boolean;
  subscription: {
    state: SubscriptionState; status: string; plan_code: string; plan_name: string; price: Money;
    trial_ends_at: string | null; current_period_end: string | null; cancel_at_period_end: boolean; pending_plan_id: string | null;
  } | null;
  entitlements: Record<string, { enabled: boolean; limit: number | null }>;
  writable: boolean;
  business: { logo_path: string | null; stock_policy: string; allow_negative_stock: boolean; onboarded: boolean } | null;
}

export interface CustomerSummary {
  id: string; organization_id: string; customer_code: string; full_name: string; phone: string | null; email: string | null;
  location: string | null; address: string | null; notes: string | null; source: string | null; archived_at: string | null;
  created_at: string; total_orders: number; total_spent: Money; outstanding_balance: Money; last_purchase_date: string | null;
}

export interface Product {
  id: string; organization_id: string; category_id: string | null; name: string; sku: string | null; description: string | null;
  image_path: string | null; cost_price: Money; selling_price: Money; low_stock_threshold: number; has_variants: boolean;
  is_active: boolean; archived_at: string | null; created_at: string;
}

export interface VariantStock {
  variant_id: string; organization_id: string; product_id: string; product_name: string; variant_name: string; sku: string;
  category_id: string | null; quantity_on_hand: number; quantity_reserved: number; quantity_available: number;
  low_stock_threshold: number; cost_price: Money; selling_price: Money; is_default: boolean; has_variants: boolean; is_sellable: boolean;
}

export interface Order {
  id: string; organization_id: string; order_number: string; customer_id: string | null; status: OrderStatus;
  payment_status: PaymentStatus; stock_state: string; channel: string | null; order_date: string; expected_delivery_date: string | null;
  subtotal: Money; discount_amount: Money; delivery_fee: Money; total: Money; returns_total: Money; amount_paid: Money;
  amount_refunded: Money; balance_due: Money; cost_total: Money; notes: string | null; delivery_address: string | null;
  confirmed_at: string | null; dispatched_at: string | null; delivered_at: string | null; cancelled_at: string | null;
  cancel_reason: string | null; created_at: string;
}

export interface OrderItem {
  id: string; order_id: string; product_id: string; variant_id: string; product_name: string; variant_name: string | null;
  sku: string | null; quantity: number; unit_price: Money; unit_cost: Money; discount_amount: Money; line_total: Money; returned_quantity: number;
}

export interface Payment {
  id: string; order_id: string; customer_id: string | null; kind: "payment" | "refund"; amount: Money; method: string;
  reference: string | null; paid_at: string; notes: string | null; voided_at: string | null; void_reason: string | null;
}

export interface FollowUpTask {
  id: string; organization_id: string; title: string; description: string | null; customer_id: string | null; order_id: string | null;
  due_date: string; priority: "low" | "medium" | "high" | "urgent"; status: "open" | "in_progress" | "completed" | "cancelled";
  snoozed_until: string | null; assigned_to: string | null; completion_notes: string | null; completed_at: string | null;
  source: "manual" | "suggested"; suggestion_key: string | null; created_at: string;
}

export interface SalesSummary {
  period: { from: string; to: string }; currency: string; order_count: number; gross_sales: Money; discounts: Money;
  delivery_fees: Money; returns: Money; return_count: number; net_sales: Money; payments_received: Money; refunds: Money;
  cash_received: Money; outstanding_on_period_orders: Money; outstanding_total: Money; customers_owing: number;
  average_order_value: Money; orders_by_status: Record<string, number>;
  open_orders: { confirmed: number; processing: number; ready: number; dispatched: number };
  total_customers: number; new_customers: number; low_stock_count: number;
}

export interface FinancialSummary extends Omit<SalesSummary, "orders_by_status" | "open_orders" | "total_customers" | "new_customers" | "low_stock_count"> {
  cogs: Money; items_missing_cost: number; gross_profit: Money; gross_margin_pct: Money | null; operating_expenses: Money;
  other_income: Money; net_profit: Money; expense_count: number;
}
