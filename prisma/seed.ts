/**
 * Seed inicial: crea (o re-pinea) el usuario admin desde ADMIN_NAME / ADMIN_INITIAL_PIN.
 *
 * Es idempotente: corre seguro en cada deploy. Si el admin ya existe, le
 * actualiza el PIN al valor del .env (útil si te lo olvidaste). Si no quisieras
 * eso, sacá la rama del update.
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_NAME ?? "Admin";
  const pin = process.env.ADMIN_INITIAL_PIN ?? "";

  if (!/^\d{6}$/.test(pin)) {
    throw new Error(
      "ADMIN_INITIAL_PIN debe ser exactamente 6 dígitos. Configurarlo en .env y volver a correr `npm run seed`."
    );
  }

  const pinHash = await bcrypt.hash(pin, 12);

  // Buscamos por nombre como key estable del seed; en producción real cada
  // usuario lo crea el admin desde la UI, pero acá necesitamos algo idempotente.
  const existing = await prisma.user.findFirst({ where: { name, role: Role.ADMIN } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { pinHash, isActive: true, failedAttempts: 0, lockedUntil: null },
    });
    console.log(`Admin "${name}" actualizado (PIN reseteado al de .env).`);
  } else {
    await prisma.user.create({
      data: { name, pinHash, role: Role.ADMIN, isActive: true },
    });
    console.log(`Admin "${name}" creado con PIN del .env.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
