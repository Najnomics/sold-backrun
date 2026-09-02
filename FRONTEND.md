# Frontend (Opus 4.8 / Claude Code)

This repo ships **production Solidity**. Do not add a mock UI. Build a Uniswap v4 SDK
console (`@uniswap/v4-sdk`, `Pool.getOutputAmount`, `V4PositionManager.addCallParameters`,
StateView reads) the way Fair Flow did.

## Must prove on-chain

1. Retail swap (`hookData` empty) posts `BackrunPosted` / `latestRight`.
2. `SearcherBond.bond` then `SoldBackrunHook.bid(rightId, amount)` in `bidToken`.
3. Winner fill: `hookData = abi.encode(Kind.BackrunFill, rightId, searcher)`.
4. `BackrunSold` + `totalBackrunPaid` ticks (bid + surplus donate).

## Stack

- Vite + React + wagmi + viem
- `@uniswap/v4-sdk` `@uniswap/sdk-core` `@uniswap/universal-router-sdk`
- Addresses from `deployments/unichain.json`
- Chain Unichain Sepolia 1301
- No AI voice in the demo video
