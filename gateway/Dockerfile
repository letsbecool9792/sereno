# Same image as the root Dockerfile (kept here for gateway/fly.toml and any service still pointing at this path).
# SERVICE picks what runs: gateway (default) or relayer.
FROM oven/bun:1.4.4-slim
WORKDIR /app
# Every workspace manifest, so bun can resolve the lockfile; only the sources that run are copied.
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ops/package.json packages/ops/
COPY gateway/package.json gateway/
COPY relayer/package.json relayer/
COPY cli/package.json cli/
COPY web/package.json web/
RUN bun install --production --ignore-scripts
COPY packages/shared packages/shared
COPY gateway gateway
COPY relayer relayer
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "cd /app/${SERVICE:-gateway} && exec bun src/main.ts"]
