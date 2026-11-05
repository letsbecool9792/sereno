# One image for both hosted services; SERVICE picks which one runs (gateway by default, or relayer).
# Railway builds it through the root railway.json; each service sets its own variables:
#   gateway: GATEWAY_KEY, GITHUB_TOKEN, CACHE_FILE          relayer: SERVICE=relayer, RELAYER_KEY, GITHUB_TOKEN, WATCH_REPOS
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
COPY start.sh ./
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "/app/start.sh"]
