#!/bin/sh
# Deploys the ReportGate (same CREATE2 address on every chain), configures it, then points the KeyOracle at it.
# Idempotent: every step checks the chain first, so rerun it if a public RPC drops a transaction.
#
#   DEPLOYER_KEY=0x... sh script/deploy-gate.sh base_sepolia|arbitrum_sepolia|sepolia   (from contracts/)
#
# Optional: BROADCASTERS="0xabc…,0xdef…" also allows those EOAs (other people's CRE_ETH_PRIVATE_KEY) to deliver.
set -e
case "$1" in
  base_sepolia) R=https://sepolia.base.org; FWD=0x82300bd7c3958625581cc2f77bc6464dcecdf3e5; WF=github-keys-base ;;
  arbitrum_sepolia) R=https://sepolia-rollup.arbitrum.io/rpc; FWD=0xd41263567ddfead91504199b8c6c87371e83ca5d; WF=github-keys-arbitrum ;;
  sepolia) R=https://ethereum-sepolia-rpc.publicnode.com; FWD=0x15fC6ae953E024d975e77382eEeC56A9101f9F88; WF=github-keys-sepolia ;;
  *) echo "usage: DEPLOYER_KEY=0x... sh script/deploy-gate.sh base_sepolia|arbitrum_sepolia|sepolia"; exit 1 ;;
esac
D=0x4e59b44847b379578588920ca78fbf26c0b4956c
SIM_OWNER=0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa # the workflow owner in every CRE simulation's metadata
json() { sed -n "s/.*\"$1\": *\"\(0x[0-9a-fA-F]*\)\".*/\1/p" deployments/core.json; }
ORACLE=$(json KeyOracle)
OWNER=$(json owner)
ME=$(cast wallet address --private-key "$DEPLOYER_KEY")
lower() { echo "$1" | tr 'A-F' 'a-f'; }
[ "$(lower "$ME")" = "$(lower "$OWNER")" ] || { echo "DEPLOYER_KEY is $ME, but the owner in core.json is $OWNER"; exit 1; }

# Sepolia: explicit fees (base fee is a few wei; the default tip overpays ~40,000x) and node gas estimates.
FEES=""
if [ "$1" = sepolia ]; then FEES="--gas-price $(( $(cast base-fee --rpc-url "$R") * 2 + 100 )) --priority-gas-price 100"; fi
send() { cast send --rpc-url "$R" --private-key "$DEPLOYER_KEY" $FEES "$@" >/dev/null; }

SALT=$(cast keccak "sereno/v1/ReportGate")
INIT="$(forge inspect ReportGate bytecode | tr -d '\r')$(cast abi-encode 'x(address)' "$OWNER" | cut -c3-)"
GATE=$(cast compute-address $D --salt "$SALT" --init-code "$INIT" | awk '{print $NF}')
if [ "$(cast code "$GATE" --rpc-url "$R")" = "0x" ]; then
  gas=$(cast estimate --rpc-url "$R" --from "$ME" $D "$SALT${INIT#0x}")
  send --gas-limit $((gas * 12 / 10)) $D "$SALT${INIT#0x}"
  i=0; while [ "$(cast code "$GATE" --rpc-url "$R")" = "0x" ] && [ $i -lt 30 ]; do sleep 3; i=$((i + 1)); done
  echo "ReportGate $GATE deployed (gas $gas)"
else
  echo "ReportGate $GATE (already deployed)"
fi

if [ "$(lower "$(cast call "$GATE" 'forwarder()(address)' --rpc-url "$R")")" != "$(lower "$FWD")" ]; then
  send "$GATE" 'setForwarder(address)' "$FWD"; echo "gate forwarder -> $FWD"
fi
for b in "$OWNER" $(echo "${BROADCASTERS:-}" | tr ',' ' '); do
  if [ "$(cast call "$GATE" 'broadcaster(address)(bool)' "$b" --rpc-url "$R")" != true ]; then
    send "$GATE" 'setBroadcaster(address,bool)' "$b" true; echo "broadcaster $b allowed"
  fi
done
NAME=$(cast call "$GATE" 'nameKey(string)(bytes10)' "$WF" --rpc-url "$R")
if [ "$(lower "$(cast call "$GATE" 'routeOf(bytes10,address)(address)' "$NAME" $SIM_OWNER --rpc-url "$R")")" != "$(lower "$ORACLE")" ]; then
  send "$GATE" 'setRoute(bytes10,address,address)' "$NAME" $SIM_OWNER "$ORACLE"; echo "route $WF ($NAME) -> KeyOracle"
fi
# Last, so the oracle never points at a gate that isn't ready.
if [ "$(lower "$(cast call "$ORACLE" 'forwarder()(address)' --rpc-url "$R")")" != "$(lower "$GATE")" ]; then
  send "$ORACLE" 'setForwarder(address)' "$GATE"; echo "KeyOracle forwarder -> gate"
fi
printf '{\n  "ReportGate": "%s"\n}\n' "$GATE" > deployments/gate.json
echo "done on $1"
