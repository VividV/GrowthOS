import type { Metadata } from "next";
import { Toaster } from "@platform/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Platform Admin", template: "%s · Platform Admin" },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-subtle">{children}<Toaster position="top-center" richColors /></body>
    </html>
  );
}
