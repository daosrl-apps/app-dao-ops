# dao-ops

Sistema de daily de la línea de producción de una empresa de pintura en polvo. Web tablet-first con login por PIN de 6 dígitos.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- PostgreSQL 16 + Prisma 6
- Auth: JWT firmado con `jose`, cookie httpOnly. PIN hasheado con bcrypt
- Docker Compose (dev + prod overlay)
- Deploy: GitHub Actions → SSH → Contabo VPS, detrás del nginx + certbot compartido de `eventosips`

Producción: https://dao-ops.beyondit.ar

## Desarrollo local

```bash
# 1. dependencies
npm install

# 2. .env
cp .env.example .env
# editar POSTGRES_PASSWORD, AUTH_SECRET, ADMIN_INITIAL_PIN

# 3. base de datos
docker compose up -d db
npm run prisma:migrate
npm run seed

# 4. app
npm run dev
# abrir http://localhost:3000
```

## Estructura

```
src/
├── app/              # rutas (App Router)
│   ├── login/        # keypad de PIN
│   ├── dashboard/    # placeholder protegido
│   ├── api/
│   │   ├── auth/     # login, logout
│   │   └── health/   # GET /api/health → {status:"ok"}
│   └── layout.tsx
├── components/
│   ├── pin-keypad.tsx
│   └── ui/           # button base
├── lib/
│   ├── auth.ts       # session helpers (jose)
│   ├── db.ts         # prisma client singleton
│   ├── env.ts        # zod env validation
│   └── pin.ts        # bcrypt hash/compare + lockout
└── middleware.ts     # protege /dashboard
prisma/
├── schema.prisma
└── seed.ts
docker/
├── Dockerfile        # multi-stage standalone
└── entrypoint.sh
nginx/
└── dao-ops.conf      # vhost para el nginx compartido
```

## Deploy

Push a `main` dispara `.github/workflows/deploy.yml`. SSH al VPS, `git pull`, `docker compose build`, `prisma migrate deploy`, `up -d --force-recreate web`, `nginx -s reload`.

Requiere secrets en el repo:
- `SSH_PRIVATE_KEY` — clave privada que matchea con la deploy key en `/home/claude/.ssh/dao_ops_deploy.pub` del server
- `SSH_HOST=161.97.110.140`
- `SSH_USER=claude`
- `SSH_KNOWN_HOSTS` — output de `ssh-keyscan 161.97.110.140`
