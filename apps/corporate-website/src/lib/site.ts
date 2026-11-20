/** Brand configuration. The parent company name is still to be confirmed — set NEXT_PUBLIC_COMPANY_NAME. */
export const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME || "Your Company Ltd";
export const APP_URL = (process.env.NEXT_PUBLIC_GROWTH_OS_APP_URL || "http://localhost:3000").replace(/\/$/, "");
export const SIGNUP_URL = `${APP_URL}/register`;
export const DEMO_URL = `${APP_URL}/demo`;

export interface PublicPlan { code: string; name: string; description: string; price: number; currency: string; features: string[] }

/** Shown only if the plan catalogue can't be fetched — mirrors the seeded defaults. */
const FALLBACK: PublicPlan[] = [
  { code: "starter", name: "Starter", description: "For solo sellers getting organised.", price: 3500, currency: "NGN", features: ["1 user", "50 products", "100 customers", "100 orders / month", "Basic inventory & reports", "Limited AI insights"] },
  { code: "growth", name: "Growth", description: "For growing teams that need the full toolkit.", price: 7500, currency: "NGN", features: ["3 users", "500 products", "Unlimited customers & orders", "Advanced inventory & reports", "More AI assistant usage", "CSV exports"] },
  { code: "pro", name: "Pro", description: "For established businesses that run on data.", price: 15000, currency: "NGN", features: ["10 users", "Unlimited products, customers & orders", "Advanced reporting", "Highest AI allowance", "Priority support", "Additional business insights"] },
];

/** Reads public plans via the anon key (RLS exposes only active, public plans). Revalidated hourly. */
export async function getPlans(): Promise<PublicPlan[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return FALLBACK;
  try {
    const res = await fetch(`${url}/rest/v1/subscription_plans?select=code,name,description,price,currency,features&is_public=eq.true&is_active=eq.true&order=sort_order`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return FALLBACK;
    const rows = (await res.json()) as PublicPlan[];
    return rows.length ? rows.map((r) => ({ ...r, price: Number(r.price) })) : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export const naira = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
