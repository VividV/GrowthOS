import type { Metadata, Viewport } from "next";
import { Toaster } from "@platform/ui";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Growth OS", template: "%s · Growth OS" },
  description: "The AI-powered operating system for small and growing businesses.",
  manifest: "/manifest.webmanifest",
  applicationName: "Growth OS",
  appleWebApp: { capable: true, title: "Growth OS", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b6b4f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-center" richColors closeButton />
        <ServiceWorker />
      </body>
    </html>
  );
}
