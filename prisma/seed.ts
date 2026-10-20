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

async function upsertPlantUser({
  name,
  username,
  password,
  pin,
  role = Role.ADMIN,
}: {
  name: string;
  username: string;
  password?: string;
  pin?: string;
  role?: Role;
}) {
  const data: {
    name: string;
    username: string;
    role: Role;
    isActive: boolean;
    failedAttempts: number;
    lockedUntil: null;
    pinHash?: string;
    passwordHash?: string;
  } = {
    name,
    username,
    role,
    isActive: true,
    failedAttempts: 0,
    lockedUntil: null,
  };

  if (password) {
    data.passwordHash = await bcrypt.hash(password, 12);
  }
  if (pin) {
    data.pinHash = await bcrypt.hash(pin, 12);
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: username, mode: "insensitive" } },
        { name: { equals: name, mode: "insensitive" } },
      ],
    },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...data,
        pinHash: data.pinHash ?? existing.pinHash,
      },
    });
    console.log(`Usuario '${username}' (${role}) actualizado.`);
  } else {
    await prisma.user.create({ data });
    console.log(`Usuario '${username}' (${role}) creado exitosamente.`);
  }
}

async function main() {
  console.log("==> Sincronizando usuarios de planta y administradores...");

  // 1. Luciano (Administrador de Planta, credenciales de DAO PLANTA)
  await upsertPlantUser({
    name: "Luciano",
    username: "luciano",
    password: "mesera1979",
    pin: "123456",
    role: Role.ADMIN,
  });

  // 2. Admin genérico por variables de entorno
  const envUser = process.env.ADMIN_USERNAME ?? "Admin";
  const envPass = process.env.ADMIN_PASSWORD ?? "admin1234";
  const envPin = process.env.ADMIN_INITIAL_PIN;
  await upsertPlantUser({
    name: process.env.ADMIN_NAME ?? "Admin",
    username: envUser,
    password: envPass,
    pin: envPin,
    role: Role.ADMIN,
  });

  // 3. Supervisores de planta (Rodrigo y Lautaro)
  await upsertPlantUser({
    name: "Rodrigo",
    username: "rodrigo",
    password: "28021980",
    role: Role.SUPERVISOR,
  });

  await upsertPlantUser({
    name: "Lautaro",
    username: "lautaro",
    password: "lautaro",
    role: Role.SUPERVISOR,
  });

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
