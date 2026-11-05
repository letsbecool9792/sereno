#!/bin/sh
# Regenerates the local SSHSIG fixtures with fresh throwaway keys (deleted afterwards; only public keys and
# signatures are kept). Run from this directory: sh gen.sh
set -e
T=$(mktemp -d)
printf 'tangerine fixture message\n' > message.txt
for k in ed25519 rsa ecdsa; do
  case $k in rsa) b="-b 3072";; ecdsa) b="-b 256";; *) b="";; esac
  ssh-keygen -q -t $k $b -N '' -C "fixture-$k" -f "$T/$k"
  cp "$T/$k.pub" "$k.pub"
  cp message.txt "$T/m"
  ssh-keygen -q -Y sign -n tangerine-test -O hashalg=sha256 -f "$T/$k" "$T/m"
  mv "$T/m.sig" "$k.sig"
  grep -v -- '-----' "$k.sig" | tr -d '\r\n' | base64 -d | xxd -p | tr -d '\n' > "$k.sig.hex"
  cut -d' ' -f2 "$k.pub" | base64 -d | xxd -p | tr -d '\n' > "$k.pub.hex"
done
rm -rf "$T"
