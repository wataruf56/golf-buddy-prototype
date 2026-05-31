# Multi-stage build for Next.js (standalone) on Cloud Run.
# Stage 1: install deps + build. Stage 2: tiny runtime image.

# ---- deps ----
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ----
FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js reads NEXT_PUBLIC_* at build time. They're injected by Cloud Build
# via --build-arg / substitutions (see cloudbuild.yaml). Non-public secrets
# are read at runtime from the Cloud Run environment, so they are NOT needed here.
ARG NEXT_PUBLIC_LIFF_ID
ARG NEXT_PUBLIC_LINE_BOT_BASIC_ID
ARG NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_LIFF_ID=$NEXT_PUBLIC_LIFF_ID \
    NEXT_PUBLIC_LINE_BOT_BASIC_ID=$NEXT_PUBLIC_LINE_BOT_BASIC_ID \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080
# Standalone output: a minimal server + only the node_modules it needs.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 8080
# server.js is emitted by Next.js standalone output at the repo root.
CMD ["node", "server.js"]
