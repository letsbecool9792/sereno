#!/bin/sh
# Entry point of the shared image: runs the relayer or the gateway.
# SERVICE=relayer|gateway decides; without it, a container given RELAYER_KEY and no GATEWAY_KEY is the relayer.
if [ "$SERVICE" = relayer ] || { [ -z "$SERVICE" ] && [ -n "$RELAYER_KEY" ] && [ -z "$GATEWAY_KEY" ]; }; then
  svc=relayer
else
  svc=gateway
fi
echo "sereno image (start.sh): starting $svc (SERVICE=${SERVICE:-unset})"
cd "/app/$svc" && exec bun src/main.ts
