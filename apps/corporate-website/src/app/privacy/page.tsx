import { Header } from "@/components/header";
import { COMPANY } from "@/lib/site";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl space-y-4 px-5 py-16 text-sm leading-relaxed text-muted-foreground">
        <h1 className="text-3xl font-semibold text-foreground">Privacy policy</h1>
        <p className="rounded-lg bg-warning-soft p-3 text-warning">Template — to be reviewed by a lawyer (including NDPA 2023 compliance) before launch.</p>
        <p>{COMPANY} (&quot;we&quot;) provides Growth OS. This policy explains what we collect and why.</p>
        <h2 className="pt-2 text-lg font-semibold text-foreground">What we collect</h2>
        <p>Account details (name, email), business information you enter, and the business records you create (customers, products, orders, payments, expenses). Payment card details are processed by Paystack and never stored by us.</p>
        <h2 className="pt-2 text-lg font-semibold text-foreground">How we use it</h2>
        <p>To provide the service, secure your account, process subscription payments, send service emails and improve the product with aggregated, non-identifying analytics. AI features process your records only to answer your own questions.</p>
        <h2 className="pt-2 text-lg font-semibold text-foreground">Your rights</h2>
        <p>You can access, export or ask us to delete your data. Contact hello@example.com.</p>
      </main>
    </>
  );
}
