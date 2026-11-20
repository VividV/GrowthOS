import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: COMPANY, template: `%s · ${COMPANY}` },
  description: "Specialised AI-powered software for small and growing businesses across Africa.",
};
export const viewport: Viewport = { themeColor: "#0b6b4f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background">
        {children}
        <footer className="border-t bg-subtle">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <p className="font-semibold">{COMPANY}</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">We build specialised, AI-powered software that helps small and growing businesses run better — starting in Nigeria.</p>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Products</p>
              <Link href="/growth-os" className="block text-muted-foreground hover:text-foreground">Growth OS</Link>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Company</p>
              <Link href="/privacy" className="block text-muted-foreground hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="block text-muted-foreground hover:text-foreground">Terms</Link>
              <a href="mailto:hello@example.com" className="block text-muted-foreground hover:text-foreground">Contact</a>
            </div>
          </div>
          <p className="border-t py-5 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
