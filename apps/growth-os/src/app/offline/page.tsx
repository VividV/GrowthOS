import { WifiOff } from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo />
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-subtle">
        <WifiOff className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">You&apos;re offline</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Growth OS needs a connection to keep your records accurate. Reconnect and try again — nothing you saved has been lost.
        </p>
      </div>
      <a href="/dashboard" className="text-sm font-medium text-primary">Try again</a>
    </main>
  );
}
