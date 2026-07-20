# Multi-stage build: dev deps only exist in the builder; the runtime image
# carries production deps (including the pinned Prisma CLI the entrypoint's
# `migrate deploy` runs), the generated Prisma client, and runs as the
# unprivileged node user.
FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# Only what `prisma generate` needs: source edits must not invalidate the
# builder's layers.
COPY package*.json prisma.config.js ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts
RUN npx prisma generate

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY . .
RUN chown -R node:node /app
USER node

# Liveness for BOTH process types (no curl in slim - use node's fetch):
# the web process answers /health on PORT, the worker process serves a
# minimal /health on WORKER_HEALTH_PORT (see worker.js).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD sh -c 'if [ "${PROCESS_TYPE:-web}" = "worker" ]; then node -e "fetch(\"http://localhost:\"+(process.env.WORKER_HEALTH_PORT||8081)+\"/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; else node -e "fetch(\"http://localhost:\"+(process.env.PORT||8080)+\"/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; fi'

EXPOSE 8080
ENTRYPOINT ["./docker-entrypoint.sh"]
