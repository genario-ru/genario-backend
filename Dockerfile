FROM node:22-alpine AS base
RUN npm install -g pnpm@10

FROM base AS builder
RUN apk add --no-cache gcompat
WORKDIR /app

# Копируем файлы зависимостей
COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json tsup.config.ts drizzle.config.ts auth.ts env.ts ./

# Копируем исходный код
COPY src ./src

# Дефолтные данные: tsup вшивает эти JSON в dist/seed.js, поэтому они нужны
# только при сборке и в рантайм-образ не копируются.
COPY data ./data

# Устанавливаем зависимости и собираем проект
RUN pnpm install --frozen-lockfile && \
    pnpm run build && \
    pnpm prune --production

FROM scratch AS dist-assets

COPY --from=builder /app/dist /app

FROM builder AS clean-dist

RUN find /app/dist -type f -name '*.map' -delete

FROM base AS runtime-base
WORKDIR /app

ARG GLITCHTIP_RELEASE
ENV GLITCHTIP_RELEASE=$GLITCHTIP_RELEASE

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

# Копируем собранные файлы и зависимости
COPY --from=builder --chown=hono:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=hono:nodejs /app/package.json /app/package.json

# SQL-миграции нужны программному мигратору (dist/migrate.js) в рантайме:
# drizzle-kit вырезан pnpm prune, поэтому migrate() читает файлы из этой папки.
# Путь сохраняем (src/db/migrations), чтобы он совпадал с локальным окружением.
COPY --from=builder --chown=hono:nodejs /app/src/db/migrations /app/src/db/migrations

USER hono
EXPOSE 3000

CMD ["pnpm", "run", "start"]

FROM runtime-base AS prebuilt-dist

ARG PREBUILT_DIST_DIR=.tmp/glitchtip-dist/app

COPY --chown=hono:nodejs ${PREBUILT_DIST_DIR}/ /app/dist

RUN find /app/dist -type f -name '*.map' -delete

FROM runtime-base AS runner

COPY --from=clean-dist --chown=hono:nodejs /app/dist /app/dist
