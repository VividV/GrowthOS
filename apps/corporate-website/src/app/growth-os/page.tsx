import type { Metadata } from "next";
import {
  ArrowRight, BarChart3, Bell, Boxes, Check, ListTodo, MessageCircle, NotebookPen, Package, Scissors, ShieldCheck, ShoppingBag, Smartphone,
  Sparkle, Sparkles, Store, Users, Wallet,
} from "lucide-react";
import { Button } from "@platform/ui";
import { Header } from "@/components/header";
import { ChatPreview, DashboardPreview, PhonePreview } from "@/components/previews";
import { DEMO_URL, SIGNUP_URL, getPlans, naira } from "@/lib/site";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Growth OS — the AI-powered operating system for small businesses",
  description: "Customers, orders, inventory and finances in one place, with an AI assistant that understands your numbers. 7-day free trial. Built for Nigerian businesses.",
  openGraph: { title: "Growth OS", description: "Run your business. Understand your numbers. Grow with AI." },
};

const FEATURES = [
  { icon: Users, t: "Customer management", d: "Every customer with their orders, payments, balance and notes. Import from a spreadsheet in minutes." },
  { icon: ShoppingBag, t: "Orders & payments", d: "From WhatsApp enquiry to delivery. Part-payments, balances, refunds and returns calculated for you." },
  { icon: Package, t: "Products & variants", d: "Sizes, colours, lengths — each with its own SKU, price and stock level." },
  { icon: Boxes, t: "Inventory that adds up", d: "Stock is reserved when you confirm and deducted when you dispatch. Every movement is recorded." },
  { icon: Wallet, t: "Finance & profit", d: "Sales, cash received, expenses and estimated profit — clearly separated so you know your real numbers." },
  { icon: ListTodo, t: "Follow-ups", d: "Suggested reminders for unpaid balances, stale enquiries and customers due to buy again." },
  { icon: Sparkles, t: "AI business assistant", d: "Ask “What was my profit last month?” and get an answer calculated from your own records." },
  { icon: BarChart3, t: "Dashboard & reports", d: "Sales trends, top products, revenue vs expenses and insights for any period." },
];

const FAQ = [
  ["Do I need a card to start the free trial?", "No. Your 7-day trial gives you full access without payment details, and we never charge you automatically when it ends."],
  ["What happens when my trial ends?", "Your workspace becomes read-only until you choose a plan. Nothing is deleted — every customer, order and record is kept."],
  ["Does the AI make up numbers?", "No. The assistant can only read your business data through secure, permission-checked tools, and every figure is calculated by the system from your records. If something isn't recorded, it says so."],
  ["Can my staff use it?", "Yes. Invite team members with roles — for example, staff can take orders and payments without seeing your profit or expenses."],
  ["Does it work on my phone?", "Growth OS is designed for phones first. Install it to your home screen like an app — no app store needed."],
  ["Is my data safe?", "Each business's data is isolated at the database level, payments are processed by Paystack, and we never store card details."],
  ["Is this a full accounting system?", "No — it's a practical business management tool that gives you reliable management figures. Your accountant can export the records for statutory accounts."],
  ["How do I pay?", "Monthly in Naira via Paystack: card, bank transfer or USSD. Cancel any time."],
];

export default async function GrowthOS() {
  const plans = await getPlans();
  return (
    <>
      <Header product />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 [background:radial-gradient(60%_50%_at_70%_0%,hsl(152_60%_92%)_0%,transparent_70%)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium text-primary"><Sparkle className="h-3.5 w-3.5" /> Built for Nigerian businesses</p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">Run your business. Understand your numbers. Grow with AI.</h1>
              <p className="mt-5 text-lg text-muted-foreground">Growth OS brings your customers, orders, inventory and finances into one intelligent business management platform.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg"><a href={SIGNUP_URL}>Start your free 7-day trial <ArrowRight /></a></Button>
                <Button asChild size="lg" variant="outline"><a href={DEMO_URL}>Explore the demo</a></Button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">No card required · Cancel any time · From {naira(Math.min(...plans.map((p) => p.price)))}/month</p>
            </div>
            <DashboardPreview />
          </div>
        </section>

        {/* Problem / value proposition */}
        <section className="border-y bg-subtle">
          <div className="mx-auto max-w-6xl px-5 py-16 text-center">
            <h2 className="mx-auto max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">Stop managing your business across disconnected spreadsheets, notebooks and messaging apps.</h2>
            <p className="mt-3 text-lg text-muted-foreground">Start running your business from one place.</p>
            <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
              {[
                { icon: NotebookPen, t: "Before", d: "Orders in WhatsApp chats, stock in your head, debts in a notebook, profit a guess." },
                { icon: Store, t: "With Growth OS", d: "Every order, payment and item in one place — updated automatically as you sell." },
                { icon: BarChart3, t: "The result", d: "You know exactly what you sold, what you're owed, what to restock and what you earned." },
              ].map((x) => (
                <div key={x.t} className="rounded-xl border bg-background p-5">
                  <x.icon className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-semibold">{x.t}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{x.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key benefits with previews */}
        <section className="mx-auto max-w-6xl space-y-20 px-5 py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-primary">AI business assistant</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Ask your business anything.</h2>
              <p className="mt-3 text-muted-foreground">“How much did I sell this month?” “Which products are most profitable?” “What should I focus on this week?” Get clear answers calculated from your own records — with the source shown — not guesses.</p>
              <ul className="mt-5 space-y-2 text-sm">{["Answers from your real data only", "Says when something isn't recorded", "Respects staff permissions"].map((t) => <li key={t} className="flex gap-2"><Check className="h-4 w-4 text-primary" />{t}</li>)}</ul>
            </div>
            <ChatPreview />
          </div>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="lg:order-2">
              <p className="text-sm font-medium text-primary">Made for your phone</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Take an order in under a minute.</h2>
              <p className="mt-3 text-muted-foreground">Tap products, set quantities, record a part-payment and confirm. Stock updates itself, the balance is tracked, and your dashboard is instantly up to date. Install Growth OS to your home screen — no app store needed.</p>
              <ul className="mt-5 space-y-2 text-sm">{["One-handed order entry", "Quick stock adjustments in the store room", "Customer lookup with WhatsApp shortcuts"].map((t) => <li key={t} className="flex gap-2"><Smartphone className="h-4 w-4 text-primary" />{t}</li>)}</ul>
            </div>
            <PhonePreview />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-y bg-subtle">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-3xl font-semibold tracking-tight">Everything you need to run the business</h2>
            <p className="mt-2 text-muted-foreground">Connected features — record something once, and it flows everywhere.</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.t} className="rounded-xl border bg-background p-5">
                  <f.icon className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-semibold">{f.t}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {[
              ["Sign up free", "Create your account and tell us about your business. Takes two minutes."],
              ["Add products & customers", "Type them in or import a spreadsheet. Add sizes and colours as variants."],
              ["Record orders & payments", "From Instagram, WhatsApp or your shop. Stock and balances update automatically."],
              ["Understand & grow", "See your real profit, follow up on what matters and ask the AI for advice."],
            ].map(([t, d], i) => (
              <li key={t}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <p className="mt-4 font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Segments */}
        <section className="border-y bg-subtle">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Built for businesses like yours</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Scissors, t: "Fashion", d: "Track sizes and colours, custom orders and fabric stock." },
                { icon: Sparkles, t: "Beauty", d: "Manage skincare, hair and cosmetics with low-stock alerts." },
                { icon: MessageCircle, t: "Social-commerce sellers", d: "Turn Instagram and WhatsApp DMs into tracked orders." },
                { icon: Store, t: "Small retail", d: "Walk-in sales, stock counts and daily cash at a glance." },
              ].map((s) => (
                <div key={s.t} className="rounded-xl border bg-background p-5"><s.icon className="h-5 w-5 text-primary" /><p className="mt-3 font-semibold">{s.t}</p><p className="mt-1 text-sm text-muted-foreground">{s.d}</p></div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Simple monthly pricing</h2>
            <p className="mt-2 text-muted-foreground">Start with a 7-day free trial of the full product. No card required.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {plans.map((p) => {
              const hi = p.code === "growth";
              return (
                <div key={p.code} className={`flex flex-col rounded-2xl border bg-background p-6 ${hi ? "border-primary shadow-pop ring-1 ring-primary" : ""}`}>
                  <div className="flex items-center justify-between"><p className="font-semibold">{p.name}</p>{hi && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-2xs font-semibold text-primary">Most popular</span>}</div>
                  <p className="mt-3"><span className="text-4xl font-semibold tabular">{naira(p.price)}</span><span className="text-sm text-muted-foreground">/month</span></p>
                  <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{f}</li>)}</ul>
                  <Button asChild className="mt-6" variant={hi ? "default" : "outline"}><a href={SIGNUP_URL}>Start free trial</a></Button>
                </div>
              );
            })}
          </div>
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Payments by Paystack · No automatic charge after your trial</p>
        </section>

        {/* Demo CTA */}
        <section className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-[#06372a] p-8 text-white sm:p-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold">See it with a real-looking business first</h2>
              <p className="mt-2 max-w-xl text-emerald-50/80">Explore a sample fashion &amp; beauty store with customers, orders, stock and finances — and ask the AI about it. No details needed.</p>
            </div>
            <div className="flex gap-3">
              <Button asChild size="lg" className="bg-white text-[#06372a] hover:bg-emerald-50"><a href={DEMO_URL}>Explore the demo</a></Button>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-5 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
          <div className="mt-8 divide-y rounded-2xl border">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{q}<span className="text-muted-foreground transition group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-16 text-center">
            <Bell className="h-6 w-6 text-primary" />
            <h2 className="text-3xl font-semibold tracking-tight">Start running your business from one place.</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg"><a href={SIGNUP_URL}>Start your free 7-day trial</a></Button>
              <Button asChild size="lg" variant="outline"><a href={DEMO_URL}>Explore the demo</a></Button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
