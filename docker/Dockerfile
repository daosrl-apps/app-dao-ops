# syntax=docker/dockerfile:1.7
# Multi-stage Next.js standalone build — mismo patrón que sofia.
ARG NODE_VERSION=20-alpine

# ---------- 1. deps ----------
FROM node:${NODE_VERSION} AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --include=dev --no-audit --no-fund

# ---------- 2. builder ----------
FROM node:${NODE_VERSION} AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholders para que la validación Zod de env.ts no rompa el `next build`.
# Estos valores NO se usan en runtime — el compose carga el .env real.
ENV NODE_ENV=production \
    APP_URL=http://placeholder.local \
    DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
    AUTH_SECRET=build_phase_placeholder_at_least_32_characters_long_dummy
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# ---------- 3. runner ----------
FROM node:${NODE_VERSION} AS runner
RUN apk add --no-cache libc6-compat openssl tini su-exec
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# node_modules production-only completo — el standalone trae uno mínimo que no
# incluye prisma CLI (necesario para `migrate deploy` desde el compose run).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

COPY --chmod=0755 docker/entrypoint.sh /entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
CMD ["node", "server.js"]
