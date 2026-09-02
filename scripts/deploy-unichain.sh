#!/usr/bin/env bash
# Deploy to Unichain Sepolia (default) or Unichain mainnet.
#
#   ./scripts/deploy-unichain.sh
#   ./scripts/deploy-unichain.sh unichain
#   VERIFY=1 ./scripts/deploy-unichain.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

: "${PRIVATE_KEY:?set PRIVATE_KEY in .env}"

NETWORK="${1:-unichain_sepolia}"
case "$NETWORK" in
  unichain_sepolia) : "${UNICHAIN_SEPOLIA_RPC_URL:?set UNICHAIN_SEPOLIA_RPC_URL in .env}" ;;
  unichain)         : "${UNICHAIN_RPC_URL:?set UNICHAIN_RPC_URL in .env}" ;;
  *) echo "unknown network '$NETWORK' (use unichain_sepolia or unichain)"; exit 1 ;;
esac

VERIFY_FLAG=""
if [ "${VERIFY:-0}" = "1" ]; then
  : "${ETHERSCAN_API_KEY:?set ETHERSCAN_API_KEY to verify}"
  VERIFY_FLAG="--verify"
fi

echo "Deploying → ${NETWORK}"
forge script script/DeployUnichain.s.sol:DeployUnichainScript \
  --rpc-url "$NETWORK" \
  --broadcast \
  --code-size-limit 40000 \
  ${VERIFY_FLAG} \
  -vvv

echo "Manifest written to deployments/unichain.json"
