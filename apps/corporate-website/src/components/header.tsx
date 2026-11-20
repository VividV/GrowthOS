import Link from "next/link";
import { Button } from "@platform/ui";
import { APP_URL, COMPANY, SIGNUP_URL } from "@/lib/site";

export function Header({ product }: { product?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        {product ? (
          <Link href="/growth-os" className="flex items-center gap-2 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/growth-os.svg" alt="" className="h-7 w-7" /> Growth OS
          </Link>
        ) : (
          <Link href="/" className="font-semibold tracking-tight">{COMPANY}</Link>
        )}
        <nav className="flex items-center gap-1 text-sm">
          {product && (
            <span className="hidden items-center gap-1 md:flex">
              {[["#features", "Features"], ["#how", "How it works"], ["#pricing", "Pricing"], ["#faq", "FAQ"]].map(([h, l]) => (
                <a key={h} href={h} className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">{l}</a>
              ))}
            </span>
          )}
          {product ? (
            <>
              <a href={`${APP_URL}/login`} className="hidden rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground sm:inline">Sign in</a>
              <Button asChild size="sm"><a href={SIGNUP_URL}>Start free trial</a></Button>
            </>
          ) : (
            <Button asChild size="sm" variant="outline"><Link href="/growth-os">Growth OS</Link></Button>
          )}
        </nav>
      </div>
    </header>
  );
}
