import type { Metadata, Viewport } from "next";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "KinWillow — If anything happens to you, your family can find everything",
  description:
    "KinWillow is a guided, secure vault where you organise every account, subscription, document, and device your family would need — in about an hour. Not your passwords. The map to everything.",
  icons: { icon: "/favicon.png", apple: "/icon-192.png" },
  manifest: "/manifest.webmanifest",
  applicationName: "KinWillow",
  appleWebApp: { capable: true, title: "KinWillow", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#2e5a3d",
  width: "device-width",
  initialScale: 1,
  // Lets the page use the full screen on phones with a notch when installed.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
        <PwaRegister />
      </body>
    </html>
  );
}
