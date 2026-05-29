/**
 * Seed: gestiona el usuario admin a partir de variables de entorno.
 *
 * Soporta dos modos para no romper el deploy mientras se migra de la fase 1
 * (admin solo con PIN) a la fase 2 (admin con username+password):
 *
 *   - `ADMIN_USERNAME` + `ADMIN_PASSWORD` (≥8 chars) → setea/actualiza
 *     username+passwordHash. Este es el modo "spec".
 *   - `ADMIN_INITIAL_PIN` (6 dígitos, legacy) → setea/actualiza el PIN.
 *
 * Si ambos están seteados, aplica los dos. Si ninguno, no hace nada (deploy
 * pasa, el admin puede setearse después por la UI o relanzando el seed con
 * el .env actualizado).
 *
 * Idempotente: si el admin existe lo actualiza, si no lo crea.
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_NAME ?? "Admin";
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const pin = process.env.ADMIN_INITIAL_PIN;

  const tienePassword = !!username && !!password;
  const tienePin = !!pin && /^\d{6}$/.test(pin);

  if (!tienePassword && !tienePin) {
    console.log(
      "Seed: ni ADMIN_USERNAME/ADMIN_PASSWORD ni ADMIN_INITIAL_PIN seteados — no se toca el admin.",
    );
    return;
  }

  if (tienePassword && (password!.length < 8 || !/^[a-zA-Z0-9._-]{3,40}$/.test(username!))) {
    throw new Error(
      "ADMIN_USERNAME debe ser 3-40 chars (letras/números/._-) y ADMIN_PASSWORD ≥8 caracteres.",
    );
  }

  const data: {
    name: string;
    role: Role;
    isActive: boolean;
    failedAttempts: number;
    lockedUntil: null;
    pinHash?: string;
    username?: string;
    passwordHash?: string;
  } = {
    name,
    role: Role.ADMIN,
    isActive: true,
    failedAttempts: 0,
    lockedUntil: null,
  };

  if (tienePassword) {
    data.username = username;
    data.passwordHash = await bcrypt.hash(password!, 12);
  }
  if (tienePin) {
    data.pinHash = await bcrypt.hash(pin!, 12);
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        username ? { username } : { id: "__never__" },
        { name, role: Role.ADMIN },
      ],
    },
  });

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data });
    console.log(`Admin actualizado (${tienePassword ? "username+password" : ""}${tienePassword && tienePin ? " + " : ""}${tienePin ? "PIN" : ""}).`);
  } else {
    await prisma.user.create({ data });
    console.log(`Admin creado (${tienePassword ? "username+password" : ""}${tienePassword && tienePin ? " + " : ""}${tienePin ? "PIN" : ""}).`);
  }

  await seedTurnos();
}

/**
 * Seed de los 3 turnos por defecto (Mañana 06-14, Tarde 14-22, Noche 22-06),
 * solo si la tabla está vacía. No pisa una configuración existente.
 */
async function seedTurnos() {
  const count = await prisma.turno.count();
  if (count > 0) {
    console.log(`Turnos: ya hay ${count} configurado(s) — no se tocan.`);
    return;
  }
  await prisma.turno.createMany({
    data: [
      { orden: 1, nombre: "Mañana", horaInicio: 6, minutoInicio: 0, duracionMin: 480, habilitado: true },
      { orden: 2, nombre: "Tarde", horaInicio: 14, minutoInicio: 0, duracionMin: 480, habilitado: true },
      { orden: 3, nombre: "Noche", horaInicio: 22, minutoInicio: 0, duracionMin: 480, habilitado: true },
    ],
  });
  console.log("Turnos: creados 3 turnos por defecto (Mañana/Tarde/Noche).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
