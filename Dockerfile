# syntax=docker/dockerfile:1
# Next.js standalone build for Alibaba Cloud ECS.
# Produces a self-contained `node server.js` image (no node_modules copy).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# helius-mcp is spawned via `npx helius-mcp@latest` at runtime — pre-install it
# so the image is self-contained and doesn't need network access on each spawn.
RUN npm install -g helius-mcp@latest
# Next.js standalone output (see next.config.ts output:"standalone").
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
