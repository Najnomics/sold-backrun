#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${PRIVATE_KEY:?set PRIVATE_KEY in .env}"
: "${UNICHAIN_SEPOLIA_RPC_URL:?set UNICHAIN_SEPOLIA_RPC_URL in .env}"
forge script script/PopulateTraffic.s.sol:PopulateTrafficScript \
  --rpc-url unichain_sepolia --broadcast --slow -vv
