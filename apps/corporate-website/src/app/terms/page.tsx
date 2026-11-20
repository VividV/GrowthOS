import { Header } from "@/components/header";
import { COMPANY } from "@/lib/site";

export const metadata = { title: "Terms of service" };

export default function Terms() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl space-y-4 px-5 py-16 text-sm leading-relaxed text-muted-foreground">
        <h1 className="text-3xl font-semibold text-foreground">Terms of service</h1>
        <p className="rounded-lg bg-warning-soft p-3 text-warning">Template — to be reviewed by a lawyer before launch.</p>
        <p>These terms govern your use of Growth OS, provided by {COMPANY}.</p>
        <h2 className="pt-2 text-lg font-semibold text-foreground">Trial and subscriptions</h2>
        <p>New workspaces receive a 7-day free trial. We do not charge automatically at the end of the trial. Paid plans are billed monthly via Paystack and can be cancelled at any time; access continues until the end of the paid period. When a subscription ends, your workspace becomes read-only and your data is retained.</p>
        <h2 className="pt-2 text-lg font-semibold text-foreground">Financial figures</h2>
        <p>Growth OS provides management estimates (sales, cash, estimated profit). It is not a statutory accounting system and does not constitute financial or tax advice. AI-generated explanations are based on your records and may contain mistakes.</p>
        <h2 className="pt-2 text-lg font-semibold text-foreground">Your data</h2>
        <p>You own your business data. You may export it where your plan allows, and request deletion at any time.</p>
      </main>
    </>
  );
}
