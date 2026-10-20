# --- Etapa 1: Construcción ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

# Placeholder para que la carga de `prisma.config.ts` durante la generación no falle
# por falta de DATABASE_URL. No se conecta a ninguna base; la URL real llega en runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

# `npm run build` ya ejecuta `prisma generate`, así que no se repite aquí.
RUN npm run build

# --- Etapa 2: Producción ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

# El cliente Prisma se genera en el builder (en src/generated) y se compila a dist,
# por eso en el runner se omiten devDependencies y los scripts (no hay CLI prisma).
RUN npm ci --omit=dev --ignore-scripts

# CLI de Prisma SOLO para aplicar migraciones en el arranque (migrate deploy es
# idempotente). Misma versión mayor que la del proyecto.
RUN npm install -g prisma@7.10.0

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY prisma.config.ts ./prisma.config.ts

EXPOSE 3000

# Railway (y cualquier otro orquestador) ejecuta migrate deploy antes de arrancar
# la app; DATABASE_URL llega del entorno.
CMD ["sh", "-c", "prisma migrate deploy && node dist/main.js"]