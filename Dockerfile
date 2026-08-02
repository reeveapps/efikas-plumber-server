FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/plumbers?schema=public"
RUN pnpm prisma:generate
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json pnpm-lock.yaml prisma.config.ts docker-entrypoint.sh ./
COPY prisma ./prisma

EXPOSE 3001
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
