#!/bin/sh
# Entry point of the shared image: runs the relayer or the gateway.
# SERVICE=relayer|gateway decides; without it, a container given RELAYER_KEY and no GATEWAY_KEY is the relayer.
if [ "$SERVICE" = relayer ] || { [ -z "$SERVICE" ] && [ -n "$RELAYER_KEY" ] && [ -z "$GATEWAY_KEY" ]; }; then
  svc=relayer
else
  svc=gateway
fi
echo "sereno image (start.sh): starting $svc (SERVICE=${SERVICE:-unset})"
# Which settings arrived (names only, never values), to debug hosting variables.
for v in GATEWAY_KEY RELAYER_KEY GITHUB_TOKEN SYNC_WORKER_TOKEN WATCH_REPOS CACHE_FILE PORT; do
  eval "val=\${$v:-}"; [ -n "$val" ] && echo "  $v: set" || echo "  $v: not set"
done
echo "  WATCH_REPOS value: ${WATCH_REPOS:-}"
cd "/app/$svc" && exec bun src/main.ts
