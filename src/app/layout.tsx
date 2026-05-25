import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "dao-ops",
  description: "Daily de línea — pintura en polvo",
};

// Tablets fijas en tótems: bloqueamos zoom y orientación para que el operario
// no la "destornille" sin querer.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1e40af",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
