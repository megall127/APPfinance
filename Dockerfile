FROM node:24-alpine AS base
WORKDIR /app

# --- Stage 1: build (gera a pasta ./build autonoma da API) ---
FROM base AS build
COPY api/package*.json ./
RUN npm ci
COPY api/ ./
RUN npm run build

# --- Stage 2: dependencias de producao ---
FROM base AS production-deps
COPY api/package*.json ./
RUN npm ci --omit=dev

# --- Stage 3: imagem final ---
FROM base AS production
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./

EXPOSE 3333

# Roda as migrations e sobe o servidor
CMD ["sh", "-c", "node ace migration:run --force && node bin/server.js"]
