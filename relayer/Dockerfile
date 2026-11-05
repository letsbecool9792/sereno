# Relayer image (HTTP API plus the repo watcher). Build from the repo root (it imports the @sereno/shared workspace).
# Railway: relayer/railway.json. Secrets come from the host's variables: RELAYER_KEY, GITHUB_TOKEN, WATCH_REPOS.
FROM oven/bun:1.4.4-slim
WORKDIR /app
# Every workspace manifest, so bun can resolve the lockfile; only shared and relayer sources are copied.
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ops/package.json packages/ops/
COPY gateway/package.json gateway/
COPY relayer/package.json relayer/
COPY cli/package.json cli/
COPY web/package.json web/
RUN bun install --production --ignore-scripts
COPY packages/shared packages/shared
COPY relayer relayer
WORKDIR /app/relayer
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "src/main.ts"]
