import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "KinWillow — If anything happens to you, your family can find everything",
  description:
    "KinWillow is a guided, secure vault where you organise every account, subscription, document, and device your family would need — in about an hour. Not your passwords. The map to everything.",
  icons: { icon: "/favicon.png" },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
