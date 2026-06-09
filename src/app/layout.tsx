import type { Metadata, Viewport } from "next";
import { Anton } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "dao-ops",
  description: "Daily de línea — pintura en polvo",
  // iOS "Agregar a inicio": nombre bajo el ícono + apertura fullscreen (sin
  // barra de Safari), pensado para las tablets/tótems de la planta. El ícono lo
  // genera Next a partir de src/app/apple-icon.png (apple-touch-icon 180×180).
  appleWebApp: {
    capable: true,
    title: "DAO Ops",
    statusBarStyle: "default",
  },
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

/**
 * La tipografía global del sitio es Impact (font de sistema). En dispositivos
 * que no la tienen (Android, Linux), Anton de Google Fonts es el fallback
 * inmediato — es visualmente muy parecida (condensada, alto contraste).
 * Tailwind ya tiene el stack completo configurado en tailwind.config.ts;
 * acá sólo nos aseguramos de que Anton esté disponible cargada por Next.
 */
const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-anton",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={anton.variable}>
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
