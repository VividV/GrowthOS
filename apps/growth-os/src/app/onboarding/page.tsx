import { redirect } from "next/navigation";
import { listWorkspaces, requireUser } from "@platform/auth";
import { Logo } from "@/components/logo";
import { OnboardingWizard } from "./wizard";

export const metadata = { title: "Set up your business" };
export const dynamic = "force-dynamic";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser("/onboarding");
  const sp = await searchParams;
  const workspaces = await listWorkspaces();
  // Users who already own a real business go to the dashboard unless they explicitly add another.
  if (workspaces.some((w) => !w.is_demo) && !sp.new) redirect("/dashboard");
  const firstName = ((user.user_metadata?.full_name as string | undefined) ?? "").split(" ")[0];

  return (
    <div className="min-h-dvh bg-subtle">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo />
        <span className="text-xs text-muted-foreground">{user.email}</span>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-4 sm:pt-10">
        <OnboardingWizard firstName={firstName || null} />
      </main>
    </div>
  );
}
