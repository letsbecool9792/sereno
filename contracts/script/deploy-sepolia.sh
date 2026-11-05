#!/bin/sh
# Ethereum Sepolia needs special handling (its newer fork makes contract creation ~5-7x pricier than on L2s):
#  - Forge's local gas estimates are far too low there, so each deploy is sent with the node's own estimate;
#  - fees are set explicitly (the base fee is a few wei; Forge's default 1 gwei tip overpays ~40,000x);
#  - Ed25519Verifier exceeds the per-transaction gas cap there and is skipped (SKIP_ED25519; addresses unchanged).
# Same salts and constructor arguments as Deploy.s.sol, so the addresses match the other chains.
#
#   DEPLOYER_KEY=0x... sh script/deploy-sepolia.sh        (from contracts/; needs forge and cast on PATH)
set -e
R=${SEPOLIA_RPC:-https://ethereum-sepolia-rpc.publicnode.com}
D=0x4e59b44847b379578588920ca78fbf26c0b4956c
FEES="--gas-price 2000 --priority-gas-price 100"
OWNER=$(cast wallet address --private-key "$DEPLOYER_KEY")
salt() { cast keccak "sereno/v1/$1"; }
initcode() { echo "$(forge inspect "$1" bytecode)$(cast abi-encode "$2" $3 | cut -c3-)"; }
addr() { cast compute-address $D --salt "$(salt "$1")" --init-code "$2" | awk '{print $NF}'; } # name initcode
deploy() { # name initcode
  a=$(addr "$1" "$2")
  if [ "$(cast code "$a" --rpc-url "$R")" != "0x" ]; then echo "$1 $a (already deployed)"; return; fi
  gas=$(cast estimate --rpc-url "$R" --from "$OWNER" $D "$(salt "$1")${2#0x}")
  cast send --rpc-url "$R" --private-key "$DEPLOYER_KEY" --gas-limit $((gas * 12 / 10)) $FEES $D "$(salt "$1")${2#0x}" >/dev/null
  # public RPCs are load-balanced: wait until the code is visible so the next send doesn't reuse a stale nonce
  i=0; while [ "$(cast code "$a" --rpc-url "$R")" = "0x" ] && [ $i -lt 30 ]; do sleep 3; i=$((i + 1)); done
  echo "$1 $a (gas $gas)"
}
ED=$(addr Ed25519Verifier "$(forge inspect Ed25519Verifier bytecode)")
deploy SshSigVerifier "$(initcode SshSigVerifier 'x(address)' "$ED")"
V=$(addr SshSigVerifier "$(initcode SshSigVerifier 'x(address)' "$ED")")
deploy KeyOracle "$(initcode KeyOracle 'x(address)' "$OWNER")"
O=$(addr KeyOracle "$(initcode KeyOracle 'x(address)' "$OWNER")")
deploy AccountFactory "$(initcode AccountFactory 'x(address,address)' "$O $V")"
FWD=0x15fC6ae953E024d975e77382eEeC56A9101f9F88
if [ "$(cast call "$O" 'forwarder()(address)' --rpc-url "$R")" != "$FWD" ]; then
  cast send --rpc-url "$R" --private-key "$DEPLOYER_KEY" $FEES "$O" 'setForwarder(address)' $FWD >/dev/null
  echo "KeyOracle forwarder set to $FWD"
fi
