import Link from "next/link";
import { ArrowRight, Boxes, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@platform/ui";
import { Header } from "@/components/header";
import { COMPANY } from "@/lib/site";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-20 sm:pt-28">
          <p className="text-sm font-medium text-primary">{COMPANY}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Specialised software for the businesses that power Africa.</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">We build focused, AI-powered products for small and growing businesses — each one designed for a real job, sharing one secure platform underneath.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/growth-os">Explore Growth OS <ArrowRight /></Link></Button>
          </div>
        </section>
        <section className="border-y bg-subtle">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 md:grid-cols-3">
            {[
              { icon: Sparkles, t: "AI that knows your business", d: "Our assistants answer from your own records — never guesses — and work on the phones our customers actually use." },
              { icon: ShieldCheck, t: "Built for trust", d: "Every business's data is isolated at the database level. We never store card details. Your data stays yours." },
              { icon: Boxes, t: "One platform, many products", d: "Sign in once and use every product you need. New tools plug into the same identity, billing and security." },
            ].map((f) => (
              <div key={f.t} className="rounded-xl border bg-background p-6">
                <f.icon className="h-5 w-5 text-primary" />
                <p className="mt-4 font-semibold">{f.t}</p>
                <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Our products</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Link href="/growth-os" className="group rounded-2xl border p-6 transition hover:border-primary/40 hover:shadow-card">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/growth-os.svg" alt="" className="h-10 w-10" />
                <div><p className="font-semibold">Growth OS</p><p className="text-sm text-muted-foreground">The AI-powered operating system for small and growing businesses.</p></div>
              </div>
              <p className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">Learn more <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></p>
            </Link>
            <div className="rounded-2xl border border-dashed p-6 text-muted-foreground">
              <p className="font-semibold text-foreground">More on the way</p>
              <p className="mt-1 text-sm">New specialised products are in development on the same platform.</p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
