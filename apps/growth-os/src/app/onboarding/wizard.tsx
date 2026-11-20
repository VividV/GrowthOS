"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, ImagePlus, Rocket, Sparkles, Store } from "lucide-react";
import { Alert, Button, Card, CardContent, Field, Input, Select, Textarea, cn } from "@platform/ui";
import { completeOnboardingAction } from "@/server/workspace-actions";

const CATEGORIES = [
  "Fashion & Clothing", "Beauty & Cosmetics", "Hair & Wigs", "Social commerce", "Retail store",
  "Food & Beverages", "Electronics & Gadgets", "Home & Living", "Services", "Other",
];
const COUNTRIES = [
  { code: "NG", name: "Nigeria", currency: "NGN", tz: "Africa/Lagos" },
  { code: "GH", name: "Ghana", currency: "GHS", tz: "Africa/Accra" },
  { code: "KE", name: "Kenya", currency: "KES", tz: "Africa/Nairobi" },
  { code: "ZA", name: "South Africa", currency: "ZAR", tz: "Africa/Johannesburg" },
  { code: "GB", name: "United Kingdom", currency: "GBP", tz: "Europe/London" },
  { code: "US", name: "United States", currency: "USD", tz: "America/New_York" },
];
const STEPS = ["Business", "Profile", "Preferences", "Experience", "Finish"] as const;

type Data = {
  name: string; category: string; description: string; country: string; currency: string; timezone: string;
  business_email: string; phone: string; address: string;
  business_type: "products" | "services" | "both"; products_sold: string; product_count_range: string; employee_count_range: string;
  experience: "empty" | "demo";
};

export function OnboardingWizard({ firstName }: { firstName: string | null }) {
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState<File | null>(null);
  const [data, setData] = useState<Data>({
    name: "", category: "", description: "", country: "NG", currency: "NGN", timezone: "Africa/Lagos",
    business_email: "", phone: "", address: "", business_type: "products", products_sold: "",
    product_count_range: "", employee_count_range: "", experience: "empty",
  });
  const [state, submit, pending] = useActionState(completeOnboardingAction, null);
  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  const set = <K extends keyof Data>(k: K, v: Data[K]) => setData((d) => ({ ...d, [k]: v }));

  function validate(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (data.name.trim().length < 2) e.name = "Enter your business name";
      if (!data.category) e.category = "Choose a category";
    }
    if (s === 1) {
      if (data.business_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.business_email)) e.business_email = "Enter a valid email";
      if (logo && logo.size > 2 * 1024 * 1024) e.logo = "Logo must be 2 MB or smaller";
      if (logo && !["image/png", "image/jpeg", "image/webp"].includes(logo.type)) e.logo = "Use a PNG, JPEG or WebP image";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }
  const next = () => validate(step) && setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-primary">Step {step + 1} of {STEPS.length}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {step === 0 && (firstName ? `Welcome, ${firstName}. Tell us about your business` : "Tell us about your business")}
          {step === 1 && "How customers reach you"}
          {step === 2 && "How you work"}
          {step === 3 && "How would you like to start?"}
          {step === 4 && "You're all set"}
        </h1>
      </div>

      <ol className="grid grid-cols-5 gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="space-y-1.5">
            <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
            <span className={cn("hidden text-2xs sm:block", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>{s}</span>
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          {step === 0 && (
            <>
              <Field label="Business name" htmlFor="name" required error={errors.name}>
                <Input id="name" value={data.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Adaeze Styles" autoFocus aria-invalid={!!errors.name} />
              </Field>
              <Field label="Business category" htmlFor="category" required error={errors.category}>
                <Select id="category" value={data.category} onChange={(e) => set("category", e.target.value)} aria-invalid={!!errors.category}>
                  <option value="">Select a category</option>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Short description" htmlFor="description" hint="Optional — helps the AI assistant understand your business">
                <Textarea id="description" value={data.description} onChange={(e) => set("description", e.target.value)} placeholder="Ready-to-wear Ankara and adire pieces sold on Instagram and WhatsApp" maxLength={500} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Country" htmlFor="country">
                  <Select id="country" value={data.country} onChange={(e) => {
                    const c = COUNTRIES.find((x) => x.code === e.target.value)!;
                    setData((d) => ({ ...d, country: c.code, currency: c.currency, timezone: c.tz }));
                  }}>
                    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Currency" htmlFor="currency">
                  <Select id="currency" value={data.currency} onChange={(e) => set("currency", e.target.value)}>
                    {[...new Set(COUNTRIES.map((c) => c.currency))].map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Timezone" htmlFor="timezone">
                  <Select id="timezone" value={data.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    {[...new Set(COUNTRIES.map((c) => c.tz))].map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-subtle">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logoPreview ? <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" /> : <Building2 className="h-6 w-6 text-muted-foreground" />}
                </div>
                <Field label="Logo" htmlFor="logo" error={errors.logo} hint="PNG, JPEG or WebP, up to 2 MB. Optional.">
                  <label htmlFor="logo" className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent">
                    <ImagePlus className="h-4 w-4" /> {logo ? "Change logo" : "Upload logo"}
                  </label>
                  <input id="logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
                </Field>
              </div>
              <Field label="Business email" htmlFor="business_email" error={errors.business_email}>
                <Input id="business_email" type="email" inputMode="email" value={data.business_email} onChange={(e) => set("business_email", e.target.value)} placeholder="hello@yourbusiness.com" />
              </Field>
              <Field label="Phone number" htmlFor="phone">
                <Input id="phone" type="tel" inputMode="tel" value={data.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0803 000 0000" />
              </Field>
              <Field label="Business address" htmlFor="address">
                <Textarea id="address" value={data.address} onChange={(e) => set("address", e.target.value)} placeholder="Shop / street, area, city" className="min-h-[64px]" />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="What do you sell?">
                <div className="grid grid-cols-3 gap-2">
                  {(["products", "services", "both"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => set("business_type", t)}
                      className={cn("rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition", data.business_type === t ? "border-primary bg-primary-soft text-primary" : "hover:bg-accent")}>
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Products or services you sell" htmlFor="products_sold">
                <Input id="products_sold" value={data.products_sold} onChange={(e) => set("products_sold", e.target.value)} placeholder="Ankara shirts, kaftans, gele, accessories" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Approx. number of products" htmlFor="product_count_range">
                  <Select id="product_count_range" value={data.product_count_range} onChange={(e) => set("product_count_range", e.target.value)}>
                    <option value="">Select</option>
                    {["1-20", "21-50", "51-200", "201-500", "500+"].map((r) => <option key={r}>{r}</option>)}
                  </Select>
                </Field>
                <Field label="Number of employees" htmlFor="employee_count_range">
                  <Select id="employee_count_range" value={data.employee_count_range} onChange={(e) => set("employee_count_range", e.target.value)}>
                    <option value="">Select</option>
                    {["Just me", "2-5", "6-10", "11-50", "50+"].map((r) => <option key={r}>{r}</option>)}
                  </Select>
                </Field>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="grid gap-3">
              {([
                { v: "empty", icon: Store, title: "Start with my business", body: "A clean workspace for your real customers, products and orders." },
                { v: "demo", icon: Sparkles, title: "Explore a sample business first", body: "Look around a fully-populated demo fashion & beauty store. Your own workspace is created too — switch any time." },
              ] as const).map((o) => (
                <button key={o.v} type="button" onClick={() => set("experience", o.v)}
                  className={cn("flex items-start gap-4 rounded-xl border p-4 text-left transition", data.experience === o.v ? "border-primary bg-primary-soft/60 ring-1 ring-primary" : "hover:bg-accent")}>
                  <o.icon className={cn("mt-0.5 h-5 w-5", data.experience === o.v ? "text-primary" : "text-muted-foreground")} />
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold">{o.title}</span>
                    <span className="block text-sm text-muted-foreground">{o.body}</span>
                  </span>
                  {data.experience === o.v && <Check className="ml-auto h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          )}

          {step === 4 && (
            <form action={submit} className="space-y-4">
              <input type="hidden" name="payload" value={JSON.stringify(data)} />
              {logo && <LogoInput file={logo} />}
              <div className="flex items-start gap-3 rounded-lg bg-primary-soft p-4">
                <Rocket className="mt-0.5 h-5 w-5 text-primary" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">{data.name}</p>
                  <p className="text-muted-foreground">{data.category} · {data.currency} · {data.timezone}</p>
                  <p className="text-muted-foreground">Your <span className="font-medium text-foreground">7-day free trial</span> starts now. No card required, and we never charge automatically when it ends.</p>
                </div>
              </div>
              {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
              <Button type="submit" size="lg" className="w-full" loading={pending}>
                {data.experience === "demo" ? "Create workspace & open the demo" : "Create my workspace"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={step === 0 || pending}><ArrowLeft /> Back</Button>
        {step < 4 && <Button onClick={next}>Continue <ArrowRight /></Button>}
      </div>
    </div>
  );
}

/** Puts the selected File into a real file input so it submits with the form. */
function LogoInput({ file }: { file: File }) {
  return (
    <input
      type="file"
      name="logo"
      className="hidden"
      ref={(el) => {
        if (!el) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        el.files = dt.files;
      }}
    />
  );
}
