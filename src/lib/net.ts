/**
 * Resolución de la IP del cliente detrás del proxy.
 *
 * IMPORTANTE: `X-Forwarded-For` es seteado por el cliente y APPENDEADO por
 * nuestro nginx (`$proxy_add_x_forwarded_for`), así que el primer valor de la
 * lista es spoofeable por quien hace la request. Para decisiones de seguridad
 * (rate-limit, lockout) usamos `X-Real-IP`, que nginx setea con `$remote_addr`
 * (la IP real de la conexión TCP) y el cliente no puede falsificar.
 *
 * Si en el futuro se cambia el proxy, revisar que siga seteando X-Real-IP.
 */
export function getClientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  // Fallback (dev sin proxy): primer hop del XFF. Spoofeable — solo para logs.
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return null;
}
