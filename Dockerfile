# syntax=docker/dockerfile:1.7
# ---------- Builder ----------
FROM node:20-alpine AS builder

WORKDIR /app

# OpenSSL is required by Prisma engines on Alpine
RUN apk add --no-cache openssl libc6-compat

# Install all deps (including dev) for build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy Prisma schema first so generate is cached when only src changes
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev deps to keep node_modules small for the runtime stage,
# but keep @prisma/client (already generated above).
RUN npm prune --omit=dev

# ---------- Runtime ----------
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

RUN apk add --no-cache openssl libc6-compat tini \
    && addgroup -S app && adduser -S app -G app

# Copy production artifacts only
COPY --from=builder /app/package.json        ./package.json
COPY --from=builder /app/package-lock.json   ./package-lock.json
COPY --from=builder /app/node_modules        ./node_modules
COPY --from=builder /app/prisma              ./prisma
COPY --from=builder /app/dist                ./dist

USER app

EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
