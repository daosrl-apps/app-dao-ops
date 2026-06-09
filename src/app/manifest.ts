import type { MetadataRoute } from "next";

/**
 * Web App Manifest — Android/Chrome lo usan para "Agregar a pantalla de inicio"
 * e instalación PWA (nombre, ícono, color de barra, apertura standalone).
 * Next lo sirve en /manifest.webmanifest y agrega el <link rel="manifest">.
 *
 * Los íconos son maskable (Android recorta el ícono en círculo/squircle): el
 * logo va con padding seguro sobre fondo sólido azul de marca. Ver public/icon-*.
 * El ícono de iOS es aparte (src/app/apple-icon.png), porque iOS no enmascara.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DAO Ops",
    short_name: "DAO Ops",
    description: "Daily de línea — pintura en polvo",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1627b1",
    theme_color: "#1627b1",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
