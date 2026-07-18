# syntax=docker/dockerfile:1
# Next.js standalone build for Alibaba Cloud ECS.
# Includes source/node_modules intentionally so proof/smoke scripts can run inside ECS.

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
ENV HELIUS_MCP_COMMAND=helius-mcp
# helius-mcp is installed at a pinned version for reproducible ECS builds. tsx is included
# so `npm run proof` works inside the deployed container for the Alibaba proof.
RUN npm install -g helius-mcp@2.1.0
# Next.js standalone output (see next.config.ts output:"standalone").
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Keep source + full node_modules available for proof/smoke scripts executed in
# the ECS container after deploy. This is larger than a pure standalone image,
# but acceptable for the short hackathon proof and avoids paid external services.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/alibaba ./alibaba
COPY --from=build /app/lib ./lib
COPY --from=build /app/agents ./agents
COPY --from=build /app/orchestrator ./orchestrator
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/benchmark ./benchmark
COPY --from=build /app/mcp-server ./mcp-server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
