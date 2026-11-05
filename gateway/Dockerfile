# CCIP-read gateway image. Build from the repo root (the gateway imports the @sereno/shared workspace):
#   fly deploy --config gateway/fly.toml --dockerfile gateway/Dockerfile .
FROM oven/bun:1.4.4-slim
WORKDIR /app
# Every workspace manifest, so bun can resolve the lockfile; only shared and gateway sources are copied.
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
WORKDIR /app/gateway
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "src/main.ts"]
